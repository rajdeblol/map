// static client-side version with avatar-fetch and visible logo overlay.
// avatar fetch uses unavatar.io which proxies many providers and works around CORS in most cases.

const GRID_SIZE = 40; // adjust for more/less detail
const CELL_PX = 20;
const STORAGE_KEY = 'ritual_pixels_v1';
const LOGO_PATH = 'assets/logo/ritual-logo.png'; // must exist
const AVATAR_PROXY = 'https://unavatar.io/twitter/'; // usage: AVATAR_PROXY + username

let pixels = {}; // idx -> {username, caption, avatar}
let selectedIndex = null;
let maskIndices = [];

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

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw) pixels = JSON.parse(raw);
}
function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pixels));
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

function onCellClick(e){
  const idx = Number(e.currentTarget.dataset.idx);
  if(!isMaskedIndex(idx)) return; // only allow logo-area clicks
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
  if(!u) return alert('Enter X (Twitter) username or fetch avatar first.');
  const c = captionInput.value.trim();
  const avatar = avatarPreview.dataset.url || null;
  pixels[selectedIndex] = {username: u, caption: c, avatar};
  saveState();
  renderGrid();
  updateCounters();
  close();
});

// fetch avatar button - fetch avatar preview using unavatar proxy
fetchAvatarBtn.addEventListener('click', async ()=>{
  const u = usernameInput.value.trim();
  if(!u) return alert('Type the X username first (no @).');
  const url = AVATAR_PROXY + encodeURIComponent(u);
  // quick existence check by loading the image
  try{
    avatarPreview.src = url + '?fallback=false'; // unavatar returns 404 if not found
    avatarPreview.onload = ()=>{
      avatarPreview.dataset.url = url;
      avatarName.textContent = '@' + u;
      avatarPreviewWrap.style.display = 'flex';
    }
    avatarPreview.onerror = ()=>{
      alert('Unable to fetch avatar for that username. Either the username is invalid or the proxy blocked it.');
      avatarPreviewWrap.style.display = 'none';
    }
  }catch(err){
    console.error(err);
    alert('Avatar fetch failed.');
  }
});

// render loop: show cells and avatar fill
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

// Mask handling: sample the logo image on an offscreen canvas and compute which grid cells
// overlap the non-transparent parts of the logo. If this fails due to CORS or path, the CSS logo overlay ensures visibility.
function computeMask(){
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = LOGO_PATH + '?v=' + Date.now();
  img.onload = ()=>{
    const ctx = maskCanvas.getContext('2d');
    maskCanvas.width = img.width;
    maskCanvas.height = img.height;
    ctx.clearRect(0,0,maskCanvas.width,maskCanvas.height);
    ctx.drawImage(img,0,0,maskCanvas.width,maskCanvas.height);
    const imgData = ctx.getImageData(0,0,maskCanvas.width,maskCanvas.height).data;

    maskIndices = [];
    for(let gy=0;gy<GRID_SIZE;gy++){
      for(let gx=0;gx<GRID_SIZE;gx++){
        const sx = Math.floor(gx * (maskCanvas.width / GRID_SIZE));
        const sy = Math.floor(gy * (maskCanvas.height / GRID_SIZE));
        const sw = Math.ceil(maskCanvas.width / GRID_SIZE);
        const sh = Math.ceil(maskCanvas.height / GRID_SIZE);
        let opaque = false;
        for(let yy=0; yy<sh && !opaque; yy++){
          for(let xx=0; xx<sw; xx++){
            const px = ( (sy+yy) * maskCanvas.width + (sx+xx) ) * 4;
            const a = imgData[px+3];
            if(a > 10){ opaque = true; break; }
          }
        }
        if(opaque) maskIndices.push(gy*GRID_SIZE + gx);
      }
    }
    renderGrid();
    updateCounters();
  };
  img.onerror = ()=>{
    console.warn('Logo sampling failed (CORS or missing file). The grid will still show a faint logo overlay; please ensure', LOGO_PATH, 'exists and is accessible.');
    // a fallback: treat all cells as non-mask (so none clickable) — OR you could fallback to a rectangular mask.
    // For now, we keep maskIndices empty so no cells are clickable until logo sampling succeeds.
  };
}

function isMaskedIndex(idx){
  return maskIndices.indexOf(idx) !== -1;
}

// initialize
loadState();
buildGrid();
computeMask();
renderGrid();
updateCounters();

/*
Notes:
- Place your ritual logo at: assets/logo/ritual-logo.png (transparent PNG). The CSS background uses this for display.
- Avatar fetching uses https://unavatar.io/twitter/<username>. If you prefer a different proxy or direct fetch, swap AVATAR_PROXY.
- If the logo sampling (mask) fails due to CORS, the faint CSS logo overlay still makes the shape visible; fix by ensuring the file exists and is served from same origin or with proper CORS.
- To make this realtime: replace localStorage load/save with DB writes and subscribe to changes to update `pixels` and call renderGrid().
*/
