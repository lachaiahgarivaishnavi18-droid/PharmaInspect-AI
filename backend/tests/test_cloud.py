import io
import tarfile
from datetime import datetime, timezone
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from backend.app.cloud import BlobWorkspaceMiddleware, restore_workspace, REVISIONS


def test_snapshot_rejects_path_traversal(tmp_path):
    content = io.BytesIO()
    with tarfile.open(fileobj=content,mode='w:gz') as archive:
        info=tarfile.TarInfo('../escape'); info.size=3
        archive.addfile(info,io.BytesIO(b'bad'))
    with pytest.raises(ValueError,match='Invalid workspace'):
        restore_workspace(tmp_path,content.getvalue())
    assert not (tmp_path.parent/'escape').exists()


def test_private_snapshot_persistence_and_failed_write_rollback(monkeypatch):
    from vercel import blob
    from backend.app.main import app
    from backend.app.db import Session, Product
    store={}; serial=0
    async def put(path,body,**kwargs):
        nonlocal serial
        assert kwargs['access']=='private'
        if path in store and not kwargs.get('allow_overwrite'):
            raise blob.BlobError('already exists',status_code=409)
        serial+=1
        meta=SimpleNamespace(pathname=path,url='https://test.private.blob.vercel-storage.com/'+path,etag=str(serial),uploaded_at=datetime.now(timezone.utc))
        store[path]=(bytes(body),meta)
        return meta
    async def head(path):
        if path not in store: raise blob.BlobNotFoundError('missing',status_code=404)
        return store[path][1]
    async def get(url,**kwargs):
        path=url.split('.com/',1)[1].split('?',1)[0]
        return SimpleNamespace(body=store[path][0],metadata=store[path][1])
    async def delete(path,**kwargs):
        if isinstance(path,list):
            for name in path: del store[name]
            return
        assert store[path][1].etag==kwargs['if_match']
        del store[path]
    async def query(**kwargs):
        for path,(_,metadata) in list(store.items()):
            if path.startswith(kwargs.get('prefix','')): yield metadata
    monkeypatch.setattr(blob,'put_blob',put);monkeypatch.setattr(blob,'head_blob',head)
    monkeypatch.setattr(blob,'get_blob',get);monkeypatch.setattr(blob,'delete_blob',delete)
    monkeypatch.setattr(blob,'query_blobs',query)
    monkeypatch.setenv('CLOUD_STORAGE','blob-snapshot')
    headers={'X-Requested-With':'PharmaInspect'}
    with TestClient(BlobWorkspaceMiddleware(app)) as client:
        assert client.get('/api/products').status_code==401
        assert not store
        client.post('/api/auth/login',json={'password':'research-only'},headers=headers)
        original=client.get('/api/products').json()[0]
        assert any(name.startswith(REVISIONS) for name in store)
        with Session() as db:
            row=db.get(Product,original['id']); row.name='Unsaved cache-only change';db.commit()
        assert client.get('/api/products').json()[0]['name']==original['name']
        created=client.post('/api/products',json={'name':'Durable cloud product'},headers=headers)
        assert created.status_code==201,created.text
        assert any(p['name']=='Durable cloud product' for p in client.get('/api/products').json())
        saved=dict(store)
        async def failing_put(path,body,**kwargs):
            if path.startswith(REVISIONS): raise blob.BlobServiceNotAvailable('test storage failure')
            return await put(path,body,**kwargs)
        monkeypatch.setattr(blob,'put_blob',failing_put)
        failed=client.post('/api/products',json={'name':'Must not be acknowledged'},headers=headers)
        assert failed.status_code==503
        assert store==saved
        assert not any(p['name']=='Must not be acknowledged' for p in client.get('/api/products').json())
