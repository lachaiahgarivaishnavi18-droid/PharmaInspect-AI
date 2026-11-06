# PharmaInspect AI

A vision-language agent framework for pharmaceutical packaging inspection and quality-control research. React + Vite + TypeScript frontend; FastAPI + SQLAlchemy backend; ten-stage LangGraph workflow; local OpenCV image analysis, OCR, specification validation, evidence review, and downloadable reports.

**Academic decision-support prototype. It is not validated manufacturing inspection equipment, is not regulator-certified, and does not authorize pharmaceutical release or rejection. Final disposition remains with authorized quality personnel.**

## Run locally

Use Python 3.12 and Node 22+ with pnpm. Run all commands from the repository root.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
pnpm install
pnpm run build
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Open [the application](http://127.0.0.1:8000). The backend serves the built frontend on the same origin. A seed Paracetamol product is provided; there are **no fabricated inspections or analytics**. Initial local administrator password: `research-only`; reviewer: `review-only`. These are development credentials. For a shared environment, copy `.env.example` to `.env`, set strong credentials and a random `SESSION_SECRET`, and start uvicorn with `--env-file .env`. Set `COOKIE_SECURE=1` when serving over HTTPS.

On this workstation, `.venv` has already been initialized with Python 3.12. `scripts/start.ps1` starts the built application.

For hot reload, use two terminals:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
pnpm run dev
```

Open the Vite URL printed in the terminal. `/api` requests are proxied to FastAPI. API documentation is at [Swagger UI](http://127.0.0.1:8000/docs). Mutating requests require `X-Requested-With: PharmaInspect`; authentication uses an HttpOnly, SameSite cookie. Admins manage products, specifications, and model settings; reviewers inspect, annotate, and record research dispositions.

### OCR setup

The CPU workflow does not require any paid API. Install the **Tesseract executable** separately and put it on PATH, or set `TESSERACT_CMD` to its absolute executable path. The `pytesseract` Python package is an adapter, not the OCR executable. Without an executable the application still performs real quality/contour/specification processing and explicitly flags OCR as unavailable. It never invents printed values.

Alternatively install `backend/requirements-models.txt` and select EasyOCR in Settings. EasyOCR downloads its recognition weights on first use; make sure this is authorized in your environment. The container includes Tesseract, avoiding separate executable setup:

```text
docker compose up --build
```

Docker support is provided but requires Docker installed locally. The compose service is bound to loopback and persists images/database in a named volume.

### Optional models

- **Packaging detection:** install optional dependencies and configure a trusted, purpose-trained YOLO weights path. CPU inference is used. The default contour baseline supplies candidate regions, not packaging class predictions.
- **Vision-language reasoning:** run Ollama locally, pull a compatible vision model, choose Ollama in Settings, and specify the model name. Images are sent only to `127.0.0.1:11434`. Structured Pydantic outputs are validated; invalid responses fail the stage visibly. Deterministic specification rules retain priority.
- PyTorch, Torchvision, Transformers, and scikit-learn are optional dependencies for research extensions. CLIP, LLaVA through Transformers, PatchCore, and PaDiM are **not implemented or evaluated**. No trained pharmaceutical physical-defect detector ships with this repository.

## Using the workspace

1. Register a product or inspect the seed product. Configure expected text, required fields/components, seal requirements, explicit date formats, QR content, optional reference image, OCR review threshold, and confirmed-mismatch rejection behavior.
2. Upload up to eight JPG, PNG, or WEBP images (15 MB each, maximum 25 megapixels per image). Original bytes and a SHA-256 digest are preserved. Derivatives normalize EXIF orientation and apply CLAHE contrast enhancement.
3. Start inspection. The inspection pins the immutable specification version. Ten real LangGraph stages are available, with persisted start/completion/error status and duration. An insufficient-image quality gate conditionally skips inference/OCR and routes directly to decision/report; skipped stages have no fabricated execution logs.
4. Review quality metrics, candidate region overlays, OCR text boxes, extracted fields, expected/observed comparisons, limitations, and the reasoning summary.
5. Add append-only OCR annotations and human review dispositions with reasons. These do not silently replace model outputs or alter the original decision-support outcome.
6. Export PDF or JSON from the inspection detail; export inspection history to CSV. Analytics uses actual persisted records only. Precision/recall/accuracy remain unavailable until a labeled evaluation is implemented.

Download a synthetic sample in the workspace or generate all sample variants:

```powershell
.\.venv\Scripts\python.exe -m backend.app.demo
```

Samples are illustrative images, not a clinical dataset, trained detector, or performance benchmark.

## What baseline inspection can and cannot establish

| Capability | Implementation / limitation |
| --- | --- |
| Image validation | Content-decoded format, byte/pixel limits, corruption checks, dimensions |
| Quality | Laplacian variance, mean brightness, contrast, minimum resolution; these are heuristics |
| Packaging region | OpenCV contours; optional configured YOLO object detector |
| Physical damage / contamination / seals | **Unverified** without appropriate trained detectors and validated coverage; no fabricated defect boxes |
| Reference comparison | ORB alignment and mean absolute appearance difference, with feature/inlier/coverage checks; not a physical defect classifier |
| OCR | Tesseract or optional EasyOCR, raw text, confidence and original-image boxes |
| Field extraction | Explicit regex rules and expected-text evidence; unreadable fields stay missing |
| Dates | Product-specific allowed formats; ambiguous/invalid values flagged, ordering checked; month-only expiry interpreted as end of month |
| Codes | QR decoding/content comparison; linear barcode decoding is not implemented |
| Reasoning | Deterministic evidence summary, or optional local Ollama multimodal inference |
| Severity | Demonstration rules: confirmed identity/strength/QR mismatch Critical; other configured findings Major; not universal standards |
| Outcomes | PASS, REVIEW REQUIRED, FAIL, INSUFFICIENT IMAGE; ERROR separately tracks processing failures |

The conservative baseline records coverage/component uncertainty on every inspection, so a sharp matching sample normally yields **REVIEW REQUIRED**, never a false assurance of PASS. Low quality takes precedence as INSUFFICIENT IMAGE. High-confidence mismatches trigger FAIL only when the pinned specification enables that rule. Missing or low-confidence text requires review rather than proving a field is absent from the package. Scores are not calibrated probabilities of nonconformance.

## Architecture and persistence

```text
React workspace → FastAPI → validated local image storage
                         → versioned SQLAlchemy specifications
                         → LangGraph typed shared state
                            acquisition → preprocessing → detection → defects
                            → OCR → specification → reasoning → severity
                            → decision → report
                         → inspection result + stage execution records
                         → append-only human records + audit log
```

- `backend/app/vision.py`: image processing, OCR, extraction, comparison, provider abstraction.
- `backend/app/workflow.py`: typed LangGraph state, ten stages, real execution recording.
- `backend/app/main.py`: auth, upload, products/specifications, inspections, review, analytics, exports, health and static frontend serving.
- `backend/app/db.py`: relational core and structured JSON evidence snapshots; SQLite by default, PostgreSQL via `DATABASE_URL=postgresql+psycopg://...`.
- `backend/migrations`: Alembic schema initialization.
- `src`: routed React workspace with Recharts, React Flow, Dropzone and SVG evidence overlays.

Evidence collections (defects, OCR regions/fields, comparisons, reports and metadata) are stored as structured JSON in inspection/execution records rather than one SQL table per evidence subtype. This is an explicit simplification from the requested exhaustive normalized schema. The initial Alembic revision uses SQLAlchemy metadata; add immutable explicit migrations for subsequent schema evolution. A fresh local database also initializes automatically at server startup.

Local files and in-process background tasks are intentionally developer-oriented. External object storage, durable multi-worker jobs, per-user identity/SSO, independent stage reruns, segmentation masks, real-time streaming, trained physical-defect/anomaly models, GPU configuration, configurable severity rule authoring, and validated performance evaluation remain research extensions. A full rerun is supported; all prior execution records and completed report snapshots are retained. Avoid multi-worker deployment with this local task runner. Shared role credentials are development authentication, not enterprise user administration.

## Checks

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
pnpm run build
```

Tests exercise authenticated upload-to-report flow, original-prediction preservation, spec version pinning, rerun history, review permissions, corruption/size validation, insufficient images, missing/low-confidence fields, conflicting OCR, ambiguous/invalid dates, and manufacture/expiry ordering.

## Vercel hosting

The Vercel project is `pharmainspect-ai` in the `resume-project3` team. `api/index.py` hosts the existing FastAPI application as a Python Function; Vite assets are served from the CDN. The primary production URL is https://pharmainspect-ai.vercel.app.

Hosted research mode uses a dedicated **private Vercel Blob store**. Bounded immutable snapshot revisions include the SQLite database and evidence files. Reads use the Blob listing API to select the latest revision, avoiding stale CDN responses after overwrites. Cross-instance access is serialized with a conditionally created Blob lease; responses to mutations are buffered until a durable snapshot is saved. A stale lease can only be reclaimed after the maximum Function runtime plus a grace period, and conditional deletion prevents releasing another owner's lease. Failed snapshot writes return 503; the next request reloads the previously committed cloud state. Cloud persistence and rollback have automated tests.

This is a small, shared academic workspace, capped at **96 MB** of expanded database and image data, not a production-scale database architecture. Hosted image uploads are capped at **4 MB** per image to fit Vercel's request limit. Runs finish within the request and save their real execution trace before acknowledging success; this avoids relying on an in-process background task after a serverless response. CPU OpenCV is included; the hosted deployment does not contain the external Tesseract executable or optional trained models, so those limitations remain explicit.

Hosted `ADMIN_PASSWORD`, `REVIEWER_PASSWORD`, and `SESSION_SECRET` are independently generated and stored as encrypted Vercel environment variables. Local demo credentials do not work on the deployment. Deployment Protection remains at the team's default; a Vercel sign-in may be required before application sign-in. No secrets are included in source or deployment manifests.

The cloud runtime uses root `requirements.txt` / `pyproject.toml` (Python 3.12 and size-bounded OpenCV/NumPy versions). Local development continues to use `backend/requirements.txt`. `vercel.json` routes `/api/*` to the Python Function and frontend routes to the SPA. `.vercel/` contains ignored local project metadata and source packaging artifacts.

For a multi-user production system, use PostgreSQL and independently stored image objects with durable job execution. The Docker configuration remains available for a host with Tesseract installed.
