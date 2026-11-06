import time
from pathlib import Path
from typing import TypedDict
from sqlalchemy import select
from langgraph.graph import StateGraph, START, END
from .db import Session, Inspection, Specification, ImageRecord, Execution, Configuration, InspectionReport, uid, now
from .schemas import ModelConfig
from . import vision

AGENTS = [
 ('acquisition','Image acquisition & validation','Measure quality and validate inspection inputs'),
 ('preprocessing','Image preprocessing','Create enhanced derivatives; retain original evidence'),
 ('detection','Packaging object detection','Locate candidate regions or run configured YOLO weights'),
 ('defects','Packaging defect detection','Compare reference appearance and expose detector limitations'),
 ('ocr','OCR & text extraction','Extract visible text, fields, confidence and QR content'),
 ('specification','Specification validation','Compare observations against the pinned specification'),
 ('reasoning','Vision-language reasoning','Explain evidence with the selected provider'),
 ('severity','Defect severity classification','Apply explicit research severity rules'),
 ('decision','QC decision support','Combine uncertainty, quality and configured rejection rules'),
 ('report','Orchestration & report','Preserve traceability and produce a reviewable report'),
]
class State(TypedDict):
    inspection_id: str
    run_id: str
    evidence: dict

def acquisition(e):
    for image in e['images']:
        image['quality']=vision.quality(vision.load_image(image['path']),e['config'])
        if not image['quality']['sufficient']:
            e['limitations'].extend(f'{image["filename"]}: {issue}' for issue in image['quality']['issues'])
    if any(not image['quality']['sufficient'] for image in e['images']):
        e['limitations'].append('Conditional quality gate skipped model/OCR stages because reliable inspection was not possible.')
    e['limitations'].append('Single-view image coverage cannot establish package integrity or hidden components.')
def preprocessing(e):
    for image in e['images']:
        path=Path(image['path']).with_name(f'{image["id"]}-{e["run_id"]}-processed.png')
        image['preprocessing']=vision.preprocess(vision.load_image(image['path']),path)
        image['processed_url']=f'/api/images/{image["id"]}/processed?run_id={e["run_id"]}'
def detection(e):
    for image in e['images']:
        image['objects']=vision.detect(vision.load_image(image['path']),e['config']['yolo_weights'])
        for obj in image['objects']: obj['image_id']=image['id']
    if not e['config']['yolo_weights']: e['limitations'].append('Contour baseline locates candidate regions only; packaging classes and components are unverified. No trained defect detector is configured.')
    if any(o.get('touches_border') for i in e['images'] for o in i['objects']): e['limitations'].append('Candidate package touches the image boundary; framing may be incomplete.')
def defects(e):
    e['visual_findings']=[]
    if e.get('reference_path'):
        for image in e['images']:
            image['reference_comparison']=vision.reference_difference(vision.load_image(image['path']),e['reference_path'])
        e['limitations'].append('Reference comparison measures appearance differences; it is not a validated physical defect classifier.')
    if e['spec']['seal_required']: e['limitations'].append('Required security seal cannot be verified by the baseline. Human seal inspection required.')
    if e['spec']['expected_components']: e['limitations'].append('Expected component completeness requires human verification: '+', '.join(e['spec']['expected_components']))
def ocr(e):
    regions=[]; codes=[]
    for image in e['images']:
        rgb=vision.load_image(image['path'])
        output=vision.ocr(rgb,e['config']['ocr'])
        for region in output['regions']: region['image_id']=image['id']
        image['ocr']=output
        image['codes']=vision.qr_codes(rgb)
        regions.extend(output['regions']); codes.extend(c['value'] for c in image['codes'])
        if not output['available']: e['limitations'].append(output['error'])
    e['fields']=vision.fields_from_regions(regions,e['spec'])
    e['barcode_values']=codes
    e['limitations'].append('Baseline decoder supports QR codes. Linear barcode inspection needs an additional decoder.')
def specification(e): e['comparisons']=vision.compare(e['fields'],e['spec'],e['barcode_values'])
def reasoning(e):
    provider=vision.OllamaProvider(e['config']['ollama_model']) if e['config']['vlm']=='ollama' else vision.BaselineProvider()
    result=provider.reason([i['path'] for i in e['images']],{'comparisons':e['comparisons'],'limitations':e['limitations'],'fields':e['fields']})
    e['reasoning']=result.model_dump()
def severity(e):
    e['defects']=[]
    for comparison in e['comparisons']:
        if comparison['status']=='MATCH': continue
        field=comparison['field']; mismatch=comparison['status']=='MISMATCH'
        level='Critical' if mismatch and field in ['product_name','strength','barcode'] else 'Major'
        e['defects'].append({'id':uid(),'type':field.replace('_',' ').title(),'severity':level,'confidence':comparison['confidence'],'evidence_type':'specification mismatch' if mismatch else 'missing or uncertain OCR','evidence':comparison,'bbox':comparison['evidence']['bbox'] if comparison.get('evidence') else None,'image_id':comparison['evidence']['image_id'] if comparison.get('evidence') else None,'rule':'SPEC-MISMATCH' if mismatch else 'REVIEW-INCOMPLETE','requires_review':True})
def decision(e):
    insufficient=any(not i['quality']['sufficient'] for i in e['images'])
    mismatch=any(c['status']=='MISMATCH' for c in e.get('comparisons',[]))
    if insufficient: e['outcome']='INSUFFICIENT IMAGE'
    elif mismatch and e['spec']['fail_on_mismatch']: e['outcome']='FAIL'
    elif e['limitations'] or e.get('defects',[]): e['outcome']='REVIEW REQUIRED'
    else: e['outcome']='PASS'
    e['human_review_required']=True
def report(e):
    e['completed_at']=now().isoformat()
    e['disclaimer']='Academic research decision support only. No regulatory certification. Final product disposition requires authorized quality personnel.'
    e['limitations']=list(dict.fromkeys(e['limitations']))

STAGES=[acquisition,preprocessing,detection,defects,ocr,specification,reasoning,severity,decision,report]
def make_node(index):
    def node(state):
        started=time.perf_counter()
        with Session() as db:
            log=Execution(inspection_id=state['inspection_id'],run_id=state['run_id'],agent=AGENTS[index][0],status='RUNNING',detail={'input':'Pinned specification and prior stage evidence'})
            db.add(log); db.commit(); log_id=log.id
        try:
            STAGES[index](state['evidence'])
        except Exception as exc:
            with Session() as db:
                log=db.get(Execution,log_id); log.status='ERROR'; log.duration_ms=round((time.perf_counter()-started)*1000); log.detail={'error':str(exc)[:1000]}; db.commit()
            raise
        with Session() as db:
            log=db.get(Execution,log_id); log.status='COMPLETED'; log.duration_ms=round((time.perf_counter()-started)*1000)
            log.detail={'output':{k:v for k,v in state['evidence'].items() if k not in ['config','reference_path']},'image_count':len(state['evidence']['images'])}
            db.commit()
        return {'evidence':state['evidence']}
    return node

builder=StateGraph(State)
for index,(key,_,_) in enumerate(AGENTS): builder.add_node(key,make_node(index))
builder.add_edge(START,AGENTS[0][0])
builder.add_conditional_edges('acquisition',lambda state: 'preprocessing' if all(i['quality']['sufficient'] for i in state['evidence']['images']) else 'decision',{'preprocessing':'preprocessing','decision':'decision'})
for a,b in zip(AGENTS[1:],AGENTS[2:]): builder.add_edge(a[0],b[0])
builder.add_edge(AGENTS[-1][0],END)
graph=builder.compile()

def run_inspection(inspection_id,run_id=None):
    run_id=run_id or uid()
    try:
        with Session() as db:
            inspection=db.get(Inspection,inspection_id)
            spec=db.get(Specification,inspection.specification_id)
            config=db.get(Configuration,'models')
            images=[db.get(ImageRecord,i) for i in inspection.image_ids]
            reference=db.get(ImageRecord,spec.data['reference_image_id']) if spec.data.get('reference_image_id') else None
            evidence={'inspection_id':inspection_id,'run_id':run_id,'specification_id':spec.id,'specification_version':spec.version,'spec':spec.data,'config':ModelConfig.model_validate(config.data if config else {}).model_dump(),'images':[{'id':i.id,'filename':i.filename,'path':i.path,'url':f'/api/images/{i.id}'} for i in images],'limitations':[],'reference_path':reference.path if reference else None}
        output=graph.invoke({'inspection_id':inspection_id,'run_id':run_id,'evidence':evidence})['evidence']
        with Session() as db:
            inspection=db.get(Inspection,inspection_id); inspection.status=output['outcome']; inspection.result=output
            db.add(InspectionReport(inspection_id=inspection_id,run_id=run_id,data=output)); db.commit()
    except Exception as exc:
        with Session() as db:
            inspection=db.get(Inspection,inspection_id); inspection.status='ERROR'; inspection.result={'error':str(exc)[:1000],'run_id':run_id,'human_review_required':True}; db.commit()
