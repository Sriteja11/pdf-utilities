const state = { source: document.querySelector('.tab')?.dataset.source || 'upload', files: [], dragIndex: null, images: [], activeImage: 0, mixedFiles: [], mixedDragIndex: null };
const $ = (selector) => document.querySelector(selector);
let statusClearTimer;
const status = (message = '', success = false) => {
  const element = $('#status');
  clearTimeout(statusClearTimer);
  element.textContent = message;
  element.classList.toggle('success', success);
  if (success && message) statusClearTimer = setTimeout(() => status(), 5000);
};
const bytes = (size) => size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

function render() {
  $('#queue-section').classList.toggle('hidden', !state.files.length);
  const selectedCount = state.files.filter(file => file.selected !== false).length;
  $('#file-count').textContent = `${selectedCount} of ${state.files.length} selected`;
  $('#select-all').checked = selectedCount === state.files.length;
  $('#select-all').indeterminate = selectedCount > 0 && selectedCount < state.files.length;
  $('#file-list').innerHTML = '';
  state.files.forEach((file, index) => {
    const row = document.createElement('li'); row.draggable = true; row.dataset.index = index; row.classList.toggle('excluded', file.selected === false);
    const check = document.createElement('input'); check.className = 'file-select'; check.type = 'checkbox'; check.checked = file.selected !== false; check.setAttribute('aria-label', `Include ${file.name}`);
    const order = document.createElement('span'); order.className = 'order'; order.textContent = index + 1;
    const name = document.createElement('span'); name.className = 'file-name'; name.title = file.name; name.textContent = file.name;
    const size = document.createElement('span'); size.className = 'order'; size.textContent = bytes(file.size);
    const up = document.createElement('button'); up.className = 'move'; up.textContent = '↑'; up.setAttribute('aria-label', `Move ${file.name} up`);
    const down = document.createElement('button'); down.className = 'move'; down.textContent = '↓'; down.setAttribute('aria-label', `Move ${file.name} down`);
    check.onchange = () => { file.selected = check.checked; render(); };
    row.append(check, order, name, size, up, down);
    up.disabled = index === 0; down.disabled = index === state.files.length - 1;
    up.onclick = () => move(index, index - 1); down.onclick = () => move(index, index + 1);
    row.ondragstart = () => { state.dragIndex = index; row.classList.add('dragging'); };
    row.ondragend = () => { state.dragIndex = null; row.classList.remove('dragging'); };
    row.ondragover = (event) => event.preventDefault();
    row.ondrop = (event) => { event.preventDefault(); if (state.dragIndex !== null) move(state.dragIndex, index); };
    $('#file-list').append(row);
  });
}
function move(from, to) { if (to < 0 || to >= state.files.length || from === to) return; const [file] = state.files.splice(from, 1); state.files.splice(to, 0, file); render(); }
function setSource(source) { state.source = source; state.files = []; status(); document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.source === source)); $('#folder-panel')?.classList.toggle('hidden', source !== 'folder'); $('#upload-panel').classList.toggle('hidden', source !== 'upload'); $('#mixed-panel').classList.toggle('hidden', source !== 'mixed'); $('#images-panel').classList.toggle('hidden', source !== 'images'); render(); if (source === 'images') renderImage(); }

document.querySelectorAll('.tab').forEach(tab => tab.onclick = () => setSource(tab.dataset.source));
const scanFolder = $('#scan-folder'); if (scanFolder) scanFolder.onclick = async () => { const folder = $('#folder-path').value.trim(); status(); if (!folder) return status('Enter a Windows folder path.'); try { const response = await fetch('/api/folder-pdfs', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({folder})}); const data = await response.json(); if (!response.ok) throw new Error(data.error); state.files = data.files; render(); status(data.files.length ? '' : 'No PDFs were found in that folder.'); } catch (error) { status(error.message); } };
async function upload(files) { const chosen = [...files].filter(file => file.name.toLowerCase().endsWith('.pdf')); if (!chosen.length) return status('Choose PDF files only.'); status('Uploading PDFs…'); const form = new FormData(); chosen.forEach(file => form.append('files', file)); try { const response = await fetch('/api/upload', {method:'POST', body:form}); const data = await response.json(); if (!response.ok) throw new Error(data.error); state.files.push(...data.files); render(); status(); } catch (error) { status(error.message); } }
$('#file-input').onchange = (event) => upload(event.target.files); const dropZone = $('#drop-zone'); ['dragenter','dragover'].forEach(type => dropZone.addEventListener(type, event => {event.preventDefault(); dropZone.classList.add('dragover');})); ['dragleave','drop'].forEach(type => dropZone.addEventListener(type, event => {event.preventDefault(); dropZone.classList.remove('dragover');})); dropZone.addEventListener('drop', event => upload(event.dataTransfer.files));
$('#clear-list').onclick = () => { state.files = []; status(); render(); };
$('#select-all').onchange = (event) => { state.files.forEach(file => file.selected = event.target.checked); render(); };
$('#combine').onclick = async () => { const selected = state.files.filter(file => file.selected !== false); if (!selected.length) return status('Select at least one PDF to combine.'); status('Combining PDFs…'); $('#combine').disabled = true; try { const response = await fetch('/api/combine', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:state.source,items:selected})}); const data = await response.json(); if (!response.ok) throw new Error(data.error); window.location.assign(data.download); const message = state.source === 'folder' ? `Saved ${data.saved_as} in the selected folder and started its download.` : 'Your combined PDF is downloading.'; status(message, true); } catch (error) { status(error.message); } finally { $('#combine').disabled = false; } };

const defaults = () => ({points:[[0, 0], [1, 0], [1, 1], [0, 1]], brightness:100, contrast:100, saturation:100, grayscale:false, sepia:false});
const preview = $('#image-preview');
let activeHandle = null;
function currentImage() { return state.images[state.activeImage]; }
function clampActiveImage() {
  state.activeImage = state.images.length ? Math.max(0, Math.min(state.activeImage, state.images.length - 1)) : 0;
}
function filterFor(image) { return `brightness(${image.brightness}%) contrast(${image.contrast}%) saturate(${image.saturation}%) grayscale(${image.grayscale ? 100 : 0}%) sepia(${image.sepia ? 75 : 0}%)`; }
function addImages(files) {
  const chosen = [...files].filter(file => file.type.startsWith('image/'));
  if (!chosen.length) return status('Choose image files.');
  chosen.forEach(file => {
    const url = URL.createObjectURL(file), bitmap = new Image();
    const item = {file, url, bitmap, ...defaults()};
    bitmap.onload = () => { if (currentImage() === item) renderImage(); }; bitmap.src = url; state.images.push(item);
  });
  state.activeImage = state.images.length - chosen.length; renderImage(); status('');
}
function resizeCanvas() {
  const rect = preview.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
  preview.width = Math.round(rect.width * ratio); preview.height = Math.round(rect.height * ratio);
  const ctx = preview.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); return {ctx, width:rect.width, height:rect.height};
}
function renderCropCanvas() {
  const image = currentImage(); if (!image || !image.bitmap.complete) return;
  const {ctx, width, height} = resizeCanvas();
  const scale = Math.min(width / image.bitmap.naturalWidth, height / image.bitmap.naturalHeight);
  const drawWidth = image.bitmap.naturalWidth * scale, drawHeight = image.bitmap.naturalHeight * scale;
  const x = (width - drawWidth) / 2, y = (height - drawHeight) / 2;
  image.display = {x, y, width:drawWidth, height:drawHeight};
  ctx.clearRect(0, 0, width, height); ctx.filter = filterFor(image); ctx.drawImage(image.bitmap, x, y, drawWidth, drawHeight); ctx.filter = 'none';
  const polygon = image.points.map(([px, py]) => [x + px * drawWidth, y + py * drawHeight]);
  ctx.save(); ctx.fillStyle = 'rgba(10, 25, 16, .48)'; ctx.fillRect(x, y, drawWidth, drawHeight); ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); polygon.forEach(([px, py], index) => index ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.strokeStyle = '#36c76a'; ctx.lineWidth = 3; ctx.beginPath(); polygon.forEach(([px, py], index) => index ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.stroke();
  polygon.forEach(([px, py]) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#217a42'; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); });
}
function renderImage() {
  const image = currentImage(), previewWrap = document.querySelector('.image-preview-wrap');
  $('#image-editor').classList.toggle('hidden', state.source !== 'images'); $('#image-actions').classList.toggle('hidden', !image); $('#image-tools').classList.toggle('hidden', !image); $('#image-placeholder').classList.toggle('hidden', Boolean(image)); preview.classList.toggle('hidden', !image); previewWrap.classList.toggle('has-image', Boolean(image));
  previewWrap.style.aspectRatio = image?.bitmap.naturalWidth ? `${image.bitmap.naturalWidth} / ${image.bitmap.naturalHeight}` : '4 / 3';
  if (!image) return;
  $('#brightness').value = image.brightness; $('#contrast').value = image.contrast; $('#saturation').value = image.saturation;
  $('#image-position').textContent = `${state.activeImage + 1} of ${state.images.length}`; $('#previous-image').disabled = state.activeImage === 0; $('#next-image').disabled = state.activeImage === state.images.length - 1;
  requestAnimationFrame(renderCropCanvas);
}
function updateImage() { const image = currentImage(); if (!image) return; image.brightness = Number($('#brightness').value); image.contrast = Number($('#contrast').value); image.saturation = Number($('#saturation').value); renderCropCanvas(); }
['brightness','contrast','saturation'].forEach(id => $('#'+id).oninput = updateImage);
function pointerPosition(event) { const rect = preview.getBoundingClientRect(); return [event.clientX - rect.left, event.clientY - rect.top]; }
preview.onpointerdown = event => { const image = currentImage(); if (!image?.display) return; const [x, y] = pointerPosition(event); const candidates = image.points.map(([px, py], index) => ({index, x:image.display.x + px * image.display.width, y:image.display.y + py * image.display.height})); const closest = candidates.sort((a, b) => (a.x-x)**2 + (a.y-y)**2 - ((b.x-x)**2 + (b.y-y)**2))[0]; if ((closest.x-x)**2 + (closest.y-y)**2 < 900) { activeHandle = closest.index; preview.setPointerCapture(event.pointerId); event.preventDefault(); } };
preview.onpointermove = event => { const image = currentImage(); if (activeHandle === null || !image?.display) return; const [x, y] = pointerPosition(event), d = image.display; image.points[activeHandle] = [Math.max(0, Math.min(1, (x-d.x)/d.width)), Math.max(0, Math.min(1, (y-d.y)/d.height))]; renderCropCanvas(); };
preview.onpointerup = () => { activeHandle = null; }; preview.onpointercancel = () => { activeHandle = null; };
window.addEventListener('resize', renderCropCanvas);
$('#previous-image').onclick = () => { if (!currentImage()) return; state.activeImage--; clampActiveImage(); renderImage(); }; $('#next-image').onclick = () => { if (!currentImage()) return; state.activeImage++; clampActiveImage(); renderImage(); };
$('#grayscale').onclick = () => { const image = currentImage(); if (!image) return; image.grayscale = !image.grayscale; renderImage(); }; $('#sepia').onclick = () => { const image = currentImage(); if (!image) return; image.sepia = !image.sepia; renderImage(); }; $('#reset-image').onclick = () => { const image = currentImage(); if (!image) return; Object.assign(image, defaults()); renderImage(); };
$('#remove-image').onclick = () => { const removed = currentImage(); if (!removed) return; state.images.splice(state.activeImage, 1); URL.revokeObjectURL(removed.url); clampActiveImage(); renderImage(); status(); };
$('#image-input').onchange = event => addImages(event.target.files); const imageDrop = $('#image-drop-zone'); ['dragenter','dragover'].forEach(type => imageDrop.addEventListener(type, event => { event.preventDefault(); imageDrop.classList.add('dragover'); })); ['dragleave','drop'].forEach(type => imageDrop.addEventListener(type, event => { event.preventDefault(); imageDrop.classList.remove('dragover'); })); imageDrop.addEventListener('drop', event => addImages(event.dataTransfer.files));
$('#clear-images').onclick = () => { state.images.forEach(image => URL.revokeObjectURL(image.url)); state.images = []; state.activeImage = 0; renderImage(); status(); };
$('#images-to-pdf').onclick = async () => { if (!state.images.length) return; const button = $('#images-to-pdf'); button.disabled = true; status('Creating your PDF…'); try { const form = new FormData(); state.images.forEach(image => form.append('images', image.file, image.file.name)); form.append('edits', JSON.stringify(state.images.map(({points, brightness, contrast, saturation, grayscale, sepia}) => ({points, brightness, contrast, saturation, grayscale, sepia})))); const response = await fetch('/api/images-to-pdf', {method:'POST', body:form}); const data = await response.json(); if (!response.ok) throw new Error(data.error); window.location.assign(data.download); status('Your image PDF is downloading.', true); } catch (error) { status(error.message); } finally { button.disabled = false; } };

function isMixedFile(file) { return file.type === 'application/pdf' || file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.pdf'); }
function mixedFileType(file) { return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMAGE'; }
function moveMixed(from, to) { if (to < 0 || to >= state.mixedFiles.length || from === to) return; const [file] = state.mixedFiles.splice(from, 1); state.mixedFiles.splice(to, 0, file); renderMixed(); }
function renderMixed() {
  $('#mixed-queue').classList.toggle('hidden', !state.mixedFiles.length); $('#mixed-count').textContent = `${state.mixedFiles.length} file${state.mixedFiles.length === 1 ? '' : 's'}`; $('#mixed-list').innerHTML = '';
  state.mixedFiles.forEach((file, index) => {
    const row = document.createElement('li'); row.draggable = true; const order = document.createElement('span'); order.className = 'order'; order.textContent = index + 1;
    const kind = document.createElement('span'); kind.className = `file-kind ${mixedFileType(file).toLowerCase()}`; kind.textContent = mixedFileType(file);
    const name = document.createElement('span'); name.className = 'file-name'; name.title = file.name; name.textContent = file.name;
    const size = document.createElement('span'); size.className = 'order'; size.textContent = bytes(file.size);
    const up = document.createElement('button'); up.className = 'move'; up.textContent = '↑'; up.disabled = index === 0; up.setAttribute('aria-label', `Move ${file.name} up`);
    const down = document.createElement('button'); down.className = 'move'; down.textContent = '↓'; down.disabled = index === state.mixedFiles.length - 1; down.setAttribute('aria-label', `Move ${file.name} down`);
    const remove = document.createElement('button'); remove.className = 'remove-item'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${file.name}`);
    up.onclick = () => moveMixed(index, index - 1); down.onclick = () => moveMixed(index, index + 1); remove.onclick = () => { state.mixedFiles.splice(index, 1); renderMixed(); };
    row.ondragstart = () => { state.mixedDragIndex = index; row.classList.add('dragging'); }; row.ondragend = () => { state.mixedDragIndex = null; row.classList.remove('dragging'); }; row.ondragover = event => event.preventDefault(); row.ondrop = event => { event.preventDefault(); if (state.mixedDragIndex !== null) moveMixed(state.mixedDragIndex, index); };
    row.append(order, kind, name, size, up, down, remove); $('#mixed-list').append(row);
  });
}
function addMixed(files) { const chosen = [...files].filter(isMixedFile); if (!chosen.length) return status('Choose PDFs or image files.'); state.mixedFiles.push(...chosen); renderMixed(); status(); }
$('#mixed-input').onchange = event => { addMixed(event.target.files); event.target.value = ''; }; const mixedDrop = $('#mixed-drop-zone'); ['dragenter','dragover'].forEach(type => mixedDrop.addEventListener(type, event => { event.preventDefault(); mixedDrop.classList.add('dragover'); })); ['dragleave','drop'].forEach(type => mixedDrop.addEventListener(type, event => { event.preventDefault(); mixedDrop.classList.remove('dragover'); })); mixedDrop.addEventListener('drop', event => addMixed(event.dataTransfer.files));
$('#clear-mixed').onclick = () => { state.mixedFiles = []; renderMixed(); status(); };
$('#mixed-to-pdf').onclick = async () => { if (!state.mixedFiles.length) return status('Add at least one PDF or image.'); const button = $('#mixed-to-pdf'); button.disabled = true; status('Combining files…'); try { const form = new FormData(); state.mixedFiles.forEach(file => form.append('files', file, file.name)); const response = await fetch('/api/mixed-to-pdf', {method:'POST', body:form}); const data = await response.json(); if (!response.ok) throw new Error(data.error); window.location.assign(data.download); status('Your combined PDF is downloading.', true); } catch (error) { status(error.message); } finally { button.disabled = false; } };
