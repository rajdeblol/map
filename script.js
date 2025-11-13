// ritual final: visible CSS-grid, logo-only mask, in-cell avatars, counters
const GRID_SIZE = 60;
const CELL_PX = 15;
const STORAGE_KEY = 'ritual_pixels_final_grid';
const LOGO_PATH = 'assets/logo/ritual-logo.png';

let pixels = {};             // idx -> { username, caption, avatar }
let maskIndices = [];        // allowed cells (logo-only)
let maskComputed = false;
let maskDebug = false;

const gridContainer = document.getElementById('gridContainer');
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

function loadState(){
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if(s) pixels = JSON.parse(s);
  } catch(e){ console.warn('loadState failed', e); }
}
function saveState(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels)); } catch(e){ console.warn('saveState failed', e); } }

// build grid cells
function buildGrid(){
  gridContainer.innerHTML = '';
  gridContainer.style.setProperty('--cols', GRID_SIZE);
  gridContainer.style.width = `${GRID_SIZE * CELL_PX}px`;
  gridContainer.style.height = `${GRID_SIZE * CELL_PX}px`;
  for(let i=0;i<GRID_SIZE*GRID_SIZE;i++){
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.idx = i;
    cell.addEventListener('click', onCellClick);
    cell.addEventListener('mousedown', (e)=> e.preventDefault());
    gridContainer.appendChild(cell);
  }
}

// cell click: if filled open view, else open placement only if inside mask
let selectedIndex = null;
function onCellClick(e){
  const idx = Number(e.currentTarget.dataset.idx);
  if(pixels[idx]) { openViewModal(idx); return; }
  if(!maskComputed){ showToast('Mask still computing — wait a sec'); return; }
  if(!isMaskedIndex(idx)){ showToast('Click inside the lit logo area.'); const n = findNearestMaskIndex(idx); if(n!==null) flashCell(n); return; }
  openPlacementModal(idx);
}

function openPlacementModal(idx){
  selectedIndex = idx;
  if(usernameInput) usernameInput.value = '';
  if(captionInput) captionInput.value = '';
  if(avatarPreviewWrap) avatarPreviewWrap.style.display = 'none';
  if(avatarPreview) { avatarPreview.dataset.dataurl = ''; avatarPreview.dataset.url = ''; avatarPreview.src = ''; }
  modal.classList.remove('hidden');
  setTimeout(()=> usernameInput && usernameInput.focus(), 60);
}
function closePlacementModal(){ modal.classList.add('hidden'); selectedIndex = null; }
closeModal && closeModal.addEventListener('click', closePlacementModal);

// place pixel
placeBtn && placeBtn.addEventListener('click', ()=>{
  if(selectedIndex === null){ alert('No cell selected'); return; }
  if(!isMaskedIndex(selectedIndex)){ alert('Cell not allowed'); closePlacementModal(); return; }
  if(pixels[selectedIndex]){ alert('Already taken'); closePlacementModal(); return; }
  const u = usernameInput.value.trim();
  const avatarData = avatarPreview.dataset.dataurl || avatarPreview.dataset.url || null;
  if(!u && !avatarData) return alert('Provide X handle or upload avatar');
  const c = captionInput.value.trim();
  pixels[selectedIndex] = { username: u || 'uploader', caption: c || '', avatar: avatarData || null, ts: Date.now() };
  saveState();
  renderGrid();
  updateCounters();
  closePlacementModal();
  fireCelebration(selectedIndex);
  selectedIndex = null;
});

// view modal (read-only)
function openViewModal(idx){
  const p = pixels[idx]; if(!p) return;
  viewAvatar.src = p.avatar || 'assets/decor/skull.png';
  viewHandle.textContent = p.username.startsWith('@') ? p.username : '@' + p.username;
  viewPledge.textContent = p.caption || '(no pledge)';
  viewModal.classList.remove('hidden');
}
viewClose && viewClose.addEventListener('click', ()=> viewModal.classList.add('hidden'));

// avatar fetch/upload
function loadImageWithCors(url){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = ()=> resolve(img);
    img.onerror = ()=> reject(new Error('Image load error: '+url));
    img.src = url + ((url.indexOf('?') === -1)?'?v='+Date.now():'&v='+Date.now());
  });
}
async function tryFetchAvatarToDataURL(username){
  const url = `https://unavatar.io/twitter/${encodeURIComponent(username)}.png`;
  try {
    const img = await loadImageWithCors(url);
    const tmp = document.createElement('canvas'); tmp.width = CELL_PX; tmp.height = CELL_PX;
    const ctx = tmp.getContext('2d');
    const ar = img.width / img.height;
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if(ar > 1){ sh = img.height; sw = img.height * (tmp.width / tmp.height); sx = Math.round((img.width - sw)/2); }
    else { sw = img.width; sh = img.width * (tmp.height / tmp.width); sy = Math.round((img.height - sh)/2); }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tmp.width, tmp.height);
    return tmp.toDataURL('image/png');
  } catch(err){
    console.warn('fetch avatar failed', err); return null;
  }
}
fetchAvatar && fetchAvatar.addEventListener('click', async ()=>{
  const u = (usernameInput && usernameInput.value.trim()) || '';
  if(!u) return alert('Type X username first');
  const dataUrl = await tryFetchAvatarToDataURL(u);
  if(dataUrl){ avatarPreview.src = dataUrl; avatarPreview.dataset.dataurl = dataUrl; avatarPreview.dataset.url = ''; avatarName.textContent = '@'+u; avatarPreviewWrap.style.display = 'flex'; }
  else {
    const fallback = `https://unavatar.io/twitter/${encodeURIComponent(u)}.png`;
    if(confirm('Fetch to canvas failed (CORS). Use remote preview?')){ avatarPreview.src = fallback; avatarPreview.dataset.dataurl=''; avatarPreview.dataset.url=fallback; avatarName.textContent='@'+u; avatarPreviewWrap.style.display='flex'; }
  }
});
avatarUpload && avatarUpload.addEventListener('change', (e)=>{
  const f = e.target.files && e.target.files[0]; if(!f) return;
  if(!f.type.startsWith('image/')) return alert('Upload image');
  const reader = new FileReader();
  reader.onload = ()=>{ avatarPreview.src = reader.result; avatarPreview.dataset.dataurl = reader.result; avatarPreview.dataset.url = ''; avatarName.textContent = 'Uploaded'; avatarPreviewWrap.style.display='flex'; };
  reader.onerror = ()=> alert('File read failed'); reader.readAsDataURL(f);
});
removeAvatar && removeAvatar.addEventListener('click', ()=>{ avatarPreview.src=''; avatarPreview.dataset.dataurl=''; avatarPreview.dataset.url=''; avatarPreviewWrap.style.display='none'; avatarName.textContent=''; if(avatarUpload) avatarUpload.value=''; });

// render grid and avatars
function renderGrid(){
  for(const el of gridContainer.children){
    const idx = Number(el.dataset.idx);
    const existingImg = el.querySelector('.cell-avatar');
    if(pixels[idx]){
      const p = pixels[idx];
      el.classList.add('filled'); el.classList.remove('empty');
      let img = existingImg;
      if(!img){
        img = document.createElement('img');
        img.className = 'cell-avatar';
        img.style.pointerEvents = 'none';
        el.appendChild(img);
      }
      img.src = p.avatar || 'assets/decor/skull.png';
      el.title = `${p.username}${p.caption? ' — '+p.caption: ''}`;
    } else {
      el.classList.remove('filled'); el.classList.add('empty');
      if(existingImg) existingImg.remove();
      el.title = '';
      if(maskDebug && isMaskedIndex(idx)) el.classList.add('mask-debug'); else el.classList.remove('mask-debug');
      if(isMaskedIndex(idx)) el.classList.add('hoverable'); else el.classList.remove('hoverable');
    }
  }
}

// counters
function updateCounters(){
  totalPixelsEl.textContent = maskIndices.length;
  filledPixelsEl.textContent = Object.keys(pixels).length;
}

// compute mask: draw logo to tiny canvas GRID_SIZE x GRID_SIZE, luminance threshold, dilation
async function computeMask(threshold = 28){
  maskComputed = false; maskIndices = [];
  try {
    const img = await loadImageWithCors(LOGO_PATH);
    const tiny = document.createElement('canvas'); tiny.width = GRID_SIZE; tiny.height = GRID_SIZE;
    const tctx = tiny.getContext('2d');
    tctx.clearRect(0,0,tiny.width,tiny.height);

    // scale & center (cover)
    const ar = img.width / img.height;
    let dw = tiny.width, dh = tiny.height, dx = 0, dy = 0;
    if(ar > 1){ dw = tiny.width; dh = Math.round(tiny.width / ar); dy = Math.round((tiny.height - dh)/2); }
    else { dh = tiny.height; dw = Math.round(tiny.height * ar); dx = Math.round((tiny.width - dw)/2); }
    tctx.drawImage(img, dx, dy, dw, dh);

    const imgData = tctx.getImageData(0,0,tiny.width,tiny.height).data;
    const map = new Uint8Array(GRID_SIZE * GRID_SIZE);
    for(let y=0;y<GRID_SIZE;y++){
      for(let x=0;x<GRID_SIZE;x++){
        const p = (y*GRID_SIZE + x)*4;
        const r = imgData[p], g = imgData[p+1], b = imgData[p+2];
        const lum = 0.2126*r + 0.7152*g + 0.0722*b;
        if(lum > threshold) map[y*GRID_SIZE + x] = 1;
      }
    }

    // dilation
    const dil = new Uint8Array(map);
    const neigh = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(let y=0;y<GRID_SIZE;y++){
      for(let x=0;x<GRID_SIZE;x++){
        const i = y*GRID_SIZE + x;
        if(map[i] === 0){
          for(const [dx,dy] of neigh){
            const nx = x+dx, ny = y+dy;
            if(nx<0||nx>=GRID_SIZE||ny<0||ny>=GRID_SIZE) continue;
            if(map[ny*GRID_SIZE + nx] === 1){ dil[i]=1; break; }
          }
        }
      }
    }

    for(let i=0;i<dil.length;i++) if(dil[i]) maskIndices.push(i);

    // sanity fallback
    if(maskIndices.length === 0){
      // choose center cluster so site still usable
      const center = Math.floor((GRID_SIZE*GRID_SIZE)/2);
      maskIndices = Array.from({length: Math.min(400, GRID_SIZE*GRID_SIZE)}, (_,i)=> (center + i) % (GRID_SIZE*GRID_SIZE));
      console.warn('Mask empty, fallback used');
    }

    maskComputed = true;
    renderGrid(); updateCounters();
    console.log('Mask computed:', maskIndices.length);
  } catch(err){
    console.warn('computeMask err', err);
    // fallback cluster
    maskIndices = Array.from({length: Math.min(400, GRID_SIZE*GRID_SIZE)}, (_,i)=>i);
    maskComputed = true;
    renderGrid(); updateCounters();
  }
}

function isMaskedIndex(idx){ return maskIndices.indexOf(idx) !== -1; }
function findNearestMaskIndex(idx){
  if(maskIndices.length === 0) return null;
  const gy = Math.floor(idx/GRID_SIZE), gx = idx%GRID_SIZE;
  let best = null, bd = 1e9;
  for(const m of maskIndices){
    const my = Math.floor(m/GRID_SIZE), mx = m%GRID_SIZE;
    const dx = mx-gx, dy = my-gy, d = dx*dx + dy*dy;
    if(d < bd){ bd = d; best = m; }
  }
  return best;
}
function flashCell(idx){
  const c = gridContainer.querySelector(`.cell[data-idx='${idx}']`);
  if(!c) return;
  c.animate([{ boxShadow:'0 0 0 rgba(0,255,120,0.0)' }, { boxShadow:'0 0 18px rgba(0,255,120,0.28)' }, { boxShadow:'0 0 0 rgba(0,255,120,0.0)' }], { duration:900, easing:'ease-out' });
}

// toast
let _tt = null;
function showToast(text, ms=1400){
  if(!toastEl) return;
  toastEl.textContent = text; toastEl.style.display = 'block'; toastEl.style.opacity = '1';
  if(_tt) clearTimeout(_tt);
  _tt = setTimeout(()=>{ toastEl.style.opacity = '0'; setTimeout(()=> toastEl.style.display='none',180); }, ms);
}

// celebration
function fireCelebration(idx){
  const c = gridContainer.querySelector(`.cell[data-idx='${idx}']`);
  if(c){ c.animate([{transform:'scale(1)'},{transform:'scale(1.2)'},{transform:'scale(1)'}],{duration:600}); c.style.boxShadow='0 0 24px rgba(0,255,120,0.25)'; setTimeout(()=> c.style.boxShadow='',900); }
  // brief overlay
  const celebrate = document.getElementById('celebrate');
  if(celebrate){ celebrate.classList.remove('hidden'); setTimeout(()=> celebrate.classList.add('hidden'),2200); }
}

// toggle mask debug
toggleMaskDebug && toggleMaskDebug.addEventListener('click', ()=>{
  maskDebug = !maskDebug; renderGrid();
});

// auto-tune (tries thresholds)
autoTune && autoTune.addEventListener('click', async ()=>{
  const list = [10,16,22,28,34,40,48];
  let best = {thr:28, n:0};
  for(const t of list){
    await computeMask(t);
    if(maskIndices.length > best.n){ best = {thr:t, n:maskIndices.length}; }
    await new Promise(r=>setTimeout(r,60));
  }
  alert(`Auto-tune picked ${best.thr} (${best.n} cells)`);
  await computeMask(best.thr);
});

// click-outside close for modals
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ modal && modal.classList.add('hidden'); viewModal && viewModal.classList.add('hidden'); } });
modal && modal.addEventListener('click', (e)=> { if(e.target === modal) modal.classList.add('hidden'); });
viewModal && viewModal.addEventListener('click', (e)=> { if(e.target === viewModal) viewModal.classList.add('hidden'); });

// init
loadState();
buildGrid();
computeMask();
renderGrid();
updateCounters();
