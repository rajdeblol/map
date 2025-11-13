// Modal-fix version: better modal close/escape/overlay handling + defensive guards
const GRID_SIZE = 60;
const CELL_PX = 15;
const STORAGE_KEY = 'ritual_pixels_masked';
const LOGO_PATH = 'assets/logo/ritual-logo.png';

let pixels = {}; // idx -> { username, caption, avatar }
let maskIndices = [];
let maskComputed = false;
let maskDebug = false;

// DOM helpers (defensive: some elements may be missing)
const $ = id => document.getElementById(id);
const gridContainer = $('gridContainer');
const modal = $('modal');
const closeModal = $('closeModal');
const usernameInput = $('username');
const captionInput = $('caption');
const placeBtn = $('placeBtn');
const avatarPreviewWrap = $('avatarPreviewWrap');
const avatarPreview = $('avatarPreview');
const avatarName = $('avatarName');
const fetchAvatarBtn = $('fetchAvatar');
const avatarUploadInput = $('avatarUpload');
const removeAvatarBtn = $('removeAvatar');

const viewModal = $('viewModal');
const viewClose = $('viewClose');
const viewAvatar = $('viewAvatar');
const viewHandle = $('viewHandle');
const viewPledge = $('viewPledge');

const toastEl = $('toast');
const totalPixelsEl = $('totalPixels');
const filledPixelsEl = $('filledPixels');

const toggleMaskDebugBtn = $('toggleMaskDebug');
const autoTuneBtn = $('autoTune');

function loadState(){
  try { const raw = localStorage.getItem(STORAGE_KEY); if(raw) pixels = JSON.parse(raw); } catch(e){ console.warn('loadState failed', e); }
}
function saveState(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels)); } catch(e){ console.warn('saveState failed', e); } }

function buildGrid(){
  if(!gridContainer) return;
  gridContainer.style.width = (GRID_SIZE*CELL_PX) + 'px';
  gridContainer.style.height = (GRID_SIZE*CELL_PX) + 'px';
  gridContainer.innerHTML = '';
  for(let y=0;y<GRID_SIZE;y++){
    for(let x=0;x<GRID_SIZE;x++){
      const idx = y*GRID_SIZE + x;
      const cell = document.createElement('div');
      cell.className = 'cell empty';
      cell.dataset.idx = idx;
      cell.style.width = CELL_PX + 'px';
      cell.style.height = CELL_PX + 'px';
      cell.addEventListener('click', (e)=>{
        const i = Number(e.currentTarget.dataset.idx);
        if(pixels[i]) openViewModal(i);
        else {
          if(isMaskedIndex(i)) openPlacementModalForIndex(i);
          else {
            showToast('Only cells inside the ritual logo accept placements.');
            const n = findNearestMaskIndex(i);
            if(n !== null) flashCell(n);
          }
        }
      });
      cell.addEventListener('mousedown', (ev)=> ev.preventDefault());
      gridContainer.appendChild(cell);
    }
  }
}

function openPlacementModalForIndex(idx){
  if(!modal) return;
  selectedIndex = idx;
  usernameInput && (usernameInput.value = '');
  captionInput && (captionInput.value = '');
  if(avatarPreviewWrap) avatarPreviewWrap.style.display = 'none';
  if(avatarPreview) { avatarPreview.dataset.dataurl = ''; avatarPreview.dataset.url = ''; avatarPreview.src = ''; }
  modal.classList.remove('hidden');
  // focus username safely
  setTimeout(()=>{ if(usernameInput) usernameInput.focus(); }, 80);
}

function closePlacementModal(){
  if(!modal) return;
  modal.classList.add('hidden');
  selectedIndex = null;
}
closeModal && closeModal.addEventListener('click', closePlacementModal);

// placement action
let selectedIndex = null;
placeBtn && placeBtn.addEventListener('click', ()=>{
  if(selectedIndex === null){ alert('Click an allowed cell inside the logo first.'); return; }
  if(!isMaskedIndex(selectedIndex)){ alert('That cell is not allowed.'); closePlacementModal(); return; }
  if(pixels[selectedIndex]){ alert('That cell is taken.'); closePlacementModal(); return; }
  const username = usernameInput ? usernameInput.value.trim() : '';
  const avatarData = avatarPreview ? (avatarPreview.dataset.dataurl || avatarPreview.dataset.url) : null;
  if(!username && !avatarData){ alert('Provide X username or upload an avatar.'); return; }
  const caption = captionInput ? captionInput.value.trim() : '';
  pixels[selectedIndex] = { username: username || 'uploader', caption: caption || '', avatar: avatarData || null, ts: Date.now() };
  saveState();
  renderGrid();
  updateCounters();
  closePlacementModal();
  fireCelebration(selectedIndex);
  selectedIndex = null;
});

// view modal
function openViewModal(idx){
  const p = pixels[idx];
  if(!viewModal) return;
  if(!p){
    // defensive: nothing there
    return;
  }
  if(viewAvatar) viewAvatar.src = p.avatar || 'assets/decor/skull.png';
  if(viewHandle) viewHandle.textContent = p.username ? (p.username.startsWith('@') ? p.username : '@'+p.username) : '(unknown)';
  if(viewPledge) viewPledge.textContent = p.caption || '(no pledge)';
  viewModal.classList.remove('hidden');
}
function closeViewModal(){ if(!viewModal) return; viewModal.classList.add('hidden'); }
viewClose && viewClose.addEventListener('click', closeViewModal);

// close modals with Escape and overlay click
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){ closeViewModal(); closePlacementModal(); }
});

// overlay click: detect clicks on modal background (close)
function setupOverlayClicks(){
  if(modal){
    modal.addEventListener('click', (e)=>{
      if(e.target === modal) closePlacementModal();
    });
  }
  if(viewModal){
    viewModal.addEventListener('click', (e)=>{
      if(e.target === viewModal) closeViewModal();
    });
  }
}

// avatar fetch/upload (defensive)
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
    const tmp = document.createElement('canvas'); tmp.width = CELL_PX; tmp.height = CELL_PX;
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

fetchAvatarBtn && fetchAvatarBtn.addEventListener('click', async ()=>{
  if(!usernameInput) return;
  const u = usernameInput.value.trim(); if(!u) { alert('Type the X username first.'); return; }
  const dataUrl = await tryFetchAvatarToDataURL(u);
  if(dataUrl){
    if(avatarPreview){ avatarPreview.src = dataUrl; avatarPreview.dataset.dataurl = dataUrl; avatarPreview.dataset.url = ''; avatarName && (avatarName.textContent = '@' + u); avatarPreviewWrap && (avatarPreviewWrap.style.display = 'flex'); }
  } else {
    const fallback = `https://unavatar.io/twitter/${encodeURIComponent(u)}.png`;
    if(confirm('Avatar fetch to canvas failed (CORS). Use remote preview instead?')){
      if(avatarPreview){ avatarPreview.src = fallback; avatarPreview.dataset.dataurl = ''; avatarPreview.dataset.url = fallback; avatarName && (avatarName.textContent = '@' + u); avatarPreviewWrap && (avatarPreviewWrap.style.display = 'flex'); }
    } else alert('Upload instead.');
  }
});

avatarUploadInput && avatarUploadInput.addEventListener('change', (e)=>{
  const f = e.target.files && e.target.files[0]; if(!f) return;
  if(!f.type.startsWith('image/')) return alert('Please upload an image file.');
  const reader = new FileReader();
  reader.onload = ()=>{ if(avatarPreview){ avatarPreview.src = reader.result; avatarPreview.dataset.dataurl = reader.result; avatarPreview.dataset.url = ''; avatarName && (avatarName.textContent = 'Uploaded image'); avatarPreviewWrap && (avatarPreviewWrap.style.display = 'flex'); } };
  reader.onerror = ()=> alert('File read failed');
  reader.readAsDataURL(f);
});
removeAvatarBtn && removeAvatarBtn.addEventListener('click', ()=>{ if(avatarPreview){ avatarPreview.src=''; avatarPreview.dataset.dataurl=''; avatarPreview.dataset.url=''; } if(avatarPreviewWrap) avatarPreviewWrap.style.display='none'; if(avatarName) avatarName.textContent=''; if(avatarUploadInput) avatarUploadInput.value=''; });

// ---------- render grid with img elements ----------
function renderGrid(){
  if(!gridContainer) return;
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
      if(isMaskedIndex(idx)) el.classList.add('hoverable'); else el.classList.remove('hoverable');
      if(maskDebug && isMaskedIndex(idx)) el.classList.add('mask-debug'); else el.classList.remove('mask-debug');
    }
  }
}

function updateCounters(){
  if(totalPixelsEl) totalPixelsEl.textContent = maskIndices.length;
  if(filledPixelsEl) filledPixelsEl.textContent = Object.keys(pixels).length;
}

// ---------- mask compute (logo only, luminance + dilation) ----------
async function computeMask(threshold = 28){
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

    if(maskIndices.length === 0){
      // small fallback cluster so site doesn't break
      const center = Math.floor((GRID_SIZE*GRID_SIZE)/2);
      maskIndices = Array.from({length: Math.min(400, GRID_SIZE*GRID_SIZE)}, (_,i)=> (center + i) % (GRID_SIZE*GRID_SIZE));
      console.warn('Mask empty; using fallback cluster.');
    }

    maskComputed = true;
    renderGrid(); updateCounters();
    console.log('Mask computed cells:', maskIndices.length);
  } catch(err){
    console.warn('computeMask failed', err);
    maskIndices = Array.from({length: Math.min(400, GRID_SIZE*GRID_SIZE)}, (_,i)=>i);
    maskComputed = true;
    renderGrid(); updateCo
