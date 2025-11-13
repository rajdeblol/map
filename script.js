// updated script: exact avatar placement per cell + view-only modal on filled cells
// Keep GRID_SIZE and CELL_PX consistent with style.css (60, 15) or adjust both.

const GRID_SIZE = 60;
const CELL_PX = 15;
const STORAGE_KEY = 'ritual_pixels_final_v2';
const LOGO_PATH = 'assets/logo/ritual-logo.png';
const MAX_PARTICIPANTS = 1000;

let pixels = {}; // idx -> { username, caption, avatar (dataURL or remote) }
let selectedIndex = null;
let maskIndices = [];
let maskComputed = false;
let maskDebug = false;

const gridContainer = document.getElementById('gridContainer');
const maskCanvas = document.getElementById('maskCanvas');

const modal = document.getElementById('modal');
const usernameInput = document.getElementById('username');
const captionInput = document.getElementById('caption');
const placeBtn = document.getElementById('placeBtn');
const closeModal = document.getElementById('closeModal');
const avatarPreviewWrap = document.getElementById('avatarPreviewWrap');
const avatarPreview = document.getElementById('avatarPreview');
const avatarName = document.getElementById('avatarName');
const fetchAvatarBtn = document.getElementById('fetchAvatar');
const avatarUploadInput = document.getElementById('avatarUpload');
const removeAvatarBtn = document.getElementById('removeAvatar');

const viewModal = document.getElementById('viewModal');
const viewAvatar = document.getElementById('viewAvatar');
const viewHandle = document.getElementById('viewHandle');
const viewPledge = document.getElementById('viewPledge');
const viewClose = document.getElementById('viewClose');

const celebrateEl = document.getElementById('celebrate');
const totalPixelsEl = document.getElementById('totalPixels');
const filledPixelsEl = document.getElementById('filledPixels');

const toggleMaskDebugBtn = document.getElementById('toggleMaskDebug');
const autoTuneBtn = document.getElementById('autoTune');

// ---------- storage ----------
function loadState(){
  try { const raw = localStorage.getItem(STORAGE_KEY); if(raw) pixels = JSON.parse(raw); } catch(e){ console.warn('loadState failed', e); }
}
function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels)); } catch(e){ console.warn('saveState failed', e); } }

// ---------- grid build (every cell clickable) ----------
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
      cell.style.width = CELL_PX + 'px';
      cell.style.height = CELL_PX + 'px';
      cell.style.pointerEvents = 'auto';
      // click: open view if filled, else placement
      cell.addEventListener('click', (e)=>{
        const i = Number(e.currentTarget.dataset.idx);
        if(pixels[i]) openViewModal(i); else openPlacementModalForIndex(i);
      });
      cell.addEventListener('mousedown', (e)=> e.preventDefault());
      gridContainer.appendChild(cell);
    }
  }
}

// ---------- open placement modal ----------
function openPlacementModalForIndex(idx){
  selectedIndex = idx;
  usernameInput.value = '';
  captionInput.value = '';
  avatarPreviewWrap.style.display = 'none';
  avatarPreview.dataset.dataurl = '';
  avatarPreview.dataset.url = '';
  modal.classList.remove('hidden');
  setTimeout(()=> usernameInput.focus(), 60);
}
closeModal.addEventListener('click', ()=> { modal.classList.add('hidden'); selectedIndex = null; });

// ---------- place pixel ----------
placeBtn.addEventListener('click', ()=>{
  if(selectedIndex === null){ alert('Click a cell first to place.'); return; }
  if(pixels[selectedIndex]){ alert('That cell is already taken.'); modal.classList.add('hidden'); selectedIndex = null; return; }
  const u = usernameInput.value.trim();
  const avatarData = avatarPreview.dataset.dataurl || avatarPreview.dataset.url || null;
  if(!u && !avatarData) return alert('Enter X username or upload an avatar.');
  const c = captionInput.value.trim();
  const usernameStored = u || 'uploader';
  // store avatar as dataURL if available (uploaded or converted), else keep remote URL
  pixels[selectedIndex] = { username: usernameStored, caption: c, avatar: avatarData || null, ts: Date.now() };
  saveState();
  renderGrid();
  updateCounters();
  modal.classList.add('hidden');
  fireCelebration(selectedIndex);
  selectedIndex = null;
});

// ---------- open view modal (read-only) ----------
function openViewModal(idx){
  const p = pixels[idx];
  if(!p) return;
  viewAvatar.src = p.avatar || 'assets/decor/skull.png';
  viewHandle.textContent = p.username.startsWith('@') ? p.username : '@' + p.username;
  viewPledge.textContent = p.caption || '(no pledge)';
  viewModal.classList.remove('hidden');
  // make sure user cannot edit (it's a view only)
}
viewClose.addEventListener('click', ()=> { viewModal.classList.add('hidden'); });

// ---------- avatar fetch & upload ----------
async function loadImageWithCors(url){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=> resolve(img);
    img.onerror = ()=> reject(new Error('Image load error: ' + url));
    img.src = url + ((url.indexOf('?') === -1) ? '?v=' + Date.now() : '&v=' + Date.now());
  });
}

// try fetch and convert to dataURL (preferred)
async function tryFetchAvatarToDataURL(username){
  const avatarUrl = `https://unavatar.io/twitter/${encodeURIComponent(username)}.png`;
  try {
    const img = await loadImageWithCors(avatarUrl);
    const tmp = document.createElement('canvas');
    tmp.width = CELL_PX; tmp.height = CELL_PX;
    const ctx = tmp.getContext('2d');
    // draw cover-style
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

fetchAvatarBtn && fetchAvatarBtn.addEventListener('click', async ()=>{
  const u = usernameInput.value.trim(); if(!u) return alert('Type the X username first (no @).');
  const dataUrl = await tryFetchAvatarToDataURL(u);
  if(dataUrl){
    avatarPreview.src = dataUrl;
    avatarPreview.dataset.dataurl = dataUrl;
    avatarPreview.dataset.url = '';
    avatarName.textContent = '@' + u;
    avatarPreviewWrap.style.display = 'flex';
  } else {
    // fallback preview remote url (will display as <img> but not usable for canvas)
    const fallback = `https://unavatar.io/twitter/${encodeURIComponent(u)}.png`;
    if(confirm('Avatar fetch to canvas failed (CORS). Use remote preview instead?')){
      avatarPreview.src = fallback;
      avatarPreview.dataset.dataurl = '';
      avatarPreview.dataset.url = fallback;
      avatarName.textContent = '@' + u;
      avatarPreviewWrap.style.display = 'flex';
    } else {
      alert('You can upload instead.');
    }
  }
});

// upload fallback (FileReader -> dataURL)
avatarUploadInput && avatarUploadInput.addEventListener('change', (e)=>{
  const f = e.target.files && e.target.files[0]; if(!f) return;
  if(!f.type.startsWith('image/')) return alert('Please upload an image file.');
  const reader = new FileReader();
  reader.onload = ()=>{ avatarPreview.src = reader.result; avatarPreview.dataset.dataurl = reader.result; avatarPreview.dataset.url = ''; avatarName.textContent = 'Uploaded image'; avatarPreviewWrap.style.display = 'flex'; };
  reader.onerror = ()=> alert('File read failed'); reader.readAsDataURL(f);
});
removeAvatarBtn && removeAvatarBtn.addEventListener('click', ()=>{ avatarPreview.src=''; avatarPreview.dataset.dataurl=''; avatarPreview.dataset.url=''; avatarPreviewWrap.style.display='none'; avatarName.textContent=''; avatarUploadInput.value=''; });

// ---------- render grid: use <img> inside cells for exact placement ----------
function renderGrid(){
  for(const el of gridContainer.children){
    const idx = Number(el.dataset.idx);
    // remove any old avatar element (we recreate / update)
    const existingImg = el.querySelector('.cell-avatar');
    if(pixels[idx]){
      const p = pixels[idx];
      el.classList.remove('empty'); el.classList.add('filled');
      // ensure avatar img present and src set
      let img = existingImg;
      if(!img){
        img = document.createElement('img');
        img.className = 'cell-avatar';
        // pointer-events none so clicks bubble to the cell (cell click opens view modal)
        img.style.pointerEvents = 'none';
        el.appendChild(img);
      }
      img.src = p.avatar || 'assets/decor/skull.png';
      el.title = `${p.username}${p.caption ? ' — ' + p.caption : ''}`;
    } else {
      el.classList.remove('filled'); el.classList.add('empty');
      if(existingImg) existingImg.remove();
      el.title = '';
      // visual hint if inside mask (hoverable)
      if(isMaskedIndex(idx)) el.classList.add('hoverable'); else el.classList.remove('hoverable');
      // debug outline
      if(maskDebug && isMaskedIndex(idx)) el.classList.add('mask-debug'); else el.classList.remove('mask-debug');
    }
  }
}

// counters
function updateCounters(){
  totalPixelsEl.textContent = Math.min(MAX_PARTICIPANTS, maskIndices.length || MAX_PARTICIPANTS);
  filledPixelsEl.textContent = Object.keys(pixels).length;
}

// ---------- mask compute (same luminance + dilation + expansion) ----------
async function computeMaskAndEnsureCapacity(threshold = 28){
  maskComputed = false; maskIndices = [];
  try {
    const img = await loadImageWithCors(LOGO_PATH);
    const tiny = document.createElement('canvas'); tiny.width = GRID_SIZE; tiny.height = GRID_SIZE;
    const tctx = tiny.getContext('2d');
    tctx.clearRect(0,0,tiny.width,tiny.height);

    const ar = img.width / img.height;
    let dw = tiny.width, dh = tiny.height, dx = 0, dy = 0;
    if(ar > 1){ dw = tiny.width; dh = Math.round(tiny.width / ar); dy = Math.round((tiny.height - dh) / 2); }
    else { dh = tiny.height; dw = Math.round(tiny.height * ar); dx = Math.round((tiny.width - dw) / 2); }
    tctx.drawImage(img, dx, dy, dw, dh);

    const imgData = tctx.getImageData(0,0,tiny.width,tiny.height).data;
    const map = new Uint8Array(GRID_SIZE * GRID_SIZE);
    for(let gy=0; gy<GRID_SIZE; gy++){
      for(let gx=0; gx<GRID_SIZE; gx++){
        const p = (gy * GRID_SIZE + gx) * 4;
        const r = imgData[p], g = imgData[p+1], b = imgData[p+2];
        const lum = 0.2126*r + 0.7152*g + 0.0722*b;
        if(lum > threshold) map[gy*GRID_SIZE + gx] = 1;
      }
    }

    // dilation
    const dilated = new Uint8Array(map);
    const neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(let gy=0; gy<GRID_SIZE; gy++){
      for(let gx=0; gx<GRID_SIZE; gx++){
        const idx = gy*GRID_SIZE + gx;
        if(map[idx] === 0){
          for(const [dxn,dyn] of neighbors){
            const nx = gx + dxn, ny = gy + dyn;
            if(nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
            if(map[ny * GRID_SIZE + nx] === 1){ dilated[idx] = 1; break; }
          }
        }
      }
    }

    for(let i=0;i<dilated.length;i++) if(dilated[i]) maskIndices.push(i);

    // expand to capacity
    if(maskIndices.length < MAX_PARTICIPANTS){
      const needed = MAX_PARTICIPANTS - maskIndices.length;
      const present = new Set(maskIndices);
      const centerX = (GRID_SIZE - 1) / 2, centerY = (GRID_SIZE - 1) / 2;
      const distanceList = [];
      for(let gy=0; gy<GRID_SIZE; gy++){
        for(let gx=0; gx<GRID_SIZE; gx++){
          const idx = gy*GRID_SIZE + gx;
          if(present.has(idx)) continue;
          const dx = gx - centerX, dy = gy - centerY;
          const d = Math.sqrt(dx*dx + dy*dy);
          distanceList.push({ idx, d });
        }
      }
      distanceList.sort((a,b)=>a.d - b.d);
      for(let i=0;i<needed && i<distanceList.length;i++) maskIndices.push(distanceList[i].idx);
    }

    if(maskIndices.length === 0){
      maskIndices = Array.from({length: Math.min(GRID_SIZE*GRID_SIZE, MAX_PARTICIPANTS)}, (_,i)=>i);
      console.warn('Mask empty -> fallback.');
    }

    maskComputed = true;
    renderGrid(); updateCounters();
    console.log('Mask computed cells:', maskIndices.length);
  } catch(err){
    console.warn('computeMask failed', err);
    maskIndices = Array.from({length: Math.min(GRID_SIZE*GRID_SIZE, MAX_PARTICIPANTS)}, (_,i)=>i);
    maskComputed = true;
    renderGrid(); updateCounters();
  }
}

function isMaskedIndex(idx){ return maskIndices.indexOf(idx) !== -1; }

// ---------- celebration ----------
function fireCelebration(idx){
  const cell = gridContainer.querySelector(`.cell[data-idx='${idx}']`);
  if(cell){
    cell.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 650, easing: 'ease-out' });
    cell.style.boxShadow = '0 0 28px rgba(0,255,120,0.25)';
    setTimeout(()=>{ cell.style.boxShadow = ''; }, 1100);
  }
  celebrateEl.classList.remove('hidden'); celebrateEl.setAttribute('aria-hidden','false');
  setTimeout(()=>{ celebrateEl.classList.add('hidden'); celebrateEl.setAttribute('aria-hidden','true'); }, 2600);
}

// ---------- debug controls ----------
toggleMaskDebugBtn && toggleMaskDebugBtn.addEventListener('click', ()=>{ maskDebug = !maskDebug; renderGrid(); });

autoTuneBtn && autoTuneBtn.addEventListener('click', async ()=>{
  const candidates = [12,18,24,30,36,42,50];
  let best = {thr:24, n:0};
  for(const t of candidates){
    await computeMaskAndEnsureCapacity(t);
    const n = maskIndices.length;
    if(n > best.n && n <= MAX_PARTICIPANTS) best = {thr:t, n};
    await new Promise(r=>setTimeout(r,80));
  }
  alert(`Auto-tune selected threshold ${best.thr} -> cells ${best.n}. Recomputing with that value.`);
  await computeMaskAndEnsureCapacity(best.thr);
});

// ---------- init ----------
loadState();
buildGrid();
computeMaskAndEnsureCapacity();
renderGrid();
updateCounters();

