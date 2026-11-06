import os
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import create_engine, String, ForeignKey, JSON, DateTime, Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

ROOT = Path(os.environ.get('DATA_DIR', 'data')).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
(ROOT / 'images').mkdir(exist_ok=True)
URL = os.environ.get('DATABASE_URL', f'sqlite:///{ROOT / "pharmainspect.db"}')
engine = create_engine(URL, connect_args={'check_same_thread': False} if URL.startswith('sqlite') else {})
Session = sessionmaker(engine, expire_on_commit=False)
def uid(): return str(uuid4())
def now(): return datetime.now(timezone.utc)
class Base(DeclarativeBase): pass
class Product(Base):
    __tablename__ = 'products'
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200), index=True)
    packaging: Mapped[str] = mapped_column(String(50), default='Carton')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
class Specification(Base):
    __tablename__ = 'specifications'
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    product_id: Mapped[str] = mapped_column(ForeignKey('products.id'), index=True)
    version: Mapped[int] = mapped_column(Integer)
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
class ImageRecord(Base):
    __tablename__ = 'images'
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    filename: Mapped[str] = mapped_column(String)
    path: Mapped[str] = mapped_column(String)
    meta: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
class Inspection(Base):
    __tablename__ = 'inspections'
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    product_id: Mapped[str] = mapped_column(ForeignKey('products.id'), index=True)
    specification_id: Mapped[str] = mapped_column(ForeignKey('specifications.id'))
    image_ids: Mapped[list] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String, default='QUEUED', index=True)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
class Execution(Base):
    __tablename__ = 'executions'
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    inspection_id: Mapped[str] = mapped_column(ForeignKey('inspections.id'), index=True)
    run_id: Mapped[str] = mapped_column(String, index=True)
    agent: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
class Annotation(Base):
    __tablename__ = 'annotations'
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    inspection_id: Mapped[str] = mapped_column(ForeignKey('inspections.id'), index=True)
    kind: Mapped[str] = mapped_column(String)
    data: Mapped[dict] = mapped_column(JSON)
    actor: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
class Audit(Base):
    __tablename__ = 'audit_log'
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    action: Mapped[str] = mapped_column(String)
    target: Mapped[str] = mapped_column(String)
    actor: Mapped[str] = mapped_column(String)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
class Configuration(Base):
    __tablename__ = 'configuration'
    id: Mapped[str] = mapped_column(String, primary_key=True, default='models')
    data: Mapped[dict] = mapped_column(JSON, default=dict)
class InspectionReport(Base):
    __tablename__ = 'inspection_reports'
    id: Mapped[str] = mapped_column(String, primary_key=True, default=uid)
    inspection_id: Mapped[str] = mapped_column(ForeignKey('inspections.id'), index=True)
    run_id: Mapped[str] = mapped_column(String, unique=True)
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
