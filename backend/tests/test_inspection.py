import io
import os
import tempfile
os.environ['DATA_DIR']=tempfile.mkdtemp(prefix='pharmainspect-test-')
from fastapi.testclient import TestClient
from PIL import Image
from backend.app.main import app
from backend.app.vision import parse_date,compare,fields_from_regions
from backend.app.schemas import SpecificationInput
from backend.app.demo import sample

HEADERS={'X-Requested-With':'PharmaInspect'}
def test_date_ambiguity_and_invalid_dates():
    assert parse_date('03/04/2026',['%d/%m/%Y','%m/%d/%Y'])[1]=='AMBIGUOUS'
    assert parse_date('2026-02-30',['%Y-%m-%d'])[1]=='INVALID'
    assert str(parse_date('02/2028',['%m/%Y'],True)[0])=='2028-02-29'
def test_comparison_preserves_expected_and_missing_evidence():
    spec=SpecificationInput(expected={'strength':'500 mg'}).model_dump()
    fields={'strength':{'value':'250 mg','confidence':.99,'bbox':[1,2,3,4],'image_id':'x','conflicting_values':[]}}
    results=compare(fields,spec,[])
    strength=next(r for r in results if r['field']=='strength')
    assert strength['status']=='MISMATCH' and strength['expected']=='500 mg' and strength['observed']=='250 mg'
    assert next(r for r in results if r['field']=='expiry_date')['status']=='MISSING'
def test_low_confidence_mismatch_requires_review():
    spec=SpecificationInput(expected={'strength':'500 mg'}).model_dump()
    result=compare({'strength':{'value':'250 mg','confidence':.3,'conflicting_values':[]}},spec,[])
    assert next(r for r in result if r['field']=='strength')['status']=='UNCERTAIN'
def test_ocr_conflict_and_date_order():
    regions=[{'text':'Batch: ABC12','confidence':.95,'bbox':[1,2,30,40],'image_id':'a'}, {'text':'Batch: XYZ34','confidence':.9,'bbox':[1,2,30,40],'image_id':'b'}]
    fields=fields_from_regions(regions,{})
    assert fields['batch_number']['conflicting_values']==['XYZ34']
    spec=SpecificationInput().model_dump()
    dates={k:{'value':v,'confidence':.99,'conflicting_values':[]} for k,v in [('manufacturing_date','2026-10-15'),('expiry_date','2025-10-15')]}
    assert next(r for r in compare(dates,spec,[]) if r['field']=='date_order')['status']=='MISMATCH'
def test_full_inspection_review_export_and_auth():
    with TestClient(app) as c:
        assert c.get('/api/products').status_code==401
        assert c.post('/api/auth/login',json={'password':'research-only'}).status_code==403
        assert c.post('/api/auth/login',json={'password':'research-only'},headers=HEADERS).status_code==200
        product=c.get('/api/products').json()[0]
        image=c.post('/api/images/upload',files={'file':('sample.png',sample(),'image/png')},headers=HEADERS)
        assert image.status_code==201,image.text
        uploaded=image.json()
        created=c.post('/api/inspections',json={'product_id':product['id'],'image_ids':[uploaded['id']]},headers=HEADERS)
        assert created.status_code==201,created.text
        id=created.json()['id']
        run=c.post(f'/api/inspections/{id}/run',headers=HEADERS)
        assert run.status_code==202,run.text
        data=c.get(f'/api/inspections/{id}').json()
        assert data['status']=='REVIEW REQUIRED',data['result']
        assert len(data['executions'])==10
        assert all(x['status']=='COMPLETED' for x in data['executions'])
        assert data['specification_version']==1
        original=data['result'].get('fields',{})
        response=c.put(f'/api/inspections/{id}/ocr/corrections',json={'field':'batch_number','value':'HUMAN123','reason':'Manually checked original image'},headers=HEADERS)
        assert response.status_code==200
        assert c.get(f'/api/inspections/{id}').json()['result']['fields']==original
        assert c.post(f'/api/inspections/{id}/reviews',json={'disposition':'FURTHER REVIEW','reason':'Seal not visible in supplied view'},headers=HEADERS).status_code==201
        pdf=c.get(f'/api/inspections/{id}/report?format=pdf')
        assert pdf.status_code==200 and pdf.content.startswith(b'%PDF')
        assert len(c.get(f'/api/inspections/{id}/report').json()['annotations'])==2
        assert c.get('/api/reports/csv').status_code==200
        assert c.get('/api/analytics/dashboard').json()['total']==1
        # Edits do not change the specification pinned to an earlier inspection.
        spec=product['specification']['data']; spec['expected']['strength']='250 mg'
        assert c.post(f'/api/products/{product["id"]}/specifications',json=spec,headers=HEADERS).status_code==201
        assert c.get(f'/api/inspections/{id}').json()['specification_version']==1
        assert c.post(f'/api/inspections/{id}/rerun',headers=HEADERS).status_code==202
        assert len(c.get(f'/api/inspections/{id}').json()['executions'])==20
        assert len(c.get(f'/api/inspections/{id}/runs').json())==2
        c.post('/api/auth/logout',headers=HEADERS)
        c.post('/api/auth/login',json={'role':'reviewer','password':'review-only'},headers=HEADERS)
        assert c.put('/api/settings',json={'ocr':'disabled'},headers=HEADERS).status_code==403
        assert c.post('/api/products',json={'name':'Unauthorized'},headers=HEADERS).status_code==403
def test_corrupt_and_insufficient_image():
    with TestClient(app) as c:
        c.post('/api/auth/login',json={'password':'research-only'},headers=HEADERS)
        assert c.post('/api/images/upload',files={'file':('bad.png',b'not an image','image/png')},headers=HEADERS).status_code==422
        buffer=io.BytesIO(); Image.new('RGB',(400,400),'black').save(buffer,format='PNG')
        image=c.post('/api/images/upload',files={'file':('dark.png',buffer.getvalue(),'image/png')},headers=HEADERS).json()
        p=c.get('/api/products').json()[0]
        id=c.post('/api/inspections',json={'product_id':p['id'],'image_ids':[image['id']]},headers=HEADERS).json()['id']
        c.post(f'/api/inspections/{id}/run',headers=HEADERS)
        data=c.get(f'/api/inspections/{id}').json()
        assert data['status']=='INSUFFICIENT IMAGE'
        assert [x['agent'] for x in data['executions']]==['acquisition','decision','report']
def test_upload_limits_and_invalid_dates():
    with TestClient(app) as c:
        c.post('/api/auth/login',json={'password':'research-only'},headers=HEADERS)
        assert c.post('/api/images/upload',files={'file':('large.png',b'0'*(15*1024*1024+1),'image/png')},headers=HEADERS).status_code==413
        assert c.get('/api/inspections?date_from=not-a-date').status_code==422
        assert c.post('/api/products',json={'name':'X','specification':{'date_formats':['%unknown']}},headers=HEADERS).status_code==422
def test_confirmed_mismatch_full_workflow(monkeypatch):
    from backend.app import vision
    def known_text(rgb,provider):
        values=['Product: Paracetamol','Strength: 250 mg','Tablets','Batch: ABC123','MFG: 2026-01-15','EXP: 2028-01-15']
        return {'regions':[{'text':v,'confidence':.99,'bbox':[220,250+i*50,800,290+i*50]} for i,v in enumerate(values)],'raw_text':'\n'.join(values),'available':True,'error':None}
    monkeypatch.setattr(vision,'ocr',known_text)
    with TestClient(app) as c:
        c.post('/api/auth/login',json={'password':'research-only'},headers=HEADERS)
        product=c.post('/api/products',json={'name':'Mismatch test','specification':{'expected':{'strength':'500 mg'},'required_fields':['strength']}},headers=HEADERS).json()
        image=c.post('/api/images/upload',files={'file':('sample.png',sample('mismatch'),'image/png')},headers=HEADERS).json()
        id=c.post('/api/inspections',json={'product_id':product['id'],'image_ids':[image['id']]},headers=HEADERS).json()['id']
        c.post(f'/api/inspections/{id}/run',headers=HEADERS)
        data=c.get(f'/api/inspections/{id}').json()
        assert data['status']=='FAIL',data['result']
        defect=next(d for d in data['result']['defects'] if d['type']=='Strength')
        assert defect['severity']=='Critical' and defect['bbox']==[220,300,800,340]
        assert c.get(f'/api/defects/{defect["id"]}').status_code==200
        assert c.put(f'/api/defects/{defect["id"]}/annotation',json={'field':'strength','value':'250 mg','reason':'Test reviewer confirmed printed strength'},headers=HEADERS).status_code==200
def test_failed_provider_does_not_fabricate_remaining_logs(monkeypatch):
    from backend.app import vision
    def broken(*args): raise RuntimeError('Deliberate provider failure')
    monkeypatch.setattr(vision.BaselineProvider,'reason',broken)
    with TestClient(app) as c:
        c.post('/api/auth/login',json={'password':'research-only'},headers=HEADERS)
        product=c.get('/api/products').json()[0]
        image=c.post('/api/images/upload',files={'file':('sample.png',sample(),'image/png')},headers=HEADERS).json()
        id=c.post('/api/inspections',json={'product_id':product['id'],'image_ids':[image['id']]},headers=HEADERS).json()['id']
        c.post(f'/api/inspections/{id}/run',headers=HEADERS)
        data=c.get(f'/api/inspections/{id}').json()
        assert data['status']=='ERROR'
        assert len(data['executions'])==7
        assert data['executions'][-1]['status']=='ERROR'
        assert 'Deliberate provider failure' in data['result']['error']
