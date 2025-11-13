// ritual script: support up to MAX_PARTICIPANTS, upload avatar, compute mask and expand to capacity,
// celebration animation on placement.

const GRID_SIZE = 60;   // grid 60x60 -> 3600 cells (good chance to contain >= 1000 mask cells)
const CELL_PX = 15;     // matches CSS cell size
const STORAGE_KEY = 'ritual_pixels_v4';
const LOGO_PATH = 'assets/logo/ritual-logo.png';
const MAX_PARTICIPANTS = 1000; // ensure capacity for 1000 participants

let pixels = {}; // idx -> { username, caption, avatarDataUrl }
let selectedIndex = null;
let maskIndices = [];
let maskComputed = false;

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

// Avatar fetch to dataURL (with CORS-safe proxy earlier discussed). If CORS fails the fallback is upload.
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

// helper
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
    }
  }
}

function updateCounters(){ totalPixelsEl.textContent = Math.min(MAX_PARTICIPANTS, maskIndices.length || MAX_PARTICIPANTS); filledPixelsEl.textContent = Object.keys(pixels).length; }

// =============== mask computation and capacity expansion ===============
async function computeMaskAndEnsureCapacity(){
  maskComputed = false; maskIndices = [];
  try {
    const img = await loadImageWithCors(LOGO_PATH);
    // tiny canvas GRID_SIZE x GRID_SIZE
    const tiny = document.createElement('canvas');
    tiny.width = GRID_SIZE; tiny.height = GRID_SIZE;
    const tctx = tiny.getContext('2d');
    tctx.clearRect(0,0,tiny.width,tiny.height);

    // draw logo scaled & centered
    const ar = img.width / img.height;
    let dw = tiny.width, dh = tiny.height, dx = 0, dy = 0;
    if(ar > 1){ dw = tiny.width; dh = Math.round(tiny.width / ar); dy = Math.round((tiny.height - dh)/2); }
    else { dh = tiny.height; dw = Math.round(tiny.height * ar); dx = Math.round((tiny.width - dw)/2); }
    tctx.drawImage(img, dx, dy, dw, dh);

    const d = tctx.getImageData(0,0,tiny.width,tiny.height).data;
    for(let gy=0; gy<GRID_SIZE; gy++){
      for(let gx=0; gx<GRID_SIZE; gx++){
        const px = (gy * GRID_SIZE + gx) * 4;
        const a = d[px+3];
        if(a > 8) maskIndices.push(gy*GRID_SIZE + gx);
      }
    }

    // if logo area yields fewer cells than MAX_PARTICIPANTS, expand by adding nearest cells to center
    if(maskIndices.length < MAX_PARTICIPANTS){
      const needed = MAX_PARTICIPANTS - maskIndices.length;
      // compute distances for all cells not already in mask
      const centerX = (GRID_SIZE-1)/2, centerY = (GRID_SIZE-1)/2;
      const list = [];
      for(let gy=0; gy<GRID_SIZE; gy++){
        for(let gx=0; gx<GRID_SIZE; gx++){
          const idx = gy*GRID_SIZE + gx;
          if(maskIndices.indexOf(idx) !== -1) continue;
          const dx2 = gx - centerX, dy2 = gy - centerY;
          const dist = Math.sqrt(dx2*dx2 + dy2*dy2);
          list.push({idx, dist});
        }
      }
      list.sort((a,b)=>a.dist - b.dist);
      for(let i=0;i<needed && i<list.length;i++){
        maskIndices.push(list[i].idx);
      }
    }

    if(maskIndices.length < MAX_PARTICIPANTS){
      console.warn('After expansion mask still smaller than MAX_PARTICIPANTS - consider increasing GRID_SIZE.');
    }
    maskComputed = true;
    renderGrid(); updateCounters();
  } catch(err){
    console.warn('computeMask failed', err);
    // fallback: allow first MAX_PARTICIPANTS cells by index order
    maskIndices = Array.from({length: Math.min(GRID_SIZE*GRID_SIZE, MAX_PARTICIPANTS)}, (_,i)=>i);
    maskComputed = true; renderGrid(); updateCounters();
  }
}

function isMaskedIndex(idx){ return maskIndices.indexOf(idx) !== -1; }

// ========== celebration ==========
// show small animation, pulse cell, show ritual modal overlay
function fireCelebration(idx){
  // pulse the cell
  const cell = gridContainer.querySelector(`.cell[data-idx='${idx}']`);
  if(cell){
    cell.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 700, easing: 'ease-out' });
    cell.style.boxShadow = '0 0 28px rgba(0,255,120,0.25)';
    setTimeout(()=>{ cell.style.boxShadow = ''; }, 1000);
  }

  // show big ritual overlay
  celebrateEl.classList.remove('hidden');
  celebrateEl.setAttribute('aria-hidden', 'false');
  // auto hide after 2.5s
  setTimeout(()=>{ celebrateEl.classList.add('hidden'); celebrateEl.setAttribute('aria-hidden','true'); }, 2600);
}

// init
loadState();
buildGrid();
computeMaskAndEnsureCapacity();
renderGrid();
updateCounters();
