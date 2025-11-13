// Updated script.js
// Improvements:
// 1) Robust mask sampling: draw logo to a GRID_SIZE x GRID_SIZE canvas and sample alpha per-grid-cell
// 2) Reliable avatar rendering: load avatar, draw to small canvas, convert to dataURL (avoids background-image CORS/redirect problems)
// 3) Graceful fallbacks and clearer console warnings

const GRID_SIZE = 40; // grid (40x40)
const CELL_PX = 20;
const STORAGE_KEY = 'ritual_pixels_v2';
const LOGO_PATH = 'assets/logo/ritual-logo.png'; // ensure exists
const AVATAR_PROXY_BASE = 'https://unavatar.io/twitter/'; // we'll append .png

let pixels = {}; // idx -> { username, caption, avatarDataUrl }
let selectedIndex = null;
let maskIndices = []; // indices allowed to click
let maskComputed = false;

const gridContainer = document.getElementById('gridContainer');
const maskCanvas = document.getElementById('maskCanvas'); // used for some operations but we use a dedicated small canvas too
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

function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) pixels = JSON.parse(raw);
  } catch(e) {
    console.warn('loadState failed', e);
  }
}
function saveState(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels));
  } catch(e){
    console.warn('saveState failed', e);
  }
}

function buildGrid(){
  gridContainer.style.width = (GRID_SIZE*CELL_PX)+'px';
  gridContainer.style.height = (GRID_SIZE*CELL_PX)+'px';
  gridContainer.innerHTML = '';
  for(let y=0;y<GRID_SIZE;y++){
    for(let x=0;x<GRID_SIZE;x++){
      const idx = y*GRID_SIZE + x;
      const cell = document.createElement('div');
      cell.className = 'cell empty';
      cell.dataset.idx = idx;
      cell.style.width = CELL_PX+'px';
      cell.style.height = CELL_PX+'px';
      cell.addEventListener('click', onCellClick);
      gridContainer.appendChild(cell);
    }
  }
}

// CLICK handler respects maskIndices; if mask not computed we temporarily allow clicks after sampling attempt
function onCellClick(e){
  const idx = Number(e.currentTarget.dataset.idx);
  if(!maskComputed){
    alert('Still computing logo mask — please wait a second and try again.');
    return;
  }
  if(!isMaskedIndex(idx)){
    // not part of logo
    return;
  }
  if(pixels[idx]) return alert('Pixel already placed. Pick another spot.');
  selectedIndex = idx;
  usernameInput.value = '';
  captionInput.value = '';
  avatarPreviewWrap.style.display = 'none';
  modal.classList.remove('hidden');
}

function close(){ modal.classList.add('hidden'); selectedIndex = null }
closeModal.addEventListener('click', close);

placeBtn.addEventListener('click', ()=>{
  const u = usernameInput.value.trim();
  if(!u) return alert('Enter X username (no @) or fetch avatar first.');
  const c = captionInput.value.trim();
  const avatarDataURL = avatarPreview.dataset.dataurl || null;
  // store avatarDataURL when available; else will store null - render will fallback to remote URL
  pixels[selectedIndex] = { username: u, caption: c, avatar: avatarDataURL };
  saveState();
  renderGrid();
  updateCounters();
  close();
});

// Avatar fetch -> draw -> dataURL
fetchAvatarBtn.addEventListener('click', async ()=>{
  const u = usernameInput.value.trim();
  if(!u) return alert('Type the X username first (no @).');
  const avatarUrl = AVATAR_PROXY_BASE + encodeURIComponent(u) + '.png';
  // load image with crossOrigin and draw to tiny canvas
  try {
    const img = await loadImageWithCors(avatarUrl);
    // draw to small square canvas (CELL_PX x CELL_PX) preserving aspect by cover-fill
    const tmp = document.createElement('canvas');
    tmp.width = CELL_PX;
    tmp.height = CELL_PX;
    const ctx = tmp.getContext('2d');
    // cover: scale img so it fills canvas
    const ar = img.width / img.height;
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if(ar > 1){
      // wider -> crop sides
      sh = img.height;
      sw = img.height * (tmp.width / tmp.height);
      sx = Math.round((img.width - sw)/2);
    } else {
      // taller -> crop top/bottom
      sw = img.width;
      sh = img.width * (tmp.height / tmp.width);
      sy = Math.round((img.height - sh)/2);
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
    const dataUrl = tmp.toDataURL('image/png');
    avatarPreview.src = dataUrl;
    avatarPreview.dataset.dataurl = dataUrl;
    avatarPreview.dataset.url = avatarUrl;
    avatarName.textContent = '@' + u;
    avatarPreviewWrap.style.display = 'flex';
  } catch(err) {
    console.warn('Avatar fetch/draw failed', err);
    // fallback: try to use remote URL directly (may work as background-image)
    avatarPreviewWrap.style.display = 'none';
    if(confirm('Failed to fetch avatar via proxy+canvas (CORS). Try using remote URL directly?')) {
      // set preview to remote url to let user confirm if it loads in their browser
      avatarPreview.src = AVATAR_PROXY_BASE + encodeURIComponent(u);
      avatarPreview.dataset.dataurl = ''; // no dataurl
      avatarPreview.dataset.url = AVATAR_PROXY_BASE + encodeURIComponent(u);
      avatarName.textContent = '@' + u;
      avatarPreviewWrap.style.display = 'flex';
    } else {
      alert('Okay — avatar not set. You can still place a pixel without avatar.');
    }
  }
});

// helper to load image with crossOrigin and return a Promise<HTMLImageElement>
function loadImageWithCors(url){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=>resolve(img);
    img.onerror = (e)=>reject(new Error('Image load error: ' + url));
    img.src = url + ((url.indexOf('?') === -1) ? '?v=' + Date.now() : '&v=' + Date.now());
  });
}

function renderGrid(){
  for(const el of gridContainer.children){
    const idx = Number(el.dataset.idx);
    if(pixels[idx]){
      const p = pixels[idx];
      el.classList.remove('empty');
      el.classList.add('filled');
      if(p.avatar){
        el.style.backgroundImage = `url("${p.avatar}")`;
        el.classList.add('filled-avatar');
      } else if(p.avatar === '') {
        // stored empty string means remote url is available in dataset.url (fall back)
        el.style.backgroundImage = `url("${AVATAR_PROXY_BASE + encodeURIComponent(p.username)}")`;
        el.classList.add('filled-avatar');
      } else {
        el.style.backgroundImage = '';
        el.classList.remove('filled-avatar');
        el.style.backgroundColor = '#ffffff';
      }
      el.title = `${p.username}${p.caption ? ' — ' + p.caption : ''}`;
    } else {
      if(isMaskedIndex(idx)) el.classList.add('hoverable'); else el.classList.remove('hoverable');
      el.classList.remove('filled');
      el.classList.remove('filled-avatar');
      el.classList.add('empty');
      el.style.backgroundImage = '';
      el.style.backgroundColor = 'transparent';
      el.title = '';
    }
  }
}

function updateCounters(){
  const total = maskIndices.length;
  const filled = Object.keys(pixels).length;
  totalPixelsEl.textContent = total;
  filledPixelsEl.textContent = filled;
}

// ===== improved mask computation =====
// Instead of sampling many pixels of a large image and mapping them into grid cells,
// we draw the logo into a small canvas of size GRID_SIZE x GRID_SIZE and sample each pixel's alpha.
// This gives a direct 1:1 mapping from small-canvas-pixel -> grid cell.
async function computeMask(){
  maskComputed = false;
  maskIndices = [];
  try {
    const img = await loadImageWithCors(LOGO_PATH);
    // tiny canvas sized GRID_SIZE x GRID_SIZE
    const tiny = document.createElement('canvas');
    tiny.width = GRID_SIZE;
    tiny.height = GRID_SIZE;
    const tctx = tiny.getContext('2d');
    // Clear and fill transparent background
    tctx.clearRect(0,0,tiny.width,tiny.height);

    // Draw logo scaled to cover the tiny canvas while preserving aspect ratio and centered
    const ar = img.width / img.height;
    let dw = tiny.width, dh = tiny.height, dx = 0, dy = 0;
    if(ar > 1){
      // wider - fit width, full height crop vertically
      dw = tiny.width;
      dh = Math.round(tiny.width / ar);
      dy = Math.round((tiny.height - dh)/2);
    } else {
      // taller - fit height, crop horizontally
      dh = tiny.height;
      dw = Math.round(tiny.height * ar);
      dx = Math.round((tiny.width - dw)/2);
    }
    tctx.drawImage(img, dx, dy, dw, dh);

    const d = tctx.getImageData(0,0,tiny.width,tiny.height).data;
    for(let gy=0; gy<GRID_SIZE; gy++){
      for(let gx=0; gx<GRID_SIZE; gx++){
        const px = (gy * GRID_SIZE + gx) * 4;
        const a = d[px+3];
        if(a > 10){ // non-trivial alpha -> this cell is part of the logo
          maskIndices.push(gy * GRID_SIZE + gx);
        }
      }
    }

    if(maskIndices.length === 0){
      console.warn('Mask computed but no opaque pixels found. Check your logo transparency and that the logo is visible when centered.');
      // fallback: allow clicks anywhere (optional) - here we will not auto-allow; we keep mask empty to avoid mis-clicks
    } else {
      console.log('Mask computed. total cells in logo:', maskIndices.length);
    }
    maskComputed = true;
    renderGrid();
    updateCounters();
  } catch(err){
    console.warn('computeMask failed (CORS or missing file). Ensure', LOGO_PATH, 'is served from same origin or allows CORS.', err);
    // Try to still let user proceed: mark maskComputed true but maskIndices empty (no clickable cells)
    maskComputed = true;
    // Optional fallback: if you'd rather allow all cells clickable in this situation, uncomment:
    // maskIndices = Array.from({length: GRID_SIZE*GRID_SIZE}, (_,i)=>i);
    updateCounters();
    renderGrid();
  }
}

function isMaskedIndex(idx){
  return maskIndices.indexOf(idx) !== -1;
}

// init
loadState();
buildGrid();
computeMask();
renderGrid();
updateCounters();
