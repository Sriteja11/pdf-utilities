# PDF Combine

A local Windows-friendly web app for joining PDFs. It supports two flows:

- Paste a Windows folder path to find its PDFs. The merged PDF is saved back to that folder without overwriting an existing file.
- Upload PDFs, choose which files to include, then drag or use arrows to set the output order.
- Turn images into a PDF, with a four-corner crop tool, brightness/color adjustments, and per-image removal.

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

The app does not upload documents to a cloud service. Temporary uploaded and combined files are stored in your Windows temp folder.

## Deploy to Render

The included `render.yaml` deploys this project as a Render Web Service. It uses `uv sync --frozen` to install the locked dependencies and Gunicorn to run Flask in production.

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint**, connect the repository, and confirm the `render.yaml` configuration.
3. Open the generated `onrender.com` URL when deployment completes.

The deployed app uses file uploads only. It intentionally hides the local Windows-folder path feature because a hosted server cannot access a visitor's computer. Uploaded and generated documents are temporary: download the result straight away.
