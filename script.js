/* -------------------------------------------------------------
   Ritualnet – Knot + Pixel Avatar (first 1 000 members)
   ------------------------------------------------------------- */

async function generate() {
    const raw = document.getElementById('username').value.trim().replace(/^@/, '');
    if (!raw) return alert('Enter a username!');

    const username = raw.toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(username);

    // ---- 1. SHA-256 seed -------------------------------------------------
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const hash = new Uint32Array(hashBuf);          // 8×32-bit words
    let seed = hash[0];

    // ---- 2. Member ID (1-1000) -------------------------------------------
    const memberId = (hash[1] % 1000) + 1;

    // ---- 3. Canvas (256×256 → 8× upscale of 32×32) ------------------------
    const canvas = document.getElementById('logoCanvas');
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(256, 256);

    // ---- 4. Seeded RNG ----------------------------------------------------
    const rng = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
    };

    // ---- 5. Draw the exact knot (32×32) ----------------------------------
    const knotPixels = getKnotPixels();               // defined below
    for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
            const on = knotPixels[y * 32 + x];
            const col = on ? [255, 255, 255, 255] : [0, 0, 0, 0];
            // upscale 8×
            for (let sy = 0; sy < 8; sy++) {
                for (let sx = 0; sx < 8; sx++) {
                    const idx = ((y * 8 + sy) * 256 + (x * 8 + sx)) * 4;
                    imgData.data.set(col, idx);
                }
            }
        }
    }

    // ---- 6. Pixel avatar (16×16) under the knot -------------------------
    const avatar = generateAvatar(hash);
    const avatarTop = 32 * 8 + 16;                     // 16 px gap after knot
    for (let ay = 0; ay < 16; ay++) {
        for (let ax = 0; ax < 16; ax++) {
            const on = avatar[ay * 16 + ax];
            const col = on ? [180, 100, 255, 255] : [0, 0, 0, 0];
            // upscale 8×
            for (let sy = 0; sy < 8; sy++) {
                for (let sx = 0; sx < 8; sx++) {
                    const py = avatarTop + ay * 8 + sy;
                    const px = 40 + ax * 8 + sx;      // centered horizontally
                    const idx = (py * 256 + px) * 4;
                    imgData.data.set(col, idx);
                }
            }
        }
    }

    // ---- 7. Render -------------------------------------------------------
    ctx.putImageData(imgData, 0, 0);

    // ---- 8. Badge --------------------------------------------------------
    document.getElementById('badge').textContent = `Member #${memberId}/1000`;

    // ---- 9. Export PNG ---------------------------------------------------
    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        img.style.display = 'block';
        // (no <img> element needed – canvas is shown)
    });

    // ---- 10. Caption -----------------------------------------------------
    const caption = `Congratulations @${username}, you are ritualized! #${memberId}/1000 Knot Avatar`;
    document.getElementById('caption').textContent = caption;

    document.getElementById('output').style.display = 'block';
}

/* -------------------------------------------------------------
   Knot pixel data (32×32) – generated from the posted image
   ------------------------------------------------------------- */
function getKnotPixels() {
    // 1 = white pixel, 0 = transparent
    const data = `
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
11111111111111111111111111111111
`.trim().replace(/\s/g, '');
    return Uint8Array.from(data.split('').map(c => +c));
}

/* -------------------------------------------------------------
   Avatar generator – 16×16 symmetric pixel avatar
   ------------------------------------------------------------- */
function generateAvatar(hash) {
    const size = 16;
    const pixels = new Uint8Array(size * size);
    let seed = hash[2];
    const rng = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed >>> 24;               // 0-255
    };

    // Fill left half, mirror to right
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size / 2; x++) {
            const on = rng() > 120;        // ~53% lit
            pixels[y * size + x] = on;
            pixels[y * size + (size - 1 - x)] = on;
        }
    }
    return pixels;
}

/* -------------------------------------------------------------
   Download & copy helpers
   ------------------------------------------------------------- */
function download() {
    const canvas = document.getElementById('logoCanvas');
    canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ritualnet-knot-avatar.png';
        a.click();
    });
}
function copyCaption() {
    navigator.clipboard.writeText(document.getElementById('caption').textContent)
        .then(() => alert('Caption copied!'));
}
