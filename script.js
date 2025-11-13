// ritual script v4 - FULLY FIXED (clicks work everywhere in logo)
// - Fixed dilation (separate buffer)
// - Fixed duplicates & mask lookup with Set (O(1))
// - Expansion to 1000 participants
// - All features: avatar, upload, celebration, debug, auto-tune

const GRID_SIZE = 60;
const CELL_PX = 15;
const STORAGE_KEY = 'ritual_pixels_v4';
const LOGO_PATH = 'assets/logo/ritual-logo.png';
const MAX_PARTICIPANTS = 1000;

let pixels = {}; // idx -> { username, caption, avatar (dataURL), ts }
let selectedIndex = null;
let maskIndices = [];
let maskSet = new Set(); // FAST LOOKUP
let maskComputed = false;
let maskDebug = false;
let allowAnywhere = false;

const gridContainer = document.getElementById('gridContainer');
const modal = document.getElementById('modal');
const usernameInput = document.getElementById('username');
const captionInput = document.getElementById('caption');
const placeBtn = document.getElementById('placeBtn');
const closeModal = document.getElementById('closeModal');
const totalPixelsEl = document.getElementById('totalPixels');
const filledPixelsEl = document.getElementById('filledPixels');

const fetchAvatarBtn = document.getElementById('fetchAvatar');
const avatarPreviewWrap = document.getElementById('avatarPreviewWrap');
const avatarPreview = document.getElementById('avatarPreview');
const avatarName = document.getElementById('avatarName');
const removeAvatarBtn = document.getElementById('removeAvatar');
const avatarUploadInput = document.getElementById('avatarUpload');

const celebrateEl = document.getElementById('celebrate');
const toggleMaskDebugBtn = document.getElementById('toggleMaskDebug');
const autoTuneBtn = document.getElementById('autoTune');
const allowAnywhereBtn = document.getElementById('allowAnywhereBtn');

// ---------- storage ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) pixels = JSON.parse(raw);
  } catch (e) {
    console.warn('loadState failed', e);
  }
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels));
  } catch (e) {
    console.warn('saveState', e);
  }
}

// ---------- grid build ----------
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
      cell.style.width = CELL_PX + 'px';
      cell.style.height = CELL_PX + 'px';
      cell.style.pointerEvents = 'auto';
      cell.addEventListener('click', onCellClick);
      cell.addEventListener('mousedown', e => e.preventDefault());
      gridContainer.appendChild(cell);
    }
  }
}

// ---------- clicks ----------
function onCellClick(e) {
  const idx = Number(e.currentTarget.dataset.idx);
  if (!maskComputed) {
    alert('Mask still computing — please wait a second.');
    return;
  }
  if (pixels[idx]) {
    alert('Pixel already placed. Choose another.');
    return;
  }
  if (maskSet.has(idx) || allowAnywhere) {
    openPlacementModalForIndex(idx);
  } else {
    showDebugToast(`Outside logo. Nearest allowed will be highlighted.`);
    const nearest = findNearestMaskIndex(idx);
    if (nearest !== null) flashCell(nearest);
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

function closeModalFn() {
  modal.classList.add('hidden');
  selectedIndex = null;
}
closeModal.addEventListener('click', closeModalFn);

// ---------- placement ----------
placeBtn.addEventListener('click', () => {
  if (selectedIndex === null) {
    alert('No cell selected. Click a cell first.');
    return;
  }
  const u = usernameInput.value.trim();
  const avatarData = avatarPreview.dataset.dataurl || null;
  if (!u && !avatarData) return alert('Add a username or upload an avatar.');
  const c = captionInput.value.trim();
  const usernameStored = u || 'uploader';
  pixels[selectedIndex] = {
    username: usernameStored,
    caption: c,
    avatar: avatarData || null,
    ts: Date.now()
  };
  saveState();
  renderGrid();
  updateCounters();
  modal.classList.add('hidden');
  fireCelebration(selectedIndex);
});

// ---------- avatar fetch & upload ----------
fetchAvatarBtn && fetchAvatarBtn.addEventListener('click', async () => {
  const u = usernameInput.value.trim();
  if (!u) return alert('Type the X username first (no @).');
  const avatarUrl = `https://unavatar.io/twitter/${encodeURIComponent(u)}.png`;
  try {
    const img = await loadImageWithCors(avatarUrl);
    const dataUrl = resizeToDataURL(img, CELL_PX, CELL_PX);
    avatarPreview.src = dataUrl;
    avatarPreview.dataset.dataurl = dataUrl;
    avatarPreview.dataset.url = avatarUrl;
    avatarName.textContent = '@' + u;
    avatarPreviewWrap.style.display = 'flex';
  } catch (err) {
    console.warn('Avatar fetch failed', err);
    if (confirm('Avatar fetch failed due to CORS. Use remote URL preview instead?')) {
      avatarPreview.src = avatarUrl;
      avatarPreview.dataset.dataurl = '';
      avatarPreview.dataset.url = avatarUrl;
      avatarName.textContent = '@' + u;
      avatarPreviewWrap.style.display = 'flex';
    } else {
      alert('Use upload instead.');
    }
  }
});

avatarUploadInput && avatarUploadInput.addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  if (!f.type.startsWith('image/')) return alert('Please upload an image.');
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const dataUrl = resizeToDataURL(img, CELL_PX, CELL_PX);
      avatarPreview.src = dataUrl;
      avatarPreview.dataset.dataurl = dataUrl;
      avatarPreview.dataset.url = '';
      avatarName.textContent = 'Uploaded image';
      avatarPreviewWrap.style.display = 'flex';
    };
    img.src = reader.result;
  };
  reader.onerror = () => alert('File read failed');
  reader.readAsDataURL(f);
});

removeAvatarBtn && removeAvatarBtn.addEventListener('click', () => {
  avatarPreview.src = '';
  avatarPreview.dataset.dataurl = '';
  avatarPreview.dataset.url = '';
  avatarPreviewWrap.style.display = 'none';
  avatarName.textContent = '';
  avatarUploadInput.value = '';
});

// helper - load image with CORS
function loadImageWithCors(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load error: ' + url));
    img.src = url + ((url.indexOf('?') === -1) ? '?v=' + Date.now() : '&v=' + Date.now());
  });
}

// helper - resize image to square dataURL
function resizeToDataURL(img, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const ar = img.width / img.height;
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (ar > 1) {
    sw = img.height; sh = img.height;
    sx = (img.width - sw) / 2;
  } else {
    sw = img.width; sh = img.width;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

// ---------- render ----------
function renderGrid() {
  for (const el of gridContainer.children) {
    const idx = Number(el.dataset.idx);
    if (pixels[idx]) {
      const p = pixels[idx];
      el.classList.remove('empty'); el.classList.add('filled');
      if (p.avatar) {
        el.style.backgroundImage = `url("${p.avatar}")`;
        el.classList.add('filled-avatar');
      } else {
        el.style.backgroundImage = '';
        el.classList.remove('filled-avatar');
        el.style.backgroundColor = '#dfffe8';
      }
      el.title = `${p.username}${p.caption ? ' — ' + p.caption : ''}`;
    } else {
      if (maskSet.has(idx)) el.classList.add('hoverable');
      else el.classList.remove('hoverable');
      el.classList.remove('filled', 'filled-avatar'); el.classList.add('empty');
      el.style.backgroundImage = ''; el.style.backgroundColor = 'transparent'; el.title = '';
      if (maskDebug && maskSet.has(idx)) el.classList.add('mask-debug');
      else el.classList.remove('mask-debug');
    }
  }
}

function updateCounters() {
  totalPixelsEl.textContent = Math.min(MAX_PARTICIPANTS, maskIndices.length || MAX_PARTICIPANTS);
  filledPixelsEl.textContent = Object.keys(pixels).length;
}

// ---------- mask computation (FIXED) ----------
async function computeMaskAndEnsureCapacity(threshold = 28) {
  maskComputed = false; maskIndices = []; maskSet.clear();
  try {
    const img = await loadImageWithCors(LOGO_PATH);
    const tiny = document.createElement('canvas');
    tiny.width = GRID_SIZE; tiny.height = GRID_SIZE;
    const tctx = tiny.getContext('2d');
    tctx.clearRect(0, 0, tiny.width, tiny.height);

    const ar = img.width / img.height;
    let dw = tiny.width, dh = tiny.height, dx = 0, dy = 0;
    if (ar > 1) {
      dw = tiny.width;
      dh = Math.round(tiny.width / ar);
      dy = Math.round((tiny.height - dh) / 2);
    } else {
      dh = tiny.height;
      dw = Math.round(tiny.height * ar);
      dx = Math.round((tiny.width - dw) / 2);
    }
    tctx.drawImage(img, dx, dy, dw, dh);

    const imgData = tctx.getImageData(0, 0, tiny.width, tiny.height).data;
    const map = new Uint8Array(GRID_SIZE * GRID_SIZE);
    const dilated = new Uint8Array(GRID_SIZE * GRID_SIZE);

    // 1. Luminance mask
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const p = (gy * GRID_SIZE + gx) * 4;
        const lum = 0.2126 * imgData[p] + 0.7152 * imgData[p + 1] + 0.0722 * imgData[p + 2];
        if (lum > threshold) map[gy * GRID_SIZE + gx] = 1;
      }
    }

    // 2. Dilation (separate buffer)
    const neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const idx = gy * GRID_SIZE + gx;
        if (map[idx] === 1) {
          dilated[idx] = 1;
          continue;
        }
        for (const [dx, dy] of neighbors) {
          const nx = gx + dx, ny = gy + dy;
          if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && map[ny * GRID_SIZE + nx] === 1) {
            dilated[idx] = 1;
            break;
          }
        }
      }
    }

    // 3. Collect unique indices
    for (let i = 0; i < dilated.length; i++) {
      if (dilated[i]) maskIndices.push(i);
    }

    // 4. Expand to MAX_PARTICIPANTS (nearest to center)
    if (maskIndices.length < MAX_PARTICIPANTS) {
      const needed = MAX_PARTICIPANTS - maskIndices.length;
      const centerX = (GRID_SIZE - 1) / 2, centerY = (GRID_SIZE - 1) / 2;
      const candidates = [];
      for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
        if (dilated[i]) continue;
        const gx = i % GRID_SIZE, gy = Math.floor(i / GRID_SIZE);
        const d = (gx - centerX) ** 2 + (gy - centerY) ** 2;
        candidates.push({ idx: i, d });
      }
      candidates.sort((a, b) => a.d - b.d);
      for (let i = 0; i < needed && i < candidates.length; i++) {
        maskIndices.push(candidates[i].idx);
      }
    }

    // Fallback
    if (maskIndices.length === 0) {
      maskIndices = Array.from({ length: Math.min(GRID_SIZE * GRID_SIZE, MAX_PARTICIPANTS) }, (_, i) => i);
      console.warn('Mask empty -> fallback to first cells.');
    }

    // Build fast lookup set
    maskSet = new Set(maskIndices);
    maskComputed = true;
    renderGrid(); updateCounters();
    console.log('Mask computed:', maskIndices.length, 'cells');

  } catch (err) {
    console.warn('computeMask failed', err);
    maskIndices = Array.from({ length: Math.min(GRID_SIZE * GRID_SIZE, MAX_PARTICIPANTS) }, (_, i) => i);
    maskSet = new Set(maskIndices);
    maskComputed = true;
    renderGrid(); updateCounters();
  }
}

function isMaskedIndex(idx) {
  return maskSet.has(idx);
}

// ---------- helpers ----------
function findNearestMaskIndex(idx) {
  if (!maskIndices.length) return null;
  const gy = Math.floor(idx / GRID_SIZE), gx = idx % GRID_SIZE;
  let best = null, bestD = 1e9;
  for (const m of maskIndices) {
    const my = Math.floor(m / GRID_SIZE), mx = m % GRID_SIZE;
    const d = (mx - gx) ** 2 + (my - gy) ** 2;
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

function flashCell(idx) {
  const c = gridContainer.querySelector(`.cell[data-idx='${idx}']`);
  if (!c) return;
  c.animate([
    { boxShadow: '0 0 0 rgba(0,255,120,0.0)' },
    { boxShadow: '0 0 18px rgba(0,255,120,0.28)' },
    { boxShadow: '0 0 0 rgba(0,255,120,0.0)' }
  ], { duration: 900, easing: 'ease-out' });
}

// celebration
function fireCelebration(idx) {
  const cell = gridContainer.querySelector(`.cell[data-idx='${idx}']`);
  if (cell) {
    cell.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.25)' },
      { transform: 'scale(1)' }
    ], { duration: 700, easing: 'ease-out' });
    cell.style.boxShadow = '0 0 28px rgba(0,255,120,0.25)';
    setTimeout(() => { cell.style.boxShadow = ''; }, 1000);
  }
  celebrateEl.classList.remove('hidden');
  celebrateEl.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    celebrateEl.classList.add('hidden');
    celebrateEl.setAttribute('aria-hidden', 'true');
  }, 2600);
}

// debug toast
let _toastTimer = null;
function showDebugToast(text) {
  console.log('[toast] ', text);
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { _toastTimer = null; }, 1200);
}

// ---------- debug controls ----------
toggleMaskDebugBtn && toggleMaskDebugBtn.addEventListener('click', () => {
  maskDebug = !maskDebug;
  renderGrid();
});

autoTuneBtn && autoTuneBtn.addEventListener('click', async () => {
  const candidates = [12, 18, 24, 30, 36, 42, 50];
  let best = { thr: 24, n: 0 };
  for (const t of candidates) {
    await computeMaskAndEnsureCapacity(t);
    const n = maskIndices.length;
    if (n > best.n && n <= MAX_PARTICIPANTS) best = { thr: t, n };
    await new Promise(r => setTimeout(r, 80));
  }
  alert(`Auto-tune selected threshold ${best.thr} → cells ${best.n}. Recomputing...`);
  await computeMaskAndEnsureCapacity(best.thr);
});

allowAnywhereBtn && allowAnywhereBtn.addEventListener('click', () => {
  allowAnywhere = !allowAnywhere;
  allowAnywhereBtn.textContent = `Allow anywhere: ${allowAnywhere ? 'ON' : 'OFF'}`;
  allowAnywhereBtn.style.background = allowAnywhere ? 'linear-gradient(90deg,#ffdd00,#a6ff00)' : '';
});

// ---------- init ----------
loadState();
buildGrid();
computeMaskAndEnsureCapacity();
renderGrid();
updateCounters();
