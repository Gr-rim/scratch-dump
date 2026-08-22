// ocrWorker.js — image preprocessing for OCR.
//
// Deliberately knows nothing about Tesseract. tesseract.js already runs
// recognition inside its own worker, so the only thing left that would block
// the panel's main thread is the canvas work — and that is all this does.
//
// Protocol: postMessage({ jobId, bitmap }) with the ImageBitmap transferred.
// Replies { jobId, blob } (PNG) or { jobId, error }.
'use strict';

// Below this width, glyphs are too few pixels tall for Tesseract to segment.
// Upscaling does not add detail, but it does give the binarizer and the line
// finder something to work with.
const UPSCALE_BELOW_WIDTH = 1000;
const UPSCALE_FACTOR      = 2;
// Guard against a pathological paste turning into a gigabyte of canvas.
const MAX_DIMENSION       = 4000;

/**
 * Otsu's method: pick the luminance threshold that minimises intra-class
 * variance. A fixed threshold fails badly on the two cases that matter most
 * here — dim screenshots and syntax-highlighted code — because neither has
 * its ink anywhere near 50% grey.
 *
 * @param {Uint32Array} hist — 256-bucket luminance histogram
 * @param {number} total — pixel count
 * @returns {number} threshold in 0..255
 */
function otsuThreshold(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/**
 * Scale up, then flatten to hard black-on-white.
 *
 * The polarity check at the end is what makes dark-mode screenshots work.
 * Tesseract is trained on dark ink on light paper and does poorly on the
 * reverse, so after thresholding we look at which side is the minority —
 * text is nearly always the smaller class — and invert if the image turns
 * out to be light ink on a dark ground.
 *
 * @param {ImageBitmap} bitmap
 * @returns {Promise<Blob>} PNG, lossless so the hard edges survive
 */
async function preprocess(bitmap) {
  const scale = bitmap.width < UPSCALE_BELOW_WIDTH ? UPSCALE_FACTOR : 1;
  const w = Math.min(MAX_DIMENSION, Math.round(bitmap.width  * scale));
  const h = Math.min(MAX_DIMENSION, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  // Nearest-neighbour: interpolation would soften exactly the glyph edges the
  // threshold pass is about to look for.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const img  = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const total = w * h;

  // Pass 1: luminance histogram (Rec. 601, integer-weighted).
  const hist = new Uint32Array(256);
  const lum  = new Uint8Array(total);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const l = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    lum[p] = l;
    hist[l]++;
  }

  const threshold = otsuThreshold(hist, total);

  // Pass 2: count which class is the minority, so we know the polarity.
  let below = 0;
  for (let p = 0; p < total; p++) if (lum[p] <= threshold) below++;
  // If most pixels are dark, the background is dark — invert so ink ends
  // up dark on a light ground.
  const invert = below > total / 2;

  // Pass 3: flatten.
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let ink = lum[p] <= threshold;
    if (invert) ink = !ink;
    const v = ink ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

self.onmessage = async (e) => {
  const { jobId, bitmap } = e.data || {};
  try {
    const blob = await preprocess(bitmap);
    self.postMessage({ jobId, blob });
  } catch (err) {
    try { bitmap?.close(); } catch { /* already closed */ }
    self.postMessage({ jobId, error: String(err && err.message || err) });
  }
};
