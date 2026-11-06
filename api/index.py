"""Vercel Python Function entrypoint. Only /tmp is a disposable cache."""
import os
os.environ.setdefault('DATA_DIR', '/tmp/pharmainspect-workspace')
if os.environ.get('VERCEL'):
    for key in ('ADMIN_PASSWORD', 'REVIEWER_PASSWORD', 'SESSION_SECRET'):
        if not os.environ.get(key): raise RuntimeError(f'{key} must be configured for hosted deployment')
from backend.app.main import app, initialize_workspace
from backend.app.cloud import BlobWorkspaceMiddleware
initialize_workspace()
app.add_middleware(BlobWorkspaceMiddleware)
