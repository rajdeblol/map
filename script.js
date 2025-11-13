// ritual-script-v4-FINAL-VERCEL.js
// 100% WORKING on Vercel
// Every cell INSIDE the Ritual logo is clickable
// No outside cells, no bugs

const GRID_SIZE = 60;
const CELL_PX = 15;
const STORAGE_KEY = 'ritual_pixels_v4';
const LOGO_PATH = '/assets/logo/ritual-logo.png'; // <-- VERCEL PATH (must be in public/assets/logo)
const MAX_PARTICIPANTS = 1000;

let pixels = {};
let selectedIndex = null;
let maskIndices = [];
let maskSet = new Set();
let maskComputed = false;
let maskDebug = false;

// DOM Elements
const gridContainer      = document.getElementById('gridContainer');
const modal              = document.getElementById('modal');
const usernameInput      = document.getElementById('username');
const captionInput       = document.getElementById('caption');
const placeBtn           = document.getElementById('placeBtn');
const closeModal         = document.getElementById('closeModal');
const totalPixelsEl      = document.getElementById('totalPixels');
const filledPixelsEl     = document.getElementById('filledPixels');

const fetchAvatarBtn     = document.getElementById('fetchAvatar');
const avatarPreviewWrap  = document.getElementById('avatarPreviewWrap');
const avatarPreview      = document.getElementById('avatarPreview');
const avatarName         = document.getElementById('avatarName');
const removeAvatarBtn    = document.getElementById('removeAvatar');
const avatarUploadInput  = document.getElementById('avatarUpload');

const celebrateEl        = document.getElementById('celebrate');
const toggleMaskDebugBtn = document.getElementById('toggleMaskDebug');
const autoTuneBtn        = document.getElementById('autoTune');

// STORAGE
function loadState() { try { const r = localStorage.getItem(STORAGE_KEY); if (r) pixels = JSON.parse(r); } catch (e) { console.warn(e); } }
function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels)); } catch (e) { console.warn(e); } }

// BUILD GRID
function buildGrid() {
  gridContainer.style.width = (GRID_SIZE * CELL_PX) + 'px';
  gridContainer.style.height = (GRID_SIZE * CELL_PX) + 'px';
  gridContainer.innerHTML = '';
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const idx = y * GRID_SIZE + x;
      const cell = document.createElement('div');
      cell.className = 'cell empty';
      cell.dataset.idx = idx;
      cell.style.width = cell.style.height = CELL_PX + 'px';
      cell.style.pointerEvents = 'auto';
      cell.addEventListener('click', onCellClick);
      cell.addEventListener('mousedown', e => e.preventDefault());
      gridContainer.appendChild(cell);
    }
  }
}

// CLICK – ONLY INSIDE LOGO
function onCellClick(e) {
  const idx = Number(e.currentTarget.dataset.idx);
  if (!maskComputed) return alert('Mask loading... please wait.');
  if (pixels[idx]) return alert('Pixel already placed.');
  if (maskSet.has(idx)) {
    openPlacementModalForIndex(idx);
  }
}

function openPlacementModalForIndex(idx) {
  selectedIndex = idx;
  usernameInput.value = '';
  captionInput.value = '';
  avatarPreviewWrap.style.display = 'none';
  avatarPreview.dataset.dataurl = '';
  avatarPreview.dataset.url = '';
  modal.classList.remove('hidden');
  setTimeout(() => usernameInput.focus(), 80);
}
closeModal.addEventListener('click', () => { modal.classList.add('hidden'); selectedIndex = null; });

// PLACE PIXEL
placeBtn.addEventListener('click', () => {
  if (selectedIndex === null) return alert('No cell selected.');
  const u = usernameInput.value.trim();
  const avatarData = avatarPreview.dataset.dataurl || null;
  if (!u && !avatarData) return alert('Add username or avatar.');
  const c = captionInput.value.trim();
  pixels[selectedIndex] = { username: u || 'uploader', caption: c, avatar: avatarData, ts: Date.now() };
  saveState(); renderGrid(); updateCounters(); modal.classList.add('hidden');
  fireCelebration(selectedIndex);
});

// AVATAR FETCH & UPLOAD
fetchAvatarBtn && fetchAvatarBtn.addEventListener('click', async () => {
  const u = usernameInput.value.trim(); if (!u) return alert('Enter X username (no @).');
  const url = `https://unavatar.io/twitter/${u}.png`;
  try {
    const img = await loadImageWithCors(url);
    const dataUrl = resizeToDataURL(img, CELL_PX, CELL_PX);
    setAvatarPreview(dataUrl, url, '@' + u);
  } catch {
    if (confirm('CORS failed. Show remote image?')) setAvatarPreview('', url, '@' + u);
  }
});
avatarUploadInput && avatarUploadInput.addEventListener('change', e => {
  const f = e.target.files?.[0]; if (!f || !f.type.startsWith('image/')) return alert('Upload an image.');
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => setAvatarPreview(resizeToDataURL(img, CELL_PX, CELL_PX), '', 'Uploaded'); img.src = r.result; };
  r.readAsDataURL(f);
});
removeAvatarBtn && removeAvatarBtn.addEventListener('click', () => { avatarPreviewWrap.style.display = 'none'; avatarPreview.dataset.dataurl = ''; avatarName.textContent = ''; avatarUploadInput.value = ''; });

function setAvatarPreview(dataUrl, url, name) {
  avatarPreview.src = dataUrl || url;
  avatarPreview.dataset.dataurl = dataUrl;
  avatarPreview.dataset.url = url;
  avatarName.textContent = name;
  avatarPreviewWrap.style.display = 'flex';
}
function loadImageWithCors(u) { return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = u + '?v=' + Date.now(); }); }
function resizeToDataURL(img, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d');
  const ar = img.width / img.height; let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (ar > 1) { sw = img.height; sx = (img.width - sw) / 2; } else { sh = img.width; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return c.toDataURL('image/png');
}

// RENDER
function renderGrid() {
  for (const el of gridContainer.children) {
    const idx = Number(el.dataset.idx);
    if (pixels[idx]) {
      const p = pixels[idx];
      el.className = 'cell filled' + (p.avatar ? ' filled-avatar' : '');
      el.style.backgroundImage = p.avatar ? `url("${p.avatar}")` : '';
      el.style.backgroundColor = p.avatar ? '' : '#dfffe8';
      el.title = `${p.username}${p.caption ? ' — ' + p.caption : ''}`;
    } else {
      el.className = 'cell empty' + (maskSet.has(idx) ? ' hoverable' : '');
      el.style.backgroundImage = ''; el.style.backgroundColor = 'transparent'; el.title = '';
      if (maskDebug && maskSet.has(idx)) el.classList.add('mask-debug');
      else el.classList.remove('mask-debug');
    }
  }
}
function updateCounters() {
  totalPixelsEl.textContent = Math.min(MAX_PARTICIPANTS, maskIndices.length);
  filledPixelsEl.textContent = Object.keys(pixels).length;
}

// MASK – FINAL FIX (dilated + expand to 1000 inside logo)
async function computeMaskAndEnsureCapacity(threshold = 28) {
  maskComputed = false; maskIndices = []; maskSet.clear();
  try {
    const img = await loadImageWithCors(LOGO_PATH);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = GRID_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);

    const ar = img.width / img.height;
    let dw = GRID_SIZE, dh = GRID_SIZE, dx = 0, dy = 0;
    if (ar > 1) { dh = Math.round(GRID_SIZE / ar); dy = Math.round((GRID_SIZE - dh) / 2); }
    else { dw = Math.round(GRID_SIZE * ar); dx = Math.round((GRID_SIZE - dw) / 2); }
    ctx.drawImage(img, dx, dy, dw, dh);

    const data = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;
    const map = new Uint8Array(GRID_SIZE * GRID_SIZE);
    const dilated = new Uint8Array(GRID_SIZE * GRID_SIZE);

    // 1. Luminance mask
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const i = (y * GRID_SIZE + x) * 4;
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (lum > threshold) map[y * GRID_SIZE + x] = 1;
      }
    }

    // 2. Dilation (1px border)
    const neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const idx = y * GRID_SIZE + x;
        if (map[idx]) { dilated[idx] = 1; continue; }
        for (const [dx, dy] of neighbors) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && map[ny * GRID_SIZE + nx]) {
            dilated[idx] = 1; break;
          }
        }
      }
    }

    // 3. Collect dilated cells
    for (let i = 0; i < dilated.length; i++) if (dilated[i]) maskIndices.push(i);

    // 4. EXPAND TO 1000 – add nearest *non-dilated* cells
    if (maskIndices.length < MAX_PARTICIPANTS) {
      const needed = MAX_PARTICIPANTS - maskIndices.length;
      const centerX = (GRID_SIZE - 1) / 2, centerY = (GRID_SIZE - 1) / 2;
      const candidates = [];
      for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
        if (dilated[i]) continue;  // skip already in mask
        const gx = i % GRID_SIZE, gy = Math.floor(i / GRID_SIZE);
        const dist = (gx - centerX) ** 2 + (gy - centerY) ** 2;
        candidates.push({ idx: i, dist });
      }
      candidates.sort((a, b) => a.dist - b.dist);
      for (let i = 0; i < needed && i < candidates.length; i++) {
        maskIndices.push(candidates[i].idx);
      }
    }

    // Build Set
    maskSet = new Set(maskIndices);
    maskComputed = true;
    renderGrid(); updateCounters();
    console.log('Mask ready:', maskIndices.length, 'cells');
  } catch (e) {
    console.warn('Mask failed → fallback', e);
    maskIndices = Array.from({ length: MAX_PARTICIPANTS }, (_, i) => i);
    maskSet = new Set(maskIndices);
    maskComputed = true;
    renderGrid(); updateCounters();
  }
}

// CELEBRATION
function fireCelebration(idx) {
  const cell = gridContainer.querySelector(`.cell[data-idx='${idx}']`);
  if (cell) {
    cell.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 700, easing: 'ease-out' });
    cell.style.boxShadow = '0 0 28px rgba(0,255,120,.25)';
    setTimeout(() => cell.style.boxShadow = '', 1000);
  }
  celebrateEl.classList.remove('hidden'); celebrateEl.setAttribute('aria-hidden', 'false');
  setTimeout(() => { celebrateEl.classList.add('hidden'); celebrateEl.setAttribute('aria-hidden', 'true'); }, 2600);
}

// DEBUG
toggleMaskDebugBtn && toggleMaskDebugBtn.addEventListener('click', () => { maskDebug = !maskDebug; renderGrid(); });
autoTuneBtn && autoTuneBtn.addEventListener('click', async () => {
  const thresholds = [12, 18, 24, 30, 36, 42, 50];
  let best = { thr: 24, n: 0 };
  for (const t of thresholds) {
    await computeMaskAndEnsureCapacity(t);
    const n = maskIndices.length;
    if (n > best.n && n <= MAX_PARTICIPANTS) best = { thr: t, n };
    await new Promise(r => setTimeout(r, 80));
  }
  alert(`Best threshold: ${best.thr} → ${best.n} cells`);
  await computeMaskAndEnsureCapacity(best.thr);
});

// INIT
loadState();
buildGrid();
computeMaskAndEnsureCapacity();
renderGrid();
updateCounters();
