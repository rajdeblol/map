// ritual script v4 (full)
// - luminance-based mask (works with gray-on-black logos)
// - 1px dilation, auto-expansion to MAX_PARTICIPANTS
// - avatar fetch + upload (dataURL storage)
// - celebration animation on placement
// - mask debug toggle + auto-tune helper

const GRID_SIZE = 60;   // 60x60 grid
const CELL_PX = 15;     // CSS cell size must match this
const STORAGE_KEY = 'ritual_pixels_v4';
const LOGO_PATH = 'assets/logo/ritual-logo.png';
const MAX_PARTICIPANTS = 1000;

let pixels = {}; // idx -> { username, caption, avatar (dataURL) }
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

function loadState(){
  try { const raw = localStorage.getItem(STORAGE_KEY); if(raw) pixels = JSON.parse(raw); } catch(e){ console.warn('loadState failed', e); }
}
function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels)); } catch(e){ console.warn('saveState', e); } }

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

function onCellClick(e){
  const idx = Number(e.currentTarget.dataset.idx);
  if(!maskComputed){ alert('Mask computing — wait a second.'); return; }
  if(!isMaskedIndex(idx)) return;
  if(pixels[idx]) return alert('Pixel already placed. Pick another spot.');
  selectedIndex = idx;
  usernameInput.value = '';
  captionInput.value = '';
  avatarPreviewWrap.style.display = 'none';
  avatarPreview.dataset.dataurl = '';
  avatarPreview.dataset.url = '';
  modal.classList.remove('hidden');
}

function closeModalFn(){ modal.classList.add('hidden'); selectedIndex = null }
closeModal.addEventListener('click', closeModalFn);

placeBtn.addEventListener('click', ()=>{
  const u = usernameInput.value.trim();
  const avatarData = avatarPreview.dataset.dataurl || null;
  if(!u && !avatarData) return alert('Add a username or upload an avatar.');
  const c = captionInput.value.trim();
  const usernameStored = u || 'uploader';
  pixels[selectedIndex] = { username: usernameStored, caption: c, avatar: avatarData || null, ts: Date.now() };
  saveState();
  renderGrid();
  updateCounters();
  modal.classList.add('hidden');
  fireCelebration(selectedIndex);
});

// Avatar fetch to dataURL (attempt via unavatar; may fail due to CORS -> upload fallback)
fetchAvatarBtn.addEventListener('click', async ()=>{
  const u = usernameInput.value.trim(); if(!u) return alert('Type the X username first (no @).');
  const avatarUrl = `https://unavatar.io/twitter/${encodeURIComponent(u)}.png`;
  try {
    const img = await loadImageWithCors(avatarUrl);
    const tmp = document.createElement('canvas'); tmp.width = CELL_PX; tmp.height = CELL_PX;
    const ctx = tmp.getContext('2d');
    const ar = img.width / img.height;
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if(ar > 1){ sh = img.height; sw = img.height * (tmp.width / tmp.height); sx = Math.round((img.width - sw)/2); }
    else { sw = img.width; sh = img.width * (tmp.height / tmp.width); sy = Math.round((img.height - sh)/2); }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
    const dataUrl = tmp.toDataURL('image/png');
    avatarPreview.src = dataUrl; avatarPreview.dataset.dataurl = dataUrl; avatarPreview.dataset.url = avatarUrl; avatarName.textContent = '@' + u; avatarPreviewWrap.style.display = 'flex';
  } catch(err){
    console.warn('Avatar fetch failed', err);
    if(confirm('Failed to fetch avatar due to CORS. Use remote URL preview instead?')){
      avatarPreview.src = avatarUrl; avatarPreview.dataset.dataurl = ''; avatarPreview.dataset.url = avatarUrl; avatarName.textContent = '@' + u; avatarPreviewWrap.style.display = 'flex';
    } else { alert('Use upload instead.'); }
  }
});

// upload fallback
avatarUploadInput.addEventListener('change', (e)=>{
  const f = e.target.files && e.target.files[0]; if(!f) return;
  if(!f.type.startsWith('image/')) return alert('Please upload an image.');
  const reader = new FileReader();
  reader.onload = ()=>{ avatarPreview.src = reader.result; avatarPreview.dataset.dataurl = reader.result; avatarPreview.dataset.url = ''; avatarName.textContent = 'Uploaded image'; avatarPreviewWrap.style.display = 'flex'; };
  reader.onerror = ()=> alert('File read failed'); reader.readAsDataURL(f);
});
removeAvatarBtn.addEventListener('click', ()=>{ avatarPreview.src=''; avatarPreview.dataset.dataurl=''; avatarPreview.dataset.url=''; avatarPreviewWrap.style.display='none'; avatarName.textContent=''; avatarUploadInput.value=''; });

// helper for loading image with CORS
function loadImageWithCors(url){ return new Promise((resolve,reject)=>{ const img=new Image(); img.crossOrigin='anonymous'; img.onload=()=>resolve(img); img.onerror=()=>reject(new Error('Image load error: '+url)); img.src = url + ((url.indexOf('?')===-1)?'?v='+Date.now():'&v='+Date.now()); }); }

function renderGrid(){
  for(const el of gridContainer.children){
    const idx = Number(el.dataset.idx);
    if(pixels[idx]){
      const p = pixels[idx];
      el.classList.remove('empty'); el.classList.add('filled');
      if(p.avatar){ el.style.backgroundImage = `url("${p.avatar}")`; el.classList.add('filled-avatar'); }
      else { el.style.backgroundImage = ''; el.classList.remove('filled-avatar'); el.style.backgroundColor = '#dfffe8'; }
      el.title = `${p.username}${p.caption? ' — '+p.caption: ''}`;
    } else {
      if(isMaskedIndex(idx)) el.classList.add('hoverable'); else el.classList.remove('hoverable');
      el.classList.remove('filled'); el.classList.remove('filled-avatar'); el.classList.add('empty'); el.style.backgroundImage=''; el.style.backgroundColor='transparent'; el.title='';
      if(maskDebug && isMaskedIndex(idx)) el.classList.add('mask-debug'); else el.classList.remove('mask-debug');
    }
  }
}

function updateCounters(){ totalPixelsEl.textContent = Math.min(MAX_PARTICIPANTS, maskIndices.length || MAX_PARTICIPANTS); filledPixelsEl.textContent = Object.keys(pixels).length; }

// ========= new luminance-based mask with dilation + expansion =========
async function computeMaskAndEnsureCapacity(threshold = 28){
  maskComputed = false; maskIndices = [];
  try {
    const img = await loadImageWithCors(LOGO_PATH);
    const tiny = document.createElement('canvas');
    tiny.width = GRID_SIZE; tiny.height = GRID_SIZE;
    const tctx = tiny.getContext('2d');
    tctx.clearRect(0,0,tiny.width,tiny.height);

    // draw logo scaled & centered (cover-like)
    const ar = img.width / img.height;
    let dw = tiny.width, dh = tiny.height, dx = 0, dy = 0;
    if(ar > 1){
      dw = tiny.width;
      dh = Math.round(tiny.width / ar);
      dy = Math.round((tiny.height - dh) / 2);
    } else {
      dh = tiny.height;
      dw = Math.round(tiny.height * ar);
      dx = Math.round((tiny.width - dw) / 2);
    }
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

    // 1-pixel dilation to fill thin gaps
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

    // collect maskIndices
    for(let i=0;i<dilated.length;i++) if(dilated[i]) maskIndices.push(i);

    // expand to capacity (nearest to center)
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

    // last-resort fallback
    if(maskIndices.length === 0){
      maskIndices = Array.from({length: Math.min(GRID_SIZE*GRID_SIZE, MAX_PARTICIPANTS)}, (_,i)=>i);
      console.warn('Mask empty -> fallback to first cells.');
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

// ========== celebration ==========
function fireCelebration(idx){
  // cell pulse
  const cell = gridContainer.querySelector(`.cell[data-idx='${idx}']`);
  if(cell){
    cell.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 700, easing: 'ease-out' });
    cell.style.boxShadow = '0 0 28px rgba(0,255,120,0.25)';
    setTimeout(()=>{ cell.style.boxShadow = ''; }, 1000);
  }

  // overlay
  celebrateEl.classList.remove('hidden');
  celebrateEl.setAttribute('aria-hidden', 'false');
  setTimeout(()=>{ celebrateEl.classList.add('hidden'); celebrateEl.setAttribute('aria-hidden','true'); }, 2600);
}

// ========== debug & helpers ==========
toggleMaskDebugBtn.addEventListener('click', ()=>{ maskDebug = !maskDebug; renderGrid(); });
autoTuneBtn.addEventListener('click', async ()=>{
  // try thresholds in a small range and pick one with maskIndices closest to MAX_PARTICIPANTS but >= 400
  const candidates = [12,18,24,30,36,42,50];
  let best = {thr:24, n:0};
  for(const t of candidates){
    await computeMaskAndEnsureCapacity(t);
    const n = maskIndices.length;
    if(n > best.n && n <= MAX_PARTICIPANTS) best = {thr:t, n};
    // small pause so UI doesn't block
    await new Promise(r=>setTimeout(r,80));
  }
  alert(`Auto-tune selected threshold ${best.thr} -> cells ${best.n}. Recomputing with that value.`);
  await computeMaskAndEnsureCapacity(best.thr);
});

// init
loadState();
buildGrid();
computeMaskAndEnsureCapacity();
renderGrid();
updateCounters();
