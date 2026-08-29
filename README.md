# PDF Combine

**Combine multiple PDFs into one, turn photos into PDF pages, or mix PDFs and images in any order** — with drag-and-drop reordering, a four-corner crop tool, and brightness/color adjustments. Run it locally on Windows and everything stays on your machine, or deploy it to Render — see [Privacy & file handling](#privacy--file-handling) for what that means for your documents.

## 🌐 Try it online

**https://pdf-combine-0cf9.onrender.com** — hosted free on Render. No sign-up, no watermarks. (On the free plan the app sleeps after ~15 minutes idle; the first visit may take up to a minute to wake up.)

## What it can do

The app has four source modes, shown as tabs:

- **Use a folder path** *(local app only)* — paste a Windows folder path and the app finds every PDF directly inside it. Pick the ones to include, drag or arrow them into order, and combine. The merged PDF is saved back into that same folder as `combined.pdf` (or `combined-1.pdf`, `combined-2.pdf`, …) so an existing file is never overwritten, and a download starts automatically.
- **Upload PDFs** — drop or browse for PDFs, tick which ones to include, reorder by dragging or with the arrow buttons, then combine and download. Uploaded files are removed as soon as the combined PDF is produced.
- **Images to PDF** — drop up to 40 photos or scans (JPG, PNG, WebP, BMP, GIF, TIFF) and refine each one before saving:
  - a four-corner crop tool — drag the green points to trace exactly the area you want to keep,
  - brightness, contrast, and saturation sliders,
  - one-click B&W and warm (sepia) filters, plus reset,
  - per-image navigation, removal, and reordering.
  Each image becomes one PDF page at 150 DPI, with transparency flattened onto white and phone photos rotated correctly via their EXIF data.
- **Mix PDFs & images** — combine PDF documents and images in a single pass. Add up to 40 files of either kind, arrange the final page order by dragging or with arrows, remove any item, and combine. Images are appended as pages; PDFs contribute their pages in place.

## Privacy & file handling

**Running locally** — nothing ever leaves your computer:

- All processing happens on your machine; no document is sent to any server.
- Temporary uploads and generated downloads live in your system temp folder (`%TEMP%\pdf-combiner-web`) and are cleaned up automatically after one hour.

**Hosted on Render** — your files do travel to the cloud:

- Uploaded PDFs and images are sent to Render's servers and processed there. Treat it like any cloud service: don't upload documents you aren't comfortable putting on someone else's infrastructure.
- Files are stored only in the server's temporary directory, never in persistent storage or a database.
- Download links are one-shot: the generated file is deleted immediately after it is downloaded, and anything left over is cleaned up automatically after one hour.

In both modes:

- Uploads are capped at 500 MB per request.
- The app adds no tracking or analytics; the only network traffic is between your browser and the app itself.

## Run locally

```powershell
uv sync
uv run python app.py
```

`uv sync` creates the local `.venv` automatically and installs the locked project dependencies. You only need to run it again after dependency changes.

If uv reports that its user cache cannot be accessed, run it with a project-local cache instead:

```powershell
$env:UV_CACHE_DIR = "$PWD\.uv-cache"
uv sync
```

If you prefer activating the environment yourself:

```powershell
uv venv
.\.venv\Scripts\Activate.ps1
uv pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000 in your browser.

The folder-path tab is controlled by the `ALLOW_FOLDER_PATHS` environment variable (enabled by default). Set `ALLOW_FOLDER_PATHS=false` to hide it and run the app in uploads-only mode.

## Deploy to Render

The included `render.yaml` deploys this project as a Render Web Service. It uses `uv sync --frozen` to install the locked dependencies and Gunicorn to run Flask in production.

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint**, connect the repository, and confirm the `render.yaml` configuration.
3. Open the generated `onrender.com` URL when deployment completes.

The deployed app uses uploads only (PDFs, images, and mixed combining). It intentionally hides the local Windows-folder path feature because a hosted server cannot access a visitor's computer. Uploaded and generated documents are temporary: download the result straight away.

The live instance is available at **https://pdf-combine-0cf9.onrender.com**.
