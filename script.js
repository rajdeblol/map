// FINAL script.js
// Features included:
// - grid overlay matched to visible logo (logo is <img id="logoImg">)
// - mask computed from logo PNG using luminance + morphological closing (dilate->erode)
// - strict "inside mask only" placement (click outside flashes nearest allowed cell)
// - sanitize stored pixels: move out-of-mask stored pixels to nearest empty allowed cell or remove
// - avatar fetch via unavatar (CORS->fallback remote), upload, per-cell avatar placed exactly
// - view-only modal on filled cells (username + pledge), read-only
// - debug toggle + auto-tune thresholds

const GRID_SIZE = 60;
const CELL_PX = 15;
const LOGO_SCALE = 1.12;        // MUST match CSS --logo-scale in index.html
const STORAGE_KEY = 'ritual_pixels_final_v2';
const LOGO_PATH = 'assets/logo/ritual-logo.png';
const MASK_RADIUS = 1;          // morphological closing radius

let pixels = {};   // idx -> { username, caption, avatar, ts }
let maskIndices = [];
let maskComputed = false;
let maskDebug = false;

const gridContainer = document.getElementById('gridContainer');
const logoImg = document.getElementById('logoImg');
const totalPixelsEl = document.getElementById('totalPixels');
const filledPixelsEl = document.getElementById('filledPixels');
const toastEl = document.getElementById('toast');

const modal = document.getElementById('modal');
const closeModal = document.getElementById('closeModal');
const usernameInput = document.getElementById('username');
const fetchAvatar = document.getElementById('fetchAvatar');
const avatarPreviewWrap = document.getElementById('avatarPreviewWrap');
const avatarPreview = document.getElementById('avatarPreview');
const avatarName = document.getElementById('avatarName');
const removeAvatar = document.getElementById('removeAvatar');
const avatarUpload = document.getElementById('avatarUpload');
const captionInput = document.getElementById('caption');
const placeBtn = document.getElementById('placeBtn');

const viewModal = document.getElementById('viewModal');
const viewClose = document.getElementById('viewClose');
const viewAvatar = document.getElementById('viewAvatar');
const viewHandle = document.getElementById('viewHandle');
const viewPledge = document.getElementById('viewPledge');

const toggleMaskDebug = document.getElementById('toggleMaskDebug');
const autoTune = document.getElementById('autoTune');

// ---------- storage ----------
function loadState(){
  try { const raw = localStorage.getItem(STORAGE_KEY); if(raw) pixels = JSON.parse(raw); } catch(e){ console.warn('loadState failed', e); }
}
function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels)); } catch(e){ console.warn('saveState failed', e); } }

// ---------- build grid ----------
function buildGrid(){
  gridContainer.innerHTML = '';
  gridContainer.style.setProperty('--cols', GRID_SIZE);
  gridContainer.style.width = `${GRID_SIZE * CELL_PX}px`;
  gridContainer.style.height = `${GRID_SIZE * CELL_PX}px`;
  for(let i=0;i<GRID_SIZE*GRID_SIZE;i++){
    const cell = document.createElement('div');
    cell.className = 'cell empty';
    cell.dataset.idx = i;
    cell.style.width = `${CELL_PX}px`;
    cell.style.height = `${CELL_PX}px`;
    cell.addEventListener('click', onCellClick);
    cell.addEventListener('mousedown', (e)=> e.preventDefault());
    gridContainer.appendChild(cell);
  }
}

// ---------- click handling ----------
let selectedIndex = null;
function onCellClick(e){
  const idx = Number(e.currentTarget.dataset.idx);
  if(pixels[idx]) { openViewModal(idx); return; }
  if(!maskComputed){ showToast('Mask is still computing — wait a moment'); return; }
  if(!isMaskedIndex(idx)){ showToast('Only cells inside the lit logo accept placements.'); const n = findNearestMaskIndex(idx); if(n!==null) flashCell(n); return; }
  openPlacementModal(idx);
}

// ---------- placement modal ----------
function openPlacementModal(idx){
  selectedIndex = idx;
  if(usernameInput) usernameInput.value = '';
  if(captionInput) captionInput.value = '';
  if(avatarPreviewWrap) avatarPreviewWrap.style.display = 'none';
  if(avatarPreview){ avatarPreview.src=''; avatarPreview.dataset.dataurl=''; avatarPreview.dataset.url=''; }
  modal.classList.remove('hidden');
  setTimeout(()=> usernameInput && usernameInput.focus(), 50);
}
function closePlacementModal(){ modal.classList.add('hidden'); selectedIndex = null; }
closeModal && closeModal.addEventListener('click', closePlacementModal);

// ---------- place pixel ----------
placeBtn && placeBtn.addEventListener('click', ()=>{
  if(selectedIndex === null){ alert('Select a cell inside the logo first'); return; }
  if(!isMaskedIndex(selectedIndex)){ alert('Cell not allowed'); closePlacementModal(); return; }
  if(pixels[selectedIndex]){ alert('That cell is already taken'); closePlacementModal(); return; }
  const u = usernameInput.value.trim();
  const avatarData = avatarPreview.dataset.dataurl || avatarPreview.dataset.url || null;
  if(!u && !avatarData) return alert('Provide an X handle or upload an avatar.');
  const c = captionInput.value.trim();
  pixels[selectedIndex] = { username: u || 'uploader', caption: c || '', avatar: avatarData || null, ts: Date.now() };
  saveState();
  renderGrid();
  updateCounters();
  closePlacementModal();
  fireCelebration(selectedIndex);
  selectedIndex = null;
});

// ---------- view modal ----------
function openViewModal(idx){
  const p = pixels[idx]; if(!p) return;
  viewAvatar.src = p.avatar || 'assets/decor/skull.png';
  viewHandle.textContent = p.username ? (p.username.startsWith('@') ? p.username : '@'+p.username) : '(unknown)';
  viewPledge.textContent = p.caption || '(no pledge)';
  viewModal.classList.remove('hidden');
}
viewClose && viewClose.addEventListener('click', ()=> viewModal.classList.add('hidden'));

// ---------- avatar fetch & upload ----------
function loadImageWithCors(url){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=> resolve(img);
    img.onerror = ()=> reject(new Error('Image load error: ' + url));
    img.src = url + ((url.indexOf('?') === -1) ? '?v=' + Date.now() : '&v=' + Date.now());
  });
}

async function tryFetchAvatarToDataURL(username){
  const avatarUrl = `https://unavatar.io/twitter/${encodeURIComponent(username)}.png`;
  try {
    const img = await loadImageWithCors(avatarUrl);
    const tmp = document.createElement('canvas');
    tmp.width = CELL_PX; tmp.height = CELL_PX;
    const ctx = tmp.getContext('2d');
    const ar = img.width / img.height;
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if(ar > 1){ sh = img.height; sw = img.height * (tmp.width / tmp.height); sx = Math.round((img.width - sw) / 2); }
    else { sw = img.width; sh = img.width * (tmp.height / tmp.width); sy = Math.round((img.height - sh) / 2); }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
    return tmp.toDataURL('image/png');
  } catch(err){
    console.warn('Avatar fetch->canvas failed', err);
    return null;
  }
}

fetchAvatar && fetchAvatar.addEventListener('click', async ()=>{
  const u = usernameInput.value.trim();
  if(!u) return alert('Type the X username first');
  const dataUrl = await tryFetchAvatarToDataURL(u);
  if(dataUrl){
    avatarPreview.src = dataUrl;
    avatarPreview.dataset.dataurl = dataUrl;
    avatarPreview.dataset.url = '';
    avatarName.textContent = '@' + u;
    avatarPreviewWrap.style.display = 'flex';
  } else {
    const fallback = `https://unavatar.io/twitter/${encodeURIComponent(u)}.png`;
    if(confirm('Avatar fetch to canvas failed (CORS). Use remote preview instead?')){
      avatarPreview.src = fallback;
      avatarPreview.dataset.dataurl = '';
      avatarPreview.dataset.url = fallback;
      avatarName.textContent = '@' + u;
      avatarPreviewWrap.style.display = 'flex';
    } else alert('You can upload instead.');
  }
});

avatarUpload && avatarUpload.addEventListener('change', (e)=>{
  const f = e.target.files && e.target.files[0]; if(!f) return;
  if(!f.type.startsWith('image/')) return alert('Please upload an image file.');
  const reader = new FileReader();
  reader.onload = ()=>{ avatarPreview.src = reader.result; avatarPreview.dataset.dataurl = reader.result; avatarPreview.dataset.url = ''; avatarName.textContent = 'Uploaded image'; avatarPreviewWrap.style.display = 'flex'; };
  reader.onerror = ()=> alert('File read failed'); reader.readAsDataURL(f);
});
removeAvatar && removeAvatar.addEventListener('click', ()=>{ avatarPreview.src=''; avatarPreview.dataset.dataurl=''; avatarPreview.dataset.url=''; avatarPreviewWrap.style.display='none'; avatarName.textContent=''; if(avatarUpload) avatarUpload.value=''; });

// ---------- render grid ----------
function renderGrid(){
  for(const el of gridContainer.children){
    const idx = Number(el.dataset.idx);
    const existingImg = el.querySelector('.cell-avatar');
    if(pixels[idx]){
      const p = pixels[idx];
      el.classList.remove('empty'); el.classList.add('filled');
      let img = existingImg;
      if(!img){
        img = document.createElement('img');
        img.className = 'cell-avatar';
        img.style.pointerEvents = 'none';
        el.appendChild(img);
      }
      img.src = p.avatar || 'assets/decor/skull.png';
      el.title = `${p.username}${p.caption ? ' — ' + p.caption : ''}`;
    } else {
      el.classList.remove('filled'); el.classList.add('empty');
      if(existingImg) existingImg.remove();
      el.title = '';
      if(maskDebug && isMaskedIndex(idx)) el.classList.add('mask-debug'); else el.classList.remove('mask-debug');
      if(isMaskedIndex(idx)) el.classList.add('hoverable'); else el.classList.remove('hoverable');
    }
  }
}

function updateCounters(){
  totalPixelsEl.textContent = maskIndices.length;
  filledPixelsEl.textContent = Object.keys(pixels).length;
}

// ---------- morphological helpers ----------
function dilateMap(src){
  const out = new Uint8Array(src.length);
  const neighbors = [];
  for (let dy = -MASK_RADIUS; dy <= MASK_RADIUS; dy++){
    for (let dx = -MASK_RADIUS; dx <= MASK_RADIUS; dx++){
      neighbors.push([dx,dy]);
    }
  }
  for (let y=0;y<GRID_SIZE;y++){
    for (let x=0;x<GRID_SIZE;x++){
      const i = y*GRID_SIZE + x;
      if (src[i] === 1){ out[i] = 1; continue; }
      for (const [dx,dy] of neighbors){
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
        if (src[ny*GRID_SIZE + nx] === 1){ out[i] = 1; break; }
      }
    }
  }
  return out;
}

function erodeMap(src){
  const out = new Uint8Array(src.length);
  const neighbors = [];
  for (let dy = -MASK_RADIUS; dy <= MASK_RADIUS; dy++){
    for (let dx = -MASK_RADIUS; dx <= MASK_RADIUS; dx++){
      neighbors.push([dx,dy]);
    }
  }
  for (let y=0;y<GRID_SIZE;y++){
    for (let x=0;x<GRID_SIZE;x++){
      const i = y*GRID_SIZE + x;
      let keep = 1;
      for (const [dx,dy] of neighbors){
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE){ keep = 0; break; }
        if (src[ny*GRID_SIZE + nx] === 0){ keep = 0; break; }
      }
      out[i] = keep ? 1 : 0;
    }
  }
  return out;
}

// ---------- sanitize stored pixels that fall outside mask ----------
function sanitizeOutOfMask(){
  const moved = [];
  const removed = [];
  const occupied = new Set(Object.keys(pixels).map(k => Number(k)));

  for (const key of Object.keys(pixels)){
    const idx = Number(key);
    if (!isMaskedIndex(idx)){
      // find nearest allowed empty cell
      let target = null;
      let bestD = Infinity;
      for (const m of maskIndices){
        if (occupied.has(m)) continue;
        const my = Math.floor(m / GRID_SIZE), mx = m % GRID_SIZE;
        const iy = Math.floor(idx / GRID_SIZE), ix = idx % GRID_SIZE;
        const dx = mx - ix, dy = my - iy;
        const d = dx*dx + dy*dy;
        if (d < bestD){ bestD = d; target = m; }
      }
      if (target !== null){
        pixels[target] = pixels[idx];
        delete pixels[idx];
        occupied.delete(idx); occupied.add(target);
        moved.push({ from: idx, to: target });
      } else {
        delete pixels[idx];
        occupied.delete(idx);
        removed.push(idx);
      }
    }
  }

  if (moved.length || removed.length){
    console.log('Sanitized out-of-mask pixels — moved:', moved, 'removed:', removed);
    saveState();
  }
}

// ---------- mask computation (luminance + closing) ----------
async function computeMask(threshold = 28){
  maskComputed = false; maskIndices = [];
  try {
    const img = await loadImageWithCors(LOGO_PATH);
    const tiny = document.createElement('canvas'); tiny.width = GRID_SIZE; tiny.height = GRID_SIZE;
    const tctx = tiny.getContext('2d');
    tctx.clearRect(0,0,tiny.width,tiny.height);

    // compute "contain" draw then apply LOGO_SCALE to match visible enlarged logo
    const ar = img.width / img.height;
    let dw = tiny.width, dh = tiny.height;
    if (ar > 1){ dw = tiny.width; dh = Math.round(tiny.width / ar); }
    else { dh = tiny.height; dw = Math.round(tiny.height * ar); }

    const scaledW = Math.round(dw * LOGO_SCALE);
    const scaledH = Math.round(dh * LOGO_SCALE);
    const sx = Math.round((tiny.width - scaledW)/2);
    const sy = Math.round((tiny.height - scaledH)/2);

    tctx.drawImage(img, 0, 0, img.width, img.height, sx, sy, scaledW, scaledH);

    const imgData = tctx.getImageData(0,0,tiny.width,tiny.height).data;
    const base = new Uint8Array(GRID_SIZE * GRID_SIZE);
    for (let y=0;y<GRID_SIZE;y++){
      for (let x=0;x<GRID_SIZE;x++){
        const p = (y*GRID_SIZE + x)*4;
        const r = imgData[p], g = imgData[p+1], b = imgData[p+2];
        const lum = 0.2126*r + 0.7152*g + 0.0722*b;
        if (lum > threshold) base[y*GRID_SIZE + x] = 1;
      }
    }

    // closing = dilate then erode to fill tiny holes
    const dilated = dilateMap(base);
    const closed = erodeMap(dilated);

    // final map = closed (you may OR with base to preserve ultra-thin strokes)
    const finalMap = closed;

    for (let i=0;i<finalMap.length;i++) if(finalMap[i]) maskIndices.push(i);

    if (maskIndices.length === 0){
      // fallback cluster (should be rare)
      const center = Math.floor((GRID_SIZE*GRID_SIZE)/2);
      maskIndices = Array.from({length: Math.min(400, GRID_SIZE*GRID_SIZE)}, (_,i)=> (center + i) % (GRID_SIZE*GRID_SIZE));
      console.warn('Mask empty — used fallback cluster');
    }

    // sanitize stored placements (move/remove out-of-mask)
    sanitizeOutOfMask();

    maskComputed = true;
    renderGrid();
    updateCounters();
    console.log('Mask computed (closing):', maskIndices.length);
  } catch(err){
    console.warn('computeMask failed', err);
    maskIndices = Array.from({length: Math.min(400, GRID_SIZE*GRID_SIZE)}, (_,i)=>i);
    sanitizeOutOfMask();
    maskComputed = true;
    renderGrid();
    updateCounters();
  }
}

function isMaskedIndex(idx){ return maskIndices.indexOf(idx) !== -1; }

// find nearest masked index (used to flash when user clicks outside)
function findNearestMaskIndex(idx){
  if(maskIndices.length === 0) return null;
  const gy = Math.floor(idx / GRID_SIZE), gx = idx % GRID_SIZE;
  let best = null, bestD = 1e12;
  for(const m of maskIndices){
    const my = Math.floor(m / GRID_SIZE), mx = m % GRID_SIZE;
    const dx = mx - gx, dy = my - gy, d = dx*dx + dy*dy;
    if(d < bestD){ bestD = d; best = m; }
  }
  return best;
}

function flashCell(idx){
  const c = gridContainer.querySelector(`.cell[data-idx='${idx}']`);
  if(!c) return;
  c.animate([{ boxShadow: '0 0 0 rgba(0,255,120,0.0)' }, { boxShadow: '0 0 18px rgba(0,255,120,0.28)' }, { boxShadow: '0 0 0 rgba(0,255,120,0.0)' }], { duration: 900, easing: 'ease-out' });
}

// toast
let _tt = null;
function showToast(text, ms = 1600){
  if(!toastEl) return;
  toastEl.textContent = text; toastEl.style.display = 'block'; toastEl.style.opacity = '1';
  if(_tt) clearTimeout(_tt);
  _tt = setTimeout(()=>{ toastEl.style.opacity = '0'; setTimeout(()=> toastEl.style.display = 'none',200); }, ms);
}

// celebration
function fireCelebration(idx){
  const c = gridContainer.querySelector(`.cell[data-idx='${idx}']`);
  if(c){ c.animate([{transform:'scale(1)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:650}); c.style.boxShadow = '0 0 26px rgba(0,255,120,0.25)'; setTimeout(()=> c.style.boxShadow = '',1100); }
}

// debug / auto-tune
toggleMaskDebug && toggleMaskDebug.addEventListener('click', ()=>{
  maskDebug = !maskDebug; renderGrid();
});

autoTune && autoTune.addEventListener('click', async ()=>{
  const candidates = [12,18,24,28,34,40,48];
  let best = {thr:28, n:0};
  for(const t of candidates){
    await computeMask(t);
    if(maskIndices.length > best.n) best = {thr:t, n:maskIndices.length};
    await new Promise(r=>setTimeout(r,60));
  }
  alert(`Auto-tune selected threshold ${best.thr} -> ${best.n} cells`);
  await computeMask(best.thr);
});

// close modals with Escape / overlay click
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ modal && modal.classList.add('hidden'); viewModal && viewModal.classList.add('hidden'); } });
modal && modal.addEventListener('click', (e)=> { if(e.target === modal) modal.classList.add('hidden'); });
viewModal && viewModal.addEventListener('click', (e)=> { if(e.target === viewModal) viewModal.classList.add('hidden'); });

// ---------- init ----------
loadState();
buildGrid();
computeMask();  // once computed, renderGrid and counters will update
renderGrid();
updateCounters();
