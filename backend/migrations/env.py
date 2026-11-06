from alembic import context
from backend.app.db import engine, Base
target_metadata=Base.metadata
with engine.connect() as connection:
    context.configure(connection=connection,target_metadata=target_metadata,render_as_batch=engine.dialect.name=='sqlite')
    with context.begin_transaction(): context.run_migrations()
