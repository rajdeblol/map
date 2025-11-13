// ─────────────────────────────────────────────────────────────────────────────
//  ritual-script-v4-FIXED-ONLY-INSIDE-LOGO.js
//  →  click-to-place works **only on logo cells** (mask + expansion)
//  →  “Allow anywhere” button removed
//  →  everything else (avatar, upload, celebration, debug) unchanged
// ─────────────────────────────────────────────────────────────────────────────

const GRID_SIZE = 60;
const CELL_PX = 15;
const STORAGE_KEY = 'ritual_pixels_v4';
const LOGO_PATH = 'assets/logo/ritual-logo.png';
const MAX_PARTICIPANTS = 1000;

let pixels = {};               // idx → {username, caption, avatar, ts}
let selectedIndex = null;
let maskIndices = [];
let maskSet = new Set();      // O(1) lookup
let maskComputed = false;
let maskDebug = false;

// ── DOM ─────────────────────────────────────────────────────────────────────
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

// (allowAnywhereBtn is **removed** – we never allow outside the logo)

// ── STORAGE ─────────────────────────────────────────────────────────────────
function loadState(){ try{ const r=localStorage.getItem(STORAGE_KEY); if(r) pixels=JSON.parse(r); }catch(e){console.warn(e);} }
function saveState(){ try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(pixels)); }catch(e){console.warn(e);} }

// ── GRID BUILD ───────────────────────────────────────────────────────────────
function buildGrid(){
  gridContainer.style.width  = (GRID_SIZE*CELL_PX)+'px';
  gridContainer.style.height = (GRID_SIZE*CELL_PX)+'px';
  gridContainer.innerHTML = '';
  for(let y=0;y<GRID_SIZE;y++){
    for(let x=0;x<GRID_SIZE;x++){
      const idx = y*GRID_SIZE + x;
      const cell = document.createElement('div');
      cell.className = 'cell empty';
      cell.dataset.idx = idx;
      cell.style.width = cell.style.height = CELL_PX+'px';
      cell.style.pointerEvents = 'auto';
      cell.addEventListener('click', onCellClick);
      cell.addEventListener('mousedown', e=>e.preventDefault());
      gridContainer.appendChild(cell);
    }
  }
}

// ── CLICK HANDLER (ONLY INSIDE MASK) ───────────────────────────────────────
function onCellClick(e){
  const idx = Number(e.currentTarget.dataset.idx);
  if(!maskComputed){ alert('Mask still computing — wait a second.'); return; }
  if(pixels[idx]){ alert('Pixel already placed. Choose another.'); return; }

  if(maskSet.has(idx)){
    openPlacementModalForIndex(idx);
  } else {
    // optional: flash nearest allowed cell
    const nearest = findNearestMaskIndex(idx);
    if(nearest!==null) flashCell(nearest);
  }
}

function openPlacementModalForIndex(idx){
  selectedIndex = idx;
  usernameInput.value = '';
  captionInput.value = '';
  avatarPreviewWrap.style.display = 'none';
  avatarPreview.dataset.dataurl = '';
  avatarPreview.dataset.url = '';
  modal.classList.remove('hidden');
  setTimeout(()=>usernameInput.focus(),80);
}
closeModal.addEventListener('click',()=>{ modal.classList.add('hidden'); selectedIndex=null; });

// ── PLACEMENT ───────────────────────────────────────────────────────────────
placeBtn.addEventListener('click',()=>{
  if(selectedIndex===null){ alert('No cell selected.'); return; }
  const u = usernameInput.value.trim();
  const avatarData = avatarPreview.dataset.dataurl||null;
  if(!u && !avatarData) return alert('Add a username or upload an avatar.');
  const c = captionInput.value.trim();
  pixels[selectedIndex] = {username:u||'uploader', caption:c, avatar:avatarData, ts:Date.now()};
  saveState(); renderGrid(); updateCounters(); modal.classList.add('hidden');
  fireCelebration(selectedIndex);
});

// ── AVATAR FETCH & UPLOAD ───────────────────────────────────────────────────
fetchAvatarBtn && fetchAvatarBtn.addEventListener('click', async ()=>{
  const u = usernameInput.value.trim(); if(!u) return alert('Type X username first (no @).');
  const url = `https://unavatar.io/twitter/${encodeURIComponent(u)}.png`;
  try{
    const img = await loadImageWithCors(url);
    const dataUrl = resizeToDataURL(img,CELL_PX,CELL_PX);
    setAvatarPreview(dataUrl,url,'@'+u);
  }catch{
    if(confirm('CORS error – use remote preview?')){
      setAvatarPreview('',url,'@'+u);
    }else alert('Use upload instead.');
  }
});
avatarUploadInput && avatarUploadInput.addEventListener('change',e=>{
  const f = e.target.files?.[0]; if(!f||!f.type.startsWith('image/')) return alert('Upload an image.');
  const r = new FileReader();
  r.onload = ()=>{ const img=new Image(); img.onload=()=>{ setAvatarPreview(resizeToDataURL(img,CELL_PX,CELL_PX),'','Uploaded image'); }; img.src=r.result; };
  r.readAsDataURL(f);
});
removeAvatarBtn && removeAvatarBtn.addEventListener('click',()=>{ avatarPreviewWrap.style.display='none'; avatarPreview.dataset.dataurl=''; avatarName.textContent=''; avatarUploadInput.value=''; });

function setAvatarPreview(dataUrl,url,name){
  avatarPreview.src = dataUrl||url;
  avatarPreview.dataset.dataurl = dataUrl;
  avatarPreview.dataset.url = url;
  avatarName.textContent = name;
  avatarPreviewWrap.style.display='flex';
}
function loadImageWithCors(u){ return new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=()=>rej();i.src=u+'?v='+Date.now();}); }
function resizeToDataURL(img,w,h){
  const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d');
  const ar=img.width/img.height; let sw=img.width,sh=img.height,sx=0,sy=0;
  if(ar>1){ sw=img.height; sx=(img.width-sw)/2; }else{ sh=img.width; sy=(img.height-sh)/2; }
  ctx.drawImage(img,sx,sy,sw,sh,0,0,w,h);
  return c.toDataURL('image/png');
}

// ── RENDER ───────────────────────────────────────────────────────────────────
function renderGrid(){
  for(const el of gridContainer.children){
    const idx = Number(el.dataset.idx);
    if(pixels[idx]){
      const p = pixels[idx];
      el.className = 'cell filled'+(p.avatar?' filled-avatar':'');
      el.style.backgroundImage = p.avatar?`url("${p.avatar}")`:'';
      el.style.backgroundColor = p.avatar?'':'#dfffe8';
      el.title = `${p.username}${p.caption?' — '+p.caption:''}`;
    }else{
      el.className = 'cell empty'+(maskSet.has(idx)?' hoverable':'');
      el.style.backgroundImage=''; el.style.backgroundColor='transparent'; el.title='';
      if(maskDebug && maskSet.has(idx)) el.classList.add('mask-debug');
      else el.classList.remove('mask-debug');
    }
  }
}
function updateCounters(){
  totalPixelsEl.textContent = Math.min(MAX_PARTICIPANTS, maskIndices.length);
  filledPixelsEl.textContent = Object.keys(pixels).length;
}

// ── MASK (luminance → dilate → expand to 1000) ───────────────────────────────
async function computeMaskAndEnsureCapacity(threshold=28){
  maskComputed = false; maskIndices=[]; maskSet.clear();
  try{
    const img = await loadImageWithCors(LOGO_PATH);
    const tiny = document.createElement('canvas');
    tiny.width=tiny.height=GRID_SIZE;
    const ctx = tiny.getContext('2d'); ctx.clearRect(0,0,GRID_SIZE,GRID_SIZE);

    const ar = img.width/img.height;
    let dw=GRID_SIZE, dh=GRID_SIZE, dx=0, dy=0;
    if(ar>1){ dh=Math.round(GRID_SIZE/ar); dy=Math.round((GRID_SIZE-dh)/2); }
    else{ dw=Math.round(GRID_SIZE*ar); dx=Math.round((GRID_SIZE-dw)/2); }
    ctx.drawImage(img,dx,dy,dw,dh);

    const data = ctx.getImageData(0,0,GRID_SIZE,GRID_SIZE).data;
    const map = new Uint8Array(GRID_SIZE*GRID_SIZE);
    const dilated = new Uint8Array(GRID_SIZE*GRID_SIZE);

    // 1. luminance mask
    for(let y=0;y<GRID_SIZE;y++)for(let x=0;x<GRID_SIZE;x++){
      const i=(y*GRID_SIZE+x)*4;
      const lum = 0.2126*data[i] + 0.7152*data[i+1] + 0.0722*data[i+2];
      if(lum>threshold) map[y*GRID_SIZE+x]=1;
    }

    // 2. dilation (separate buffer)
    const nb = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(let y=0;y<GRID_SIZE;y++)for(let x=0;x<GRID_SIZE;x++){
      const idx=y*GRID_SIZE+x;
      if(map[idx]){ dilated[idx]=1; continue; }
      for(const [dx,dy] of nb){
        const nx=x+dx, ny=y+dy;
        if(nx>=0&&nx<GRID_SIZE&&ny>=0&&ny<GRID_SIZE&&map[ny*GRID_SIZE+nx]){
          dilated[idx]=1; break;
        }
      }
    }

    // 3. collect mask cells
    for(let i=0;i<dilated.length;i++) if(dilated[i]) maskIndices.push(i);

    // 4. expand to MAX_PARTICIPANTS (nearest to centre)
    if(maskIndices.length < MAX_PARTICIPANTS){
      const needed = MAX_PARTICIPANTS - maskIndices.length;
      const cx = (GRID_SIZE-1)/2, cy = (GRID_SIZE-1)/2;
      const cand = [];
      for(let i=0;i<GRID_SIZE*GRID_SIZE;i++){
        if(dilated[i]) continue;
        const gx=i%GRID_SIZE, gy=Math.floor(i/GRID_SIZE);
        const d = (gx-cx)**2 + (gy-cy)**2;
        cand.push({idx:i,d});
      }
      cand.sort((a,b)=>a.d-b.d);
      for(let i=0;i<needed&&i<cand.length;i++) maskIndices.push(cand[i].idx);
    }

    maskSet = new Set(maskIndices);
    maskComputed = true;
    renderGrid(); updateCounters();
    console.log('Mask ready →',maskIndices.length,'cells');
  }catch(e){
    console.warn('Mask error → fallback',e);
    maskIndices = Array.from({length:Math.min(GRID_SIZE*GRID_SIZE,MAX_PARTICIPANTS)},(_,i)=>i);
    maskSet = new Set(maskIndices);
    maskComputed = true;
    renderGrid(); updateCounters();
  }
}
function isMaskedIndex(idx){ return maskSet.has(idx); }

// ── HELPERS ─────────────────────────────────────────────────────────────────
function findNearestMaskIndex(idx){
  if(!maskIndices.length) return null;
  const gy=Math.floor(idx/GRID_SIZE), gx=idx%GRID_SIZE;
  let best=null, bestD=1e9;
  for(const m of maskIndices){
    const my=Math.floor(m/GRID_SIZE), mx=m%GRID_SIZE;
    const d=(mx-gx)**2 + (my-gy)**2;
    if(d<bestD){ bestD=d; best=m; }
  }
  return best;
}
function flashCell(idx){
  const c=gridContainer.querySelector(`.cell[data-idx='${idx}']`);
  if(!c) return;
  c.animate([{boxShadow:'0 0 0 rgba(0,255,120,0)'},{boxShadow:'0 0 18px rgba(0,255,120,.28)'},{boxShadow:'0 0 0 rgba(0,255,120,0)'}],{duration:900,easing:'ease-out'});
}
function fireCelebration(idx){
  const cell=gridContainer.querySelector(`.cell[data-idx='${idx}']`);
  if(cell){
    cell.animate([{transform:'scale(1)'},{transform:'scale(1.25)'},{transform:'scale(1)'}],{duration:700,easing:'ease-out'});
    cell.style.boxShadow='0 0 28px rgba(0,255,120,.25)';
    setTimeout(()=>{cell.style.boxShadow='';},1000);
  }
  celebrateEl.classList.remove('hidden'); celebrateEl.setAttribute('aria-hidden','false');
  setTimeout(()=>{celebrateEl.classList.add('hidden');celebrateEl.setAttribute('aria-hidden','true');},2600);
}

// ── DEBUG CONTROLS ───────────────────────────────────────────────────────────
toggleMaskDebugBtn && toggleMaskDebugBtn.addEventListener('click',()=>{ maskDebug=!maskDebug; renderGrid(); });
autoTuneBtn && autoTuneBtn.addEventListener('click',async()=>{
  const cand=[12,18,24,30,36,42,50];
  let best={thr:24,n:0};
  for(const t of cand){
    await computeMaskAndEnsureCapacity(t);
    const n=maskIndices.length;
    if(n>best.n && n<=MAX_PARTICIPANTS) best={thr:t,n};
    await new Promise(r=>setTimeout(r,80));
  }
  alert(`Auto-tune → threshold ${best.thr} (cells ${best.n})`);
  await computeMaskAndEnsureCapacity(best.thr);
});

// ── INIT ─────────────────────────────────────────────────────────────────────
loadState();
buildGrid();
computeMaskAndEnsureCapacity();
renderGrid();
updateCounters();
