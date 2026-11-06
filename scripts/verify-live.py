"""Verify a hosted research flow. Credentials arrive on stdin, never CLI flags."""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import httpx
from backend.app.demo import sample

def main():
    print('Waiting for verification credentials on stdin.',flush=True)
    import getpass
    credentials=json.loads(getpass.getpass("Credentials (hidden): ") if sys.stdin.isatty() else sys.stdin.readline())
    url=credentials['url']
    with httpx.Client(base_url=url,timeout=180,headers={'X-Requested-With':'PharmaInspect'}) as client:
        def checked(response):
            if response.status_code>=400:
                print(json.dumps({'failed_url':str(response.url),'status':response.status_code,'detail':response.text[:300]}),flush=True)
            response.raise_for_status()
            return response
        checked(client.post('/api/auth/login',json={'role':'admin','password':credentials['admin']}))
        product=checked(client.get('/api/products')).json()[0]
        image=checked(client.post('/api/images/upload',files={'file':('synthetic-vercel-check.png',sample(),'image/png')})).json()
        inspection=checked(client.post('/api/inspections',json={'product_id':product['id'],'image_ids':[image['id']]})).json()
        result=checked(client.post(f'/api/inspections/{inspection["id"]}/run')).json()
        report=checked(client.get(f'/api/inspections/{inspection["id"]}')).json()
        assert report['status']=='REVIEW REQUIRED',report
        assert len(report['executions'])==10
        assert all(row['status']=='COMPLETED' for row in report['executions'])
        pdf=checked(client.get(f'/api/inspections/{inspection["id"]}/report?format=pdf'))
        assert pdf.content.startswith(b'%PDF')
        checked(client.post(f'/api/inspections/{inspection["id"]}/reviews',json={'disposition':'FURTHER REVIEW','reason':'Synthetic Vercel deployment verification. OCR and physical seal require qualified review.'}))
        checked(client.get('/api/reports/csv'))
        checked(client.get('/api/images/'+image['id']))
    with httpx.Client(base_url=url,timeout=120,headers={'X-Requested-With':'PharmaInspect'}) as second:
        assert second.get('/api/products').status_code==401
        checked(second.post('/api/auth/login',json={'role':'reviewer','password':credentials['reviewer']}))
        persisted=checked(second.get(f'/api/inspections/{inspection["id"]}')).json()
        assert persisted['annotations'][-1]['data']['disposition']=='FURTHER REVIEW'
        assert second.put('/api/settings',json={'ocr':'disabled'}).status_code==403
    print(json.dumps({'status':'verified','url':url,'inspection_id':inspection['id'],'outcome':persisted['status'],'completed_stages':10,'pdf_bytes':len(pdf.content),'private_persistence':'verified across authenticated clients','role_permissions':'verified'}),flush=True)

if __name__=='__main__': main()

