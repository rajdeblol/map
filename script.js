// Static version: stores placed pixels in localStorage. To enable realtime sync, replace localStorage calls
// with your DB (Firebase / Supabase) methods — see comments at bottom.

const GRID_SIZE = 40; // 40x40 grid
const CELL_PX = 20;   // cell size in px (matches CSS .cell)
const STORAGE_KEY = 'ritual_pixels_v1';
const LOGO_PATH = 'assets/logo/ritual-logo.png'; // place your ritual logo here (transparent png)

let pixels = {}; // mapping index -> {username, caption, color}
let selectedIndex = null;

const gridContainer = document.getElementById('gridContainer');
const maskCanvas = document.getElementById('maskCanvas');
const modal = document.getElementById('modal');
const usernameInput = document.getElementById('username');
const captionInput = document.getElementById('caption');
const placeBtn = document.getElementById('placeBtn');
const closeModal = document.getElementById('closeModal');
const totalPixelsEl = document.getElementById('totalPixels');
const filledPixelsEl = document.getElementById('filledPixels');

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
  if(!isMaskedIndex(idx)) return; // prevent clicks outside logo mask
  if(pixels[idx]) return alert('Pixel already placed. Pick another spot.');
  selectedIndex = idx;
  usernameInput.value = '';
  captionInput.value = '';
  modal.classList.remove('hidden');
}

function close(){ modal.classList.add('hidden'); selectedIndex = null }
closeModal.addEventListener('click', close);

placeBtn.addEventListener('click', ()=>{
  const u = usernameInput.value.trim();
  if(!u) return alert('Enter Twitter username');
  const c = captionInput.value.trim();
  pixels[selectedIndex] = {username:u, caption:c, color:'#ffffff'};
  saveState();
  renderGrid();
  updateCounters();
  close();
});

function renderGrid(){
  for(const el of gridContainer.children){
    const idx = Number(el.dataset.idx);
    if(pixels[idx]){
      el.classList.remove('empty');
      el.classList.add('filled');
      el.title = `${pixels[idx].username} — ${pixels[idx].caption}`;
    } else {
      if(isMaskedIndex(idx)) el.classList.add('hoverable'); else el.classList.remove('hoverable');
      el.classList.remove('filled');
      el.classList.add('empty');
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
// overlap the non-transparent parts of the logo.
let maskIndices = [];
function computeMask(){
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = LOGO_PATH + '?v='+Date.now();
  img.onload = ()=>{
    const ctx = maskCanvas.getContext('2d');
    maskCanvas.width = img.width;
    maskCanvas.height = img.height;
    ctx.clearRect(0,0,maskCanvas.width,maskCanvas.height);
    ctx.drawImage(img,0,0,maskCanvas.width,maskCanvas.height);
    const imgData = ctx.getImageData(0,0,maskCanvas.width,maskCanvas.height).data;

    // map grid cells to logo pixels
    maskIndices = [];
    for(let gy=0;gy<GRID_SIZE;gy++){
      for(let gx=0;gx<GRID_SIZE;gx++){
        // compute the area inside the image that corresponds to this grid cell
        const sx = Math.floor(gx * (maskCanvas.width / GRID_SIZE));
        const sy = Math.floor(gy * (maskCanvas.height / GRID_SIZE));
        const sw = Math.ceil(maskCanvas.width / GRID_SIZE);
        const sh = Math.ceil(maskCanvas.height / GRID_SIZE);
        let opaque = false;
        for(let yy=0; yy<sh && !opaque; yy++){
          for(let xx=0; xx<sw; xx++){
            const px = ( (sy+yy) * maskCanvas.width + (sx+xx) ) * 4;
            const a = imgData[px+3];
            if(a>10){ opaque = true; break; }
          }
        }
        if(opaque) maskIndices.push(gy*GRID_SIZE + gx);
      }
    }
    renderGrid();
    updateCounters();
  }
  img.onerror = ()=>{
    console.error('Failed to load logo. Make sure', LOGO_PATH, 'exists and is CORS-accessible.');
    alert('Failed to load ritual logo. Put a transparent PNG at '+LOGO_PATH);
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

/*
Realtime integration notes:
- Replace loadState/saveState + localStorage with calls to your database.
- Example (Firebase Realtime DB / Firestore):
  - On init, fetch all pixels from /pixels and populate `pixels` object.
  - Subscribe to changes (onSnapshot) to update `pixels` and call renderGrid/updateCounters when others place pixels.
- Keep `maskIndices` logic local (derived from logo image). Only store {idx, username, caption, color, ts} on the DB.
*/
