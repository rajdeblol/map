/* =============================================================
   Ritualnet – Pixel photo inside the knot (first 1 000 members)
   ============================================================= */

async function generate() {
  const rawUser = document.getElementById('username').value.trim().replace(/^@/, '');
  const file = document.getElementById('photo').files[0];
  if (!rawUser || !file) return alert('Username + photo required!');

  const username = rawUser.toLowerCase();

  // ---- 1. SHA-256 seed -------------------------------------------------
  const encoder = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(username));
  const hash = new Uint32Array(hashBuf);
  const memberId = (hash[1] % 1000) + 1;               // 1-1000

  // ---- 2. Load & pixelate user photo (8×8) -----------------------------
  const img = await loadImage(file);
  const pixelated = pixelate(img, 8);                  // returns Uint8ClampedArray

  // ---- 3. Canvas (256×256) ---------------------------------------------
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(256, 256);

  // ---- 4. Draw knot (32×32) -------------------------------------------
  const knot = getKnotMask();                         // 1 = keep, 0 = transparent
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const knotOn = knot[y * 32 + x];
      const col = knotOn ? [255, 255, 255, 255] : [0, 0, 0, 0];
      for (let sy = 0; sy < 8; sy++) {
        for (let sx = 0; sx < 8; sx++) {
          const idx = ((y * 8 + sy) * 256 + (x * 8 + sx)) * 4;
          imgData.data.set(col, idx);
        }
      }
    }
  }

  // ---- 5. Overlay pixelated photo inside knot -------------------------
  const photoSize = 8;   // 8×8 pixelated grid
  for (let py = 0; py < photoSize; py++) {
    for (let px = 0; px < photoSize; px++) {
      const knotY = 12 + py;      // offset inside knot (tweak if needed)
      const knotX = 12 + px;
      if (!knot[knotY * 32 + knotX]) continue;   // only where knot is white

      const srcIdx = (py * photoSize + px) * 4;
      const r = pixelated[srcIdx];
      const g = pixelated[srcIdx + 1];
      const b = pixelated[srcIdx + 2];
      const a = 255;

      for (let sy = 0; sy < 8; sy++) {
        for (let sx = 0; sx < 8; sx++) {
          const dy = knotY * 8 + sy;
          const dx = knotX * 8 + sx;
          const idx = (dy * 256 + dx) * 4;
          imgData.data[idx]     = r;
          imgData.data[idx + 1] = g;
          imgData.data[idx + 2] = b;
          imgData.data[idx + 3] = a;
        }
      }
    }
  }

  // ---- 6. Render -------------------------------------------------------
  ctx.putImageData(imgData, 0, 0);

  // ---- 7. Badge & caption ---------------------------------------------
  document.getElementById('badge').textContent = `Member #${memberId}/1000`;
  const caption = `Congratulations @${username}, you are ritualized! #${memberId}/1000 Knot Avatar`;
  document.getElementById('caption').textContent = caption;

  document.getElementById('output').style.display = 'block';
}

/* --------------------- Helper: load image -------------------------- */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/* --------------------- Helper: pixelate to N×N --------------------- */
function pixelate(img, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

/* --------------------- Knot mask (32×32) --------------------------- */
function getKnotMask() {
  // 1 = knot line (where photo can appear), 0 = background
  // This is a hand-crafted mask matching your knot image.
  const str = `
00000000000000011111111111111111
00000000000000111111111111111111
00000000000001111111111111111111
00000000000011111111111111111111
00000000000111111111111111111111
00000000001111111111111111111111
00000000011111111111111111111111
00000000111111111111111111111111
00000001111111111111111111111111
00000011111111111111111111111111
00000111111111111111111111111111
00001111111111111111111111111111
00011111111111111111111111111111
00111111111111111111111111111111
01111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
01111111111111111111111111111111
00111111111111111111111111111111
00011111111111111111111111111111
00001111111111111111111111111111
00000111111111111111111111111111
00000011111111111111111111111111
00000001111111111111111111111111
00000000111111111111111111111111
00000000011111111111111111111111
00000000001111111111111111111111
00000000000111111111111111111111
`.trim().replace(/\s/g, '');
  return Uint8Array.from(str.split('').map(c => +c));
}

/* --------------------- Download & copy ----------------------------- */
function download() {
  const canvas = document.getElementById('canvas');
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ritualnet-knot-pixel.png';
    a.click();
  });
}
function copyCaption() {
  navigator.clipboard.writeText(document.getElementById('caption').textContent)
    .then(() => alert('Caption copied!'));
}
