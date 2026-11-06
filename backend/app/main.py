import csv
import hashlib
import hmac
import io
import json
import os
import secrets
import warnings
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from xml.sax.saxutils import escape
from fastapi import FastAPI, HTTPException, Depends, Request, Response, UploadFile, File, BackgroundTasks, Query
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, func, text
from PIL import Image, UnidentifiedImageError
from .db import *
from .schemas import *
from .workflow import AGENTS, run_inspection

AUTH_SECRET=os.environ.get('SESSION_SECRET') or secrets.token_hex(32)
DISCLAIMER='Academic research prototype. Decision support only; final disposition remains with authorized quality personnel.'
Image.MAX_IMAGE_PIXELS=25_000_000

def initialize_workspace():
    # Migrations are the schema source of truth; a fresh developer database is convenient.
    Base.metadata.create_all(engine)
    with Session() as db:
        for inspection in db.scalars(select(Inspection).where(Inspection.status=='RUNNING')):
            inspection.status='ERROR'; inspection.result={'error':'Server restarted during execution; rerun the inspection.'}
        if not db.scalar(select(Product)):
            product=Product(name='Paracetamol',packaging='Carton'); db.add(product); db.flush()
            db.add(Specification(product_id=product.id,version=1,data=SpecificationInput(expected={'product_name':'Paracetamol','strength':'500 mg','dosage_form':'tablets'},required_fields=['product_name','strength','batch_number','manufacturing_date','expiry_date'],expected_components=['carton','label'],seal_required=True).model_dump()))
        db.commit()

@asynccontextmanager
async def lifespan(app):
    initialize_workspace()
    yield

app=FastAPI(title='PharmaInspect AI',version='0.1.0',description=DISCLAIMER,lifespan=lifespan)
@app.middleware('http')
async def protection(request,call_next):
    if request.method in ['POST','PUT','PATCH','DELETE'] and request.headers.get('x-requested-with')!='PharmaInspect':
        return JSONResponse({'detail':'Missing request origin protection header'},status_code=403)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Cache-Control']='no-store'
    return response

def principal(request:Request):
    token=request.cookies.get('pharma_session','')
    try:
        payload,signature=token.rsplit('.',1)
        if not hmac.compare_digest(hmac.new(AUTH_SECRET.encode(),payload.encode(),hashlib.sha256).hexdigest(),signature): raise ValueError()
        role,expiry=payload.split(':')
        if role not in ['admin','reviewer'] or int(expiry)<datetime.now(timezone.utc).timestamp(): raise ValueError()
        return role
    except (ValueError,TypeError): raise HTTPException(401,'Sign in to continue')
def admin(role=Depends(principal)):
    if role!='admin': raise HTTPException(403,'Administrator permission required')
    return role
def get_db():
    with Session() as db: yield db
def require(db,model,id):
    item=db.get(model,id)
    if item is None: raise HTTPException(404,'Record not found')
    return item
def serialize(item):
    result={c.name:getattr(item,c.name) for c in item.__table__.columns}
    for key,value in result.items():
        if isinstance(value,datetime) and value.tzinfo is None: result[key]=value.replace(tzinfo=timezone.utc)
    return result
def audit(db,action,target,actor,data=None): db.add(Audit(action=action,target=target,actor=actor,data=data or {}))
def latest(db,product_id):
    item=db.scalar(select(Specification).where(Specification.product_id==product_id).order_by(Specification.version.desc()))
    if not item: raise HTTPException(409,'Product has no specification')
    return item
def product_data(db,p): return {**serialize(p),'specification':serialize(latest(db,p.id))}
def inspection_data(db,i,detail=False):
    p=db.get(Product,i.product_id); s=db.get(Specification,i.specification_id)
    row={**serialize(i),'product_name':p.name,'packaging':p.packaging,'specification_version':s.version}
    if not detail:
        row['defect_count']=len(i.result.get('defects',[])); row.pop('result')
    else:
        row['executions']=[serialize(x) for x in db.scalars(select(Execution).where(Execution.inspection_id==i.id).order_by(Execution.created_at))]
        row['annotations']=[serialize(x) for x in db.scalars(select(Annotation).where(Annotation.inspection_id==i.id).order_by(Annotation.created_at))]
        row['images']=[{**serialize(require(db,ImageRecord,id)),'url':f'/api/images/{id}'} for id in i.image_ids]
        for image in row['images']: image.pop('path')
    return row

@app.post('/api/auth/login')
def login(body:dict,response:Response):
    role=body.get('role','admin'); password=body.get('password','')
    expected=os.environ.get('ADMIN_PASSWORD','research-only') if role=='admin' else os.environ.get('REVIEWER_PASSWORD','review-only')
    if role not in ['admin','reviewer'] or not isinstance(password,str) or not secrets.compare_digest(password.encode(),expected.encode()): raise HTTPException(401,'Incorrect credentials')
    payload=f'{role}:{int((datetime.now(timezone.utc)+timedelta(hours=8)).timestamp())}'
    token=payload+'.'+hmac.new(AUTH_SECRET.encode(),payload.encode(),hashlib.sha256).hexdigest()
    response.set_cookie('pharma_session',token,httponly=True,samesite='strict',secure=os.environ.get('COOKIE_SECURE')=='1',max_age=28800)
    return {'role':role,'local_development':not bool(os.environ.get('ADMIN_PASSWORD'))}
@app.get('/api/auth/me')
def me(role=Depends(principal)): return {'role':role}
@app.post('/api/auth/logout')
def logout(response:Response): response.delete_cookie('pharma_session'); return {'ok':True}

@app.get('/api/products')
def products(q:str='',offset:int=Query(0,ge=0),limit:int=Query(50,ge=1,le=200),db=Depends(get_db),role=Depends(principal)):
    rows=db.scalars(select(Product).where(Product.name.ilike(f'%{q}%')).order_by(Product.created_at.desc()).offset(offset).limit(limit))
    return [product_data(db,p) for p in rows]
@app.post('/api/products',status_code=201)
def create_product(body:ProductInput,db=Depends(get_db),role=Depends(admin)):
    if body.specification.reference_image_id: require(db,ImageRecord,body.specification.reference_image_id)
    p=Product(name=body.name.strip(),packaging=body.packaging); db.add(p); db.flush()
    db.add(Specification(product_id=p.id,version=1,data=body.specification.model_dump())); audit(db,'PRODUCT_CREATE',p.id,role); db.commit()
    return product_data(db,p)
@app.get('/api/products/{id}')
def get_product(id:str,db=Depends(get_db),role=Depends(principal)): return product_data(db,require(db,Product,id))
@app.put('/api/products/{id}')
def edit_product(id:str,body:ProductInput,db=Depends(get_db),role=Depends(admin)):
    p=require(db,Product,id); p.name=body.name.strip(); p.packaging=body.packaging
    if body.specification.reference_image_id: require(db,ImageRecord,body.specification.reference_image_id)
    version=latest(db,id).version+1
    db.add(Specification(product_id=id,version=version,data=body.specification.model_dump())); audit(db,'PRODUCT_UPDATE',id,role,{'version':version}); db.commit(); return product_data(db,p)
@app.get('/api/products/{id}/specifications')
def specs(id:str,db=Depends(get_db),role=Depends(principal)):
    require(db,Product,id)
    return [serialize(x) for x in db.scalars(select(Specification).where(Specification.product_id==id).order_by(Specification.version.desc()))]
@app.post('/api/products/{id}/specifications',status_code=201)
def add_spec(id:str,body:SpecificationInput,db=Depends(get_db),role=Depends(admin)):
    require(db,Product,id)
    if body.reference_image_id: require(db,ImageRecord,body.reference_image_id)
    spec=Specification(product_id=id,version=latest(db,id).version+1,data=body.model_dump()); db.add(spec); audit(db,'SPECIFICATION_CREATE',id,role); db.commit(); return serialize(spec)

@app.post('/api/images/upload',status_code=201)
async def upload(file:UploadFile=File(...),db=Depends(get_db),role=Depends(principal)):
    maximum_mb=4 if os.environ.get('CLOUD_STORAGE')=='blob-snapshot' else 15
    contents=await file.read(maximum_mb*1024*1024+1)
    if len(contents)>maximum_mb*1024*1024: raise HTTPException(413,f'Maximum file size is {maximum_mb} MB')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(contents)) as im:
                if im.format not in ['JPEG','PNG','WEBP']: raise HTTPException(415,'Use JPG, PNG or WEBP images')
                width,height=im.size; fmt=im.format; im.verify()
            with Image.open(io.BytesIO(contents)) as im: im.load()
    except HTTPException: raise
    except (UnidentifiedImageError,OSError,ValueError,Image.DecompressionBombError,Image.DecompressionBombWarning): raise HTTPException(422,'Corrupted, oversized or unsupported image')
    id=uid(); extension={'JPEG':'jpg','PNG':'png','WEBP':'webp'}[fmt]; path=ROOT/'images'/f'{id}.{extension}'; path.write_bytes(contents)
    row=ImageRecord(id=id,filename=Path(file.filename or 'image').name,path=str(path),meta={'width':width,'height':height,'format':fmt,'bytes':len(contents),'sha256':hashlib.sha256(contents).hexdigest()})
    db.add(row); audit(db,'IMAGE_UPLOAD',id,role); db.commit()
    return {'id':id,'filename':row.filename,'meta':row.meta,'url':f'/api/images/{id}'}
@app.get('/api/images/{id}')
def get_image(id:str,db=Depends(get_db),role=Depends(principal)): return FileResponse(require(db,ImageRecord,id).path)
@app.get('/api/images/{id}/metadata')
def image_meta(id:str,db=Depends(get_db),role=Depends(principal)): return require(db,ImageRecord,id).meta
@app.get('/api/images/{id}/processed')
def processed_image(id:str,run_id:str,db=Depends(get_db),role=Depends(principal)):
    import uuid
    try: uuid.UUID(run_id)
    except ValueError: raise HTTPException(422,'Invalid run ID')
    image=require(db,ImageRecord,id); path=Path(image.path).with_name(f'{id}-{run_id}-processed.png')
    if not path.is_file(): raise HTTPException(404,'Processed image unavailable')
    return FileResponse(path)

@app.post('/api/inspections',status_code=201)
def create_inspection(body:InspectionInput,db=Depends(get_db),role=Depends(principal)):
    require(db,Product,body.product_id)
    for id in body.image_ids: require(db,ImageRecord,id)
    i=Inspection(product_id=body.product_id,specification_id=latest(db,body.product_id).id,image_ids=list(dict.fromkeys(body.image_ids)))
    db.add(i); db.flush(); audit(db,'INSPECTION_CREATE',i.id,role); db.commit(); return inspection_data(db,i,True)
@app.get('/api/inspections')
def inspections(q:str='',product_id:str='',status:str='',date_from:str='',date_to:str='',offset:int=Query(0,ge=0),limit:int=Query(50,ge=1,le=200),db=Depends(get_db),role=Depends(principal)):
    query=select(Inspection).join(Product).where((Product.name.ilike(f'%{q}%'))|(Inspection.id.ilike(f'%{q}%')))
    if product_id: query=query.where(Inspection.product_id==product_id)
    if status: query=query.where(Inspection.status==status)
    for value,is_end in [(date_from,False),(date_to,True)]:
        if value:
            try: dt=datetime.strptime(value,'%Y-%m-%d').replace(tzinfo=timezone.utc)
            except ValueError: raise HTTPException(422,'Dates must use YYYY-MM-DD')
            query=query.where(Inspection.created_at<dt+timedelta(days=1)) if is_end else query.where(Inspection.created_at>=dt)
    return [inspection_data(db,i) for i in db.scalars(query.order_by(Inspection.created_at.desc()).offset(offset).limit(limit))]
@app.get('/api/inspections/{id}')
@app.get('/api/inspections/{id}/results')
def inspection(id:str,db=Depends(get_db),role=Depends(principal)): return inspection_data(db,require(db,Inspection,id),True)
@app.post('/api/inspections/{id}/run',status_code=202)
@app.post('/api/inspections/{id}/rerun',status_code=202)
def run(id:str,tasks:BackgroundTasks,db=Depends(get_db),role=Depends(principal)):
    require(db,Inspection,id)
    # Atomic claim prevents concurrent starts and duplicate workers.
    from sqlalchemy import update
    run_id=uid()
    claimed=db.execute(update(Inspection).where(Inspection.id==id,Inspection.status!='RUNNING').values(status='RUNNING',result={'run_id':run_id}))
    if not claimed.rowcount: raise HTTPException(409,'Inspection is already running')
    audit(db,'INSPECTION_RUN',id,role,{'run_id':run_id}); db.commit()
    if os.environ.get('CLOUD_STORAGE')=='blob-snapshot':
        run_inspection(id,run_id)
        db.expire_all()
        return {'id':id,'status':db.get(Inspection,id).status,'run_id':run_id}
    tasks.add_task(run_inspection,id,run_id)
    return {'id':id,'status':'RUNNING','run_id':run_id}
@app.get('/api/inspections/{id}/defects')
def defects(id:str,db=Depends(get_db),role=Depends(principal)): return require(db,Inspection,id).result.get('defects',[])
@app.get('/api/inspections/{id}/ocr')
def ocr(id:str,db=Depends(get_db),role=Depends(principal)): return require(db,Inspection,id).result.get('fields',{})
@app.get('/api/inspections/{id}/runs')
def inspection_runs(id:str,db=Depends(get_db),role=Depends(principal)):
    require(db,Inspection,id)
    return [serialize(x) for x in db.scalars(select(InspectionReport).where(InspectionReport.inspection_id==id).order_by(InspectionReport.created_at.desc()))]
def find_defect(db,id):
    for inspection in db.scalars(select(Inspection)):
        for defect in inspection.result.get('defects',[]):
            if defect['id']==id: return inspection,defect
    raise HTTPException(404,'Finding not found')
@app.get('/api/defects/{id}')
def get_defect(id:str,db=Depends(get_db),role=Depends(principal)):
    inspection,defect=find_defect(db,id)
    return {**defect,'inspection_id':inspection.id}
@app.put('/api/defects/{id}/annotation')
def annotate_defect(id:str,body:AnnotationInput,db=Depends(get_db),role=Depends(principal)):
    inspection,defect=find_defect(db,id)
    a=Annotation(inspection_id=inspection.id,kind='DEFECT_ANNOTATION',data={**body.model_dump(),'defect_id':id},actor=role)
    db.add(a); audit(db,'DEFECT_ANNOTATION',id,role,body.model_dump()); db.commit(); return serialize(a)
@app.put('/api/inspections/{id}/ocr/corrections')
def correct(id:str,body:AnnotationInput,db=Depends(get_db),role=Depends(principal)):
    inspection=require(db,Inspection,id)
    a=Annotation(inspection_id=id,kind='OCR_CORRECTION',data={**body.model_dump(),'run_id':inspection.result.get('run_id')},actor=role); db.add(a); audit(db,'OCR_ANNOTATION',id,role,body.model_dump()); db.commit(); return serialize(a)
@app.post('/api/inspections/{id}/reviews',status_code=201)
def review(id:str,body:ReviewInput,db=Depends(get_db),role=Depends(principal)):
    row=require(db,Inspection,id)
    if row.status in ['QUEUED','RUNNING','ERROR']: raise HTTPException(409,'Complete the inspection before reviewing')
    a=Annotation(inspection_id=id,kind='HUMAN_REVIEW',data={**body.model_dump(),'run_id':row.result.get('run_id')},actor=role); db.add(a); audit(db,'HUMAN_REVIEW',id,role,body.model_dump()); db.commit(); return serialize(a)
@app.get('/api/agents')
def agents(role=Depends(principal)): return [{'id':id,'name':name,'responsibility':description} for id,name,description in AGENTS]
@app.get('/api/agents/executions')
def executions(inspection_id:str='',db=Depends(get_db),role=Depends(principal)):
    query=select(Execution)
    if inspection_id: query=query.where(Execution.inspection_id==inspection_id)
    return [serialize(x) for x in db.scalars(query.order_by(Execution.created_at.desc()).limit(200))]
@app.get('/api/agents/executions/{id}')
def execution(id:str,db=Depends(get_db),role=Depends(principal)): return serialize(require(db,Execution,id))

@app.get('/api/analytics/dashboard')
@app.get('/api/analytics/inspections')
@app.get('/api/analytics/defects')
def analytics(db=Depends(get_db),role=Depends(principal)):
    rows=list(db.scalars(select(Inspection).order_by(Inspection.created_at)))
    counts=Counter(i.status for i in rows); days={}; defects=Counter(); severity=Counter(); durations=[]
    for i in rows:
        date=i.created_at.strftime('%d %b'); days.setdefault(date,{'date':date,'inspections':0,'review':0,'fail':0,'pass':0}); days[date]['inspections']+=1
        key={'PASS':'pass','FAIL':'fail','REVIEW REQUIRED':'review','INSUFFICIENT IMAGE':'review'}.get(i.status)
        if key: days[date][key]+=1
        for d in i.result.get('defects',[]): defects[d['type']]+=1; severity[d['severity']]+=1
    for run_id in db.scalars(select(Execution.run_id).distinct()):
        durations.append(db.scalar(select(func.sum(Execution.duration_ms)).where(Execution.run_id==run_id)) or 0)
    return {'total':len(rows),'passed':counts['PASS'],'failed':counts['FAIL'],'review':counts['REVIEW REQUIRED']+counts['INSUFFICIENT IMAGE'],'defect_count':sum(defects.values()),'trends':list(days.values())[-30:],'distribution':[{'name':k,'value':v} for k,v in counts.items()],'defects':[{'name':k,'value':v} for k,v in defects.most_common()],'severity':[{'name':k,'value':v} for k,v in severity.items()],'mean_duration_ms':round(sum(durations)/len(durations)) if durations else 0,'recent':[inspection_data(db,i) for i in reversed(rows[-6:])]}
@app.get('/api/analytics/models')
def model_metrics(role=Depends(principal)): return {'accuracy':None,'precision':None,'recall':None,'reason':'No labeled evaluation dataset has been evaluated. Model confidence is not a calibrated defect probability.'}
@app.get('/api/settings')
def settings(db=Depends(get_db),role=Depends(principal)):
    config=db.get(Configuration,'models'); return ModelConfig.model_validate(config.data if config else {}).model_dump()
@app.put('/api/settings')
def save_settings(body:ModelConfig,db=Depends(get_db),role=Depends(admin)):
    row=db.get(Configuration,'models')
    if not row: row=Configuration(id='models'); db.add(row)
    row.data=body.model_dump(); audit(db,'SETTINGS_UPDATE','models',role,row.data); db.commit(); return row.data
@app.get('/api/audit')
def audit_log(db=Depends(get_db),role=Depends(admin)): return [serialize(x) for x in db.scalars(select(Audit).order_by(Audit.created_at.desc()).limit(100))]

@app.get('/api/inspections/{id}/report')
def export_report(id:str,format:str='json',db=Depends(get_db),role=Depends(principal)):
    i=require(db,Inspection,id); data=jsonable_encoder(inspection_data(db,i,True))
    if format=='json': return JSONResponse(data,headers={'Content-Disposition':f'attachment; filename="inspection-{id}.json"'})
    if format!='pdf': raise HTTPException(422,'Report format must be json or pdf')
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as PDFImage
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    buffer=io.BytesIO(); styles=getSampleStyleSheet(); story=[]
    def paragraph(value,style='BodyText'): story.append(Paragraph(escape(str(value)),styles[style])); story.append(Spacer(1,8))
    paragraph('PharmaInspect AI','Title'); paragraph('Packaging inspection report','Heading2'); paragraph(DISCLAIMER)
    for key,value in [('Inspection',id),('Product',data['product_name']),('Specification version',data['specification_version']),('Created',data['created_at']),('Outcome',i.status)]: paragraph(f'{key}: {value}')
    for image in data['images']:
        paragraph('Source image: '+image['filename'],'Heading2')
        pdf_image=PDFImage(require(db,ImageRecord,image['id']).path); pdf_image._restrictSize(6*inch,3*inch); story.append(pdf_image)
    paragraph('Expected versus observed','Heading2')
    for c in i.result.get('comparisons',[]): paragraph(f'{c["field"]}: expected {c["expected"]}; observed {c["observed"]}; {c["status"]}. {c["explanation"]}')
    paragraph('Findings and severity','Heading2')
    for d in i.result.get('defects',[]):
        paragraph(f'{d["type"]}: {d["severity"]}; score {d["confidence"]}; rule {d["rule"]}. Evidence: {d["evidence"]}. Source region: {d["bbox"]}.')
    paragraph('OCR source evidence','Heading2')
    for image in i.result.get('images',[]):
        paragraph('Image '+image['id'])
        paragraph(image.get('ocr',{}).get('raw_text') or 'No OCR text extracted.')
        paragraph('Image quality: '+str(image.get('quality',{})))
        paragraph('Preprocessing: '+str(image.get('preprocessing',{}).get('operations',[])))
    paragraph('Reasoning summary','Heading2')
    paragraph(i.result.get('reasoning',{}).get('summary','No reasoning summary available.'))
    paragraph('Limitations and uncertainty','Heading2')
    for limitation in i.result.get('limitations',[]): paragraph(limitation)
    paragraph('Human annotations and reviews','Heading2')
    for a in data['annotations']: paragraph(f'{a["created_at"]} | {a["actor"]} | {a["kind"]}: {a["data"]}')
    paragraph('Execution trace','Heading2')
    for x in data['executions']: paragraph(f'{x["agent"]}: {x["status"]}, {x["duration_ms"]} ms, run {x["run_id"]}')
    SimpleDocTemplate(buffer).build(story); buffer.seek(0)
    return StreamingResponse(buffer,media_type='application/pdf',headers={'Content-Disposition':f'attachment; filename="inspection-{id}.pdf"'})
@app.get('/api/reports/csv')
def csv_report(db=Depends(get_db),role=Depends(principal)):
    buffer=io.StringIO(); writer=csv.writer(buffer); writer.writerow(['inspection_id','product','timestamp','status','specification_version','defects'])
    for i in db.scalars(select(Inspection).order_by(Inspection.created_at.desc())):
        d=inspection_data(db,i); name=d['product_name']; name="'"+name if name.startswith(('=','+','-','@')) else name
        writer.writerow([i.id,name,i.created_at.isoformat(),i.status,d['specification_version'],d['defect_count']])
    return Response(buffer.getvalue(),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="pharmainspect-inspections.csv"'})
@app.get('/api/health')
def health(): return {'status':'ok','mode':'research prototype'}
@app.get('/api/demo/sample')
def demo_sample(variant:str='clear'):
    from .demo import sample
    if variant not in ['clear','mismatch','blurred']: raise HTTPException(422,'Unknown sample variant')
    return Response(sample(variant),media_type='image/png',headers={'Content-Disposition':f'attachment; filename="synthetic-{variant}.png"'})
@app.get('/api/health/database')
def health_database(db=Depends(get_db),role=Depends(principal)): db.execute(text('SELECT 1')); return {'status':'ok'}
@app.get('/api/health/models')
def health_models(role=Depends(principal)):
    import shutil
    return {'ocr_tesseract':bool(os.environ.get('TESSERACT_CMD') or shutil.which('tesseract')),'trained_defect_model':False,'baseline':'OpenCV contours, image quality, deterministic rules','vlm_default':'baseline evidence summary'}

# Serving a built React application keeps cookies and API on the same origin.
DIST=Path(__file__).resolve().parents[2]/'dist'
if DIST.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount('/assets',StaticFiles(directory=DIST/'assets'),name='assets')
    @app.get('/{path:path}')
    def spa(path:str):
        if path.startswith('api/'): raise HTTPException(404,'API endpoint not found')
        return FileResponse(DIST/'index.html')
