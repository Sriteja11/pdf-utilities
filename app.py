"""Local PDF combiner web application for Windows."""

from __future__ import annotations

import tempfile
import uuid
import json
import os
import time
from pathlib import Path
from typing import Iterable

from flask import Flask, jsonify, render_template, request, send_file
from PIL import Image, ImageEnhance, ImageOps, UnidentifiedImageError
from pypdf import PdfReader, PdfWriter
from werkzeug.utils import secure_filename


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024  # 500 MB per request
app.config["ALLOW_FOLDER_PATHS"] = os.getenv("ALLOW_FOLDER_PATHS", "true").lower() == "true"

WORK_DIR = Path(tempfile.gettempdir()) / "pdf-combiner-web"
UPLOAD_DIR = WORK_DIR / "uploads"
OUTPUT_DIR = WORK_DIR / "outputs"
FOLDER_OUTPUTS: dict[str, Path] = {}
TEMP_FILE_TTL_SECONDS = 60 * 60
for directory in (UPLOAD_DIR, OUTPUT_DIR):
    directory.mkdir(parents=True, exist_ok=True)


def cleanup_expired_files() -> None:
    """Remove stale temporary uploads and generated downloads."""
    cutoff = time.time() - TEMP_FILE_TTL_SECONDS
    for directory in (UPLOAD_DIR, OUTPUT_DIR):
        for file in directory.iterdir():
            if file.is_file() and file.stat().st_mtime < cutoff:
                file.unlink(missing_ok=True)


def is_pdf(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() == ".pdf"


def list_pdfs(folder: str) -> list[dict[str, str | int]]:
    directory = Path(folder).expanduser()
    if not directory.exists() or not directory.is_dir():
        raise ValueError("That folder does not exist or cannot be opened.")

    return [
        {"path": str(item), "name": item.name, "size": item.stat().st_size}
        for item in sorted(directory.iterdir(), key=lambda item: item.name.lower())
        if is_pdf(item)
    ]


def merge_pdfs(paths: Iterable[Path], output: Path) -> None:
    writer = PdfWriter()
    added = 0
    try:
        for path in paths:
            reader = PdfReader(path)
            for page in reader.pages:
                writer.add_page(page)
                added += 1
        if not added:
            raise ValueError("The selected PDFs contain no pages.")
        with output.open("wb") as file:
            writer.write(file)
    finally:
        writer.close()


def normalized_points(value: object) -> list[tuple[float, float]]:
    """Validate four normalized crop points ordered TL, TR, BR, BL."""
    if not isinstance(value, list) or len(value) != 4:
        return [(0, 0), (1, 0), (1, 1), (0, 1)]
    points = []
    for point in value:
        if not isinstance(point, list) or len(point) != 2:
            return [(0, 0), (1, 0), (1, 1), (0, 1)]
        points.append((max(0, min(1, float(point[0]))), max(0, min(1, float(point[1])))))
    return points


def crop_and_adjust(image: Image.Image, edit: dict) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("RGBA")
    width, height = image.size
    points = normalized_points(edit.get("points"))
    top = ((points[1][0] - points[0][0]) ** 2 + (points[1][1] - points[0][1]) ** 2) ** 0.5
    bottom = ((points[2][0] - points[3][0]) ** 2 + (points[2][1] - points[3][1]) ** 2) ** 0.5
    left = ((points[3][0] - points[0][0]) ** 2 + (points[3][1] - points[0][1]) ** 2) ** 0.5
    right = ((points[2][0] - points[1][0]) ** 2 + (points[2][1] - points[1][1]) ** 2) ** 0.5
    target = (max(1, round((top + bottom) * width / 2)), max(1, round((left + right) * height / 2)))
    quad = tuple(value for point in (points[0], points[3], points[2], points[1]) for value in (point[0] * width, point[1] * height))
    image = image.transform(target, Image.Transform.QUAD, quad, resample=Image.Resampling.BICUBIC)
    image = ImageEnhance.Brightness(image).enhance(float(edit.get("brightness", 100)) / 100)
    image = ImageEnhance.Contrast(image).enhance(float(edit.get("contrast", 100)) / 100)
    image = ImageEnhance.Color(image).enhance(float(edit.get("saturation", 100)) / 100)
    if edit.get("grayscale"):
        image = ImageOps.grayscale(image).convert("RGBA")
    if edit.get("sepia"):
        image = ImageOps.colorize(ImageOps.grayscale(image), "#6f4728", "#f5e5c4").convert("RGBA")
    page = Image.new("RGB", image.size, "white")
    page.paste(image, mask=image.getchannel("A"))
    image.close()
    return page


def images_to_pdf(images: list, edits: list[dict], output: Path) -> None:
    """Write uploaded raster images as a single standard PDF."""
    pages = []
    try:
        for index, image_file in enumerate(images):
            with Image.open(image_file.stream) as image:
                pages.append(crop_and_adjust(image, edits[index] if index < len(edits) else {}))
        if not pages:
            raise ValueError("Add at least one image.")
        pages[0].save(output, "PDF", resolution=150.0, save_all=True, append_images=pages[1:])
    finally:
        for page in pages:
            page.close()


def available_output_path(directory: Path) -> Path:
    """Choose a readable filename without overwriting an existing document."""
    candidate = directory / "combined.pdf"
    number = 1
    while candidate.exists():
        candidate = directory / f"combined-{number}.pdf"
        number += 1
    return candidate


@app.get("/")
def index():
    return render_template("index.html", folder_enabled=app.config["ALLOW_FOLDER_PATHS"])


@app.before_request
def clean_temporary_files():
    cleanup_expired_files()


@app.post("/api/folder-pdfs")
def folder_pdfs():
    if not app.config["ALLOW_FOLDER_PATHS"]:
        return jsonify(error="Folder paths are available only in the local app."), 403
    payload = request.get_json(silent=True) or {}
    folder = str(payload.get("folder", "")).strip()
    if not folder:
        return jsonify(error="Enter a Windows folder path first."), 400
    try:
        return jsonify(files=list_pdfs(folder))
    except (OSError, ValueError) as error:
        return jsonify(error=str(error)), 400


@app.post("/api/upload")
def upload():
    files = request.files.getlist("files")
    accepted = []
    for file in files:
        if not file or not file.filename.lower().endswith(".pdf"):
            continue
        token = uuid.uuid4().hex
        filename = secure_filename(file.filename) or "document.pdf"
        stored = UPLOAD_DIR / f"{token}-{filename}"
        file.save(stored)
        accepted.append({"id": token, "name": filename, "size": stored.stat().st_size})
    if not accepted:
        return jsonify(error="Choose one or more PDF files."), 400
    return jsonify(files=accepted)


@app.post("/api/combine")
def combine():
    payload = request.get_json(silent=True) or {}
    source = payload.get("source")
    items = payload.get("items", [])
    allowed_sources = {"upload"}
    if app.config["ALLOW_FOLDER_PATHS"]:
        allowed_sources.add("folder")
    if source not in allowed_sources or not isinstance(items, list) or not items:
        return jsonify(error="Add at least one PDF to combine."), 400

    try:
        output_id = uuid.uuid4().hex
        if source == "folder":
            paths = [Path(str(item["path"])) for item in items]
            if any(not is_pdf(path) for path in paths):
                raise ValueError("One or more selected folder files are unavailable.")
            parent = paths[0].parent
            if any(path.parent != parent for path in paths):
                raise ValueError("Folder PDFs must all come from the same folder.")
            output = available_output_path(parent)
        else:
            paths = []
            for item in items:
                token = str(item.get("id", ""))
                matches = list(UPLOAD_DIR.glob(f"{token}-*.pdf"))
                if len(matches) != 1:
                    raise ValueError("An uploaded file has expired. Please upload it again.")
                paths.append(matches[0])

            output = OUTPUT_DIR / f"combined-{output_id}.pdf"
        merge_pdfs(paths, output)
        if source == "upload":
            for path in paths:
                path.unlink(missing_ok=True)
        if source == "folder":
            FOLDER_OUTPUTS[output_id] = output
            return jsonify(download=f"/api/download/{output_id}", saved_as=output.name)
        return jsonify(download=f"/api/download/{output_id}")
    except Exception as error:
        return jsonify(error=f"Could not combine PDFs: {error}"), 400


@app.post("/api/images-to-pdf")
def image_pdf():
    images = request.files.getlist("images")
    if not images:
        return jsonify(error="Choose one or more images."), 400
    if len(images) > 40:
        return jsonify(error="Choose up to 40 images at a time."), 400
    output_id = uuid.uuid4().hex
    output = OUTPUT_DIR / f"images-{output_id}.pdf"
    try:
        edits = json.loads(request.form.get("edits", "[]"))
        if not isinstance(edits, list):
            raise ValueError("Invalid image edits.")
        images_to_pdf(images, edits, output)
        return jsonify(download=f"/api/download/{output_id}")
    except (UnidentifiedImageError, OSError, ValueError) as error:
        return jsonify(error=f"Could not create PDF: {error}"), 400


@app.get("/api/download/<output_id>")
def download(output_id: str):
    if not output_id.isalnum():
        return jsonify(error="Invalid download."), 404
    output = OUTPUT_DIR / f"combined-{output_id}.pdf"
    image_output = OUTPUT_DIR / f"images-{output_id}.pdf"
    if not output.is_file() and image_output.is_file():
        output = image_output
    if not output.is_file():
        output = FOLDER_OUTPUTS.get(output_id, Path())
    if not output.is_file():
        return jsonify(error="This download is no longer available."), 404
    response = send_file(output, as_attachment=True, download_name="combined.pdf")
    if output.parent == OUTPUT_DIR:
        response.call_on_close(lambda: output.unlink(missing_ok=True))
    FOLDER_OUTPUTS.pop(output_id, None)
    return response


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


@app.errorhandler(413)
def too_large(_error):
    return jsonify(error="The upload is too large (limit: 500 MB)."), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
