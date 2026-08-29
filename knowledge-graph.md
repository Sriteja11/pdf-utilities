# PDF Combine — Knowledge Graph

> Human-readable view of `knowledge-graph.json` (last refreshed 2026-08-29).
> Regenerate this file from the JSON whenever the graph is updated.

## What this codebase is

A local-first **Flask web app for combining PDFs** with four source modes:

1. **Folder path** (Windows-only, env-gated) — scan a folder for PDFs; the merged file is saved back into that folder without overwriting.
2. **Upload PDFs** — upload, select, reorder, combine; result streams as a download.
3. **Images → PDF** — canvas editor with four-corner crop, brightness/contrast/saturation, B&W/sepia; images become one PDF.
4. **Mixed** — PDFs and images combined in user-chosen order.

All temporary files live in `%TEMP%/pdf-combiner-web` and expire after 1 hour. Deployable to Render (folder mode disabled there). Stack: Flask, pypdf, Pillow, vanilla JS frontend. Run with `uv run python app.py` → http://127.0.0.1:5000.

## Components

| Node | Path | What it does |
|---|---|---|
| **Flask backend** | `app.py` | Index page, 7 routes, security headers, 413 handler, per-request temp cleanup. |
| **Frontend controller** | `static/app.js` | Single-page UI: tabs, queues with drag-reorder, canvas crop editor, all fetch calls. |
| **Index template** | `templates/index.html` | App shell: tabs (folder tab omitted when disabled), panels, queue, editor markup, status line. |
| **Stylesheet** | `static/style.css` | Styling for shell, tabs, drop zones, queues, editor. |
| **Flask config** | `app.py` | 500 MB upload limit; `ALLOW_FOLDER_PATHS` env (default true). Dev server 127.0.0.1:5000. |
| **Render deployment** | `render.yaml` | `uv sync --frozen` + Gunicorn; uploads-only in production. |

## Backend functions (`app.py`)

| Function | Purpose | Called by |
|---|---|---|
| `cleanup_expired_files` | Deletes temp files older than 1 hour. | `before_request` hook |
| `is_pdf` | Existing file with `.pdf` suffix? | `/api/combine` |
| `list_pdfs` | Alphabetical PDF listing of a folder. | `/api/folder-pdfs` |
| `merge_pdfs` | Ordered merge into output file via `PdfWriter`. | `/api/combine` |
| `add_image_page` | Image → 150-DPI PDF page (EXIF-aware, alpha on white). | `merge_mixed_files` |
| `merge_mixed_files` | Ordered join of uploaded PDFs + images. | `/api/mixed-to-pdf` |
| `normalized_points` | Validates/clamps 4 crop points; full-image fallback. | `crop_and_adjust` |
| `crop_and_adjust` | Quad crop transform + brightness/contrast/saturation/grayscale/sepia. | `images_to_pdf` |
| `images_to_pdf` | Multi-page PDF from images with per-image edits. | `/api/images-to-pdf` |
| `available_output_path` | `combined.pdf` / `combined-N.pdf` without overwriting. | `/api/combine` |
| `clean_temporary_files` (hook) | Runs cleanup before each request. | — |
| `add_security_headers` (hook) | nosniff / DENY / referrer-policy. | — |
| `too_large` (413) | JSON error for >500 MB uploads. | — |

## Routes

| Route | Purpose | Notes |
|---|---|---|
| `GET /` | Renders `index.html` | passes `folder_enabled` |
| `POST /api/folder-pdfs` | List folder PDFs | 403 if disabled, 400 bad folder |
| `POST /api/upload` | Save PDFs under uuid tokens → `UPLOAD_DIR` | 400 if none accepted |
| `POST /api/combine` | Merge folder or uploaded PDFs | folder → saved in place; upload → `OUTPUT_DIR`, uploads deleted |
| `POST /api/images-to-pdf` | ≤40 images + JSON edits → PDF | |
| `POST /api/mixed-to-pdf` | ≤40 PDFs/images in order → PDF | output deleted on failure |
| `GET /api/download/<id>` | Stream result | alphanumeric id; output deleted after download |

## Frontend (`static/app.js`)

- **State/helpers** — `state` (source, files, images, mixedFiles, drag indices), `status()` (5s auto-clear), `bytes()`.
- **`render`** — PDF queue with checkboxes, arrows, drag-drop, select-all.
- **`setSource`** — tab switching, panel toggling.
- **`upload`** — multipart POST to `/api/upload`.
- **Image editor** — `addImages`, `renderCropCanvas`, `renderImage`, `updateImage`, pointer handlers: draggable crop handles, live filters, sliders, B&W/sepia/reset/remove.
- **Images→PDF submit** — images + JSON edits → `/api/images-to-pdf`.
- **Mixed queue** — `renderMixed`, `addMixed`, `moveMixed` → `/api/mixed-to-pdf`.

## UI elements (`templates/index.html`)

Source tabs · drop zones (file/image/mixed) · queue sections (file-list, mixed-list) · image editor markup (canvas, sliders, filter buttons) · aria-live status line.

## Key relationships

- `index.js fetch` → backend routes: upload→`/api/upload`, render/combine→`/api/folder-pdfs` & `/api/combine`, editor→`/api/images-to-pdf`, mixed→`/api/mixed-to-pdf`; results via `/api/download/<id>`.
- `route-index` → renders `index.html` → loads `style.css` + `app.js`.
- Backend call chain: `/api/images-to-pdf` → `images_to_pdf` → `crop_and_adjust` → `normalized_points`; `/api/mixed-to-pdf` → `merge_mixed_files` → `add_image_page`; `/api/combine` → `merge_pdfs`, `is_pdf`, `available_output_path`.