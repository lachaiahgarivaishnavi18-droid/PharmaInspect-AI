"""Small research-workspace persistence for stateless Vercel Functions.

A private Blob snapshot holds SQLite and its evidence images. A conditional
create/delete lease serializes workspace access across instances. This is a
bounded, low-volume prototype adapter, not a high-throughput database service.
"""
import asyncio
import io
import json
import logging
import os
import tarfile
import time
from uuid import uuid4
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from starlette.requests import Request
from starlette.responses import JSONResponse

LOGGER = logging.getLogger(__name__)
SNAPSHOT = 'workspace/state.tar.gz'
REVISIONS = 'workspace/revisions/'
LEASE = 'workspace/lease.json'
MAX_BYTES = 96 * 1024 * 1024
LEASE_SECONDS = 360


def pack_workspace(root):
    buffer = io.BytesIO()
    files = [root / 'pharmainspect.db', *sorted((root / 'images').glob('*'))]
    files = [path for path in files if path.is_file()]
    if sum(path.stat().st_size for path in files) > MAX_BYTES:
        raise ValueError('Hosted research workspace reached its 96 MB limit. Export records before adding more evidence.')
    with tarfile.open(fileobj=buffer, mode='w:gz') as archive:
        for path in files:
            archive.add(path, arcname=path.relative_to(root).as_posix(), recursive=False)
    return buffer.getvalue()


def restore_workspace(root, contents):
    if len(contents) > MAX_BYTES:
        raise ValueError('Workspace snapshot exceeds the hosted size limit')
    with tarfile.open(fileobj=io.BytesIO(contents), mode='r:gz') as archive:
        members = archive.getmembers()
        total = 0
        names = set()
        for member in members:
            relative = Path(member.name)
            if not member.isfile() or relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Invalid workspace snapshot member')
            if member.name != 'pharmainspect.db' and not (len(relative.parts) == 2 and relative.parts[0] == 'images'):
                raise ValueError('Unexpected workspace snapshot path')
            if member.name in names: raise ValueError('Duplicate snapshot member')
            names.add(member.name)
            total += member.size
            if total > MAX_BYTES or len(members) > 5000:
                raise ValueError('Expanded workspace snapshot exceeds the hosted limit')
        if 'pharmainspect.db' not in names: raise ValueError('Workspace database missing')
        # Validate the entire archive before touching the disposable local cache.
        for path in (root / 'images').glob('*'):
            if path.is_file(): path.unlink()
        for member in members:
            target = root / member.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.extractfile(member).read())


class BlobWorkspaceMiddleware:
    def __init__(self, app):
        self.app = app
        self.local_lock = asyncio.Lock()

    async def acquire(self, blob):
        deadline = time.monotonic() + 20
        while True:
            try:
                lease = await blob.put_blob(LEASE, json.dumps({'started_at':time.time()}).encode(), access='private', content_type='application/json', allow_overwrite=False, cache_control_max_age=0)
                return lease.etag
            except blob.BlobError as exc:
                if 'already exists' not in str(exc).lower() and exc.status_code not in (409, 412):
                    raise
                try:
                    metadata = await blob.head_blob(LEASE)
                    if (datetime.now(timezone.utc) - metadata.uploaded_at).total_seconds() > LEASE_SECONDS:
                        await blob.delete_blob(LEASE, if_match=metadata.etag)
                        continue
                except (blob.BlobNotFoundError, blob.BlobPreconditionFailedError):
                    continue
                if time.monotonic() >= deadline:
                    raise TimeoutError('Another inspection is using this research workspace. Try again shortly.')
                await asyncio.sleep(.35)

    async def save(self, blob, contents, previous):
        pathname = f'{REVISIONS}{time.time_ns():020d}-{uuid4().hex}.tar.gz'
        await blob.put_blob(pathname, contents, access='private', content_type='application/gzip', allow_overwrite=False, cache_control_max_age=0)
        # Immutable object names avoid the CDN's overwrite propagation window.
        # Retain the immediately previous snapshot for operational recovery.
        if len(previous) > 1:
            older = sorted(previous, key=lambda item:(item.uploaded_at,item.pathname), reverse=True)[1:]
            try: await blob.delete_blob([item.pathname for item in older])
            except blob.BlobError: LOGGER.warning('Old snapshot cleanup deferred')

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or os.environ.get('CLOUD_STORAGE') != 'blob-snapshot':
            return await self.app(scope, receive, send)
        path = scope.get('path', '')
        if not path.startswith('/api/') or path.startswith(('/api/auth/', '/api/demo/')) or path == '/api/health':
            return await self.app(scope, receive, send)

        from .main import principal
        from fastapi import HTTPException
        try:
            principal(Request(scope))
        except HTTPException as exc:
            return await JSONResponse({'detail':exc.detail}, status_code=exc.status_code)(scope, receive, send)

        from vercel import blob
        from .db import ROOT, engine
        async with self.local_lock:
            lease_etag = None
            try:
                lease_etag = await self.acquire(blob)
                fresh = False
                previous = [item async for item in blob.query_blobs(prefix=REVISIONS)]
                try:
                    metadata = max(previous,key=lambda item:(item.uploaded_at,item.pathname)) if previous else await blob.head_blob(SNAPSHOT)
                    result = await blob.get_blob(metadata.url, access='private')
                    if result.metadata.etag != metadata.etag:
                        raise RuntimeError('Storage revision changed; retry this request.')
                    engine.dispose()
                    await asyncio.to_thread(restore_workspace, ROOT, result.body)
                    if not previous:
                        await self.save(blob,result.body,[])
                        previous = [item async for item in blob.query_blobs(prefix=REVISIONS)]
                except blob.BlobNotFoundError:
                    fresh = True

                messages = []
                async def capture(message): messages.append(message)
                # Buffer the response until handlers, dependencies, and jobs have completed.
                # No successful mutation is acknowledged before its durable snapshot exists.
                await self.app(scope, receive, capture)
                status = next(m['status'] for m in messages if m['type'] == 'http.response.start')
                if fresh or scope['method'] in ('POST','PUT','PATCH','DELETE') and status < 400:
                    engine.dispose()
                    contents = await asyncio.to_thread(pack_workspace, ROOT)
                    await self.save(blob,contents,previous)
                for message in messages: await send(message)
            except TimeoutError as exc:
                await JSONResponse({'detail':str(exc)},status_code=409)(scope, receive, send)
            except ValueError as exc:
                await JSONResponse({'detail':str(exc)},status_code=413)(scope, receive, send)
            except Exception as exc:
                LOGGER.error('Hosted workspace storage failed: %s', type(exc).__name__)
                await JSONResponse({'detail':'Private workspace storage is temporarily unavailable. Retry this request.'},status_code=503)(scope, receive, send)
            finally:
                if lease_etag:
                    try: await blob.delete_blob(LEASE, if_match=lease_etag)
                    except blob.BlobError: LOGGER.error('Could not release workspace storage lease')
