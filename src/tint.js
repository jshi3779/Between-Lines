import { useEffect, useState } from "react";

// Recolours the collaborator artwork (tag and avatar ring) at runtime: pixels close to the art's
// own colour are moved to the target hue/saturation, keeping their light-and-shade, so a tag can
// take any colour while the avatar photo and the white details stay untouched.

const hexToHsl = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
};
const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const hslToRgb = (h, s, l) => {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const cache = new Map();
export const tintImage = (src, fromHex, toHex) => {
  const key = `${src}|${fromHex}|${toHex}`;
  if (!cache.has(key)) {
    cache.set(key, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = 4, w = img.naturalWidth * scale, h = img.naturalHeight * scale;
        const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
        const g = canvas.getContext("2d"); g.drawImage(img, 0, 0, w, h);
        const data = g.getImageData(0, 0, w, h), px = data.data;
        const [h0, s0, l0] = hexToHsl(fromHex), [h1, s1, l1] = hexToHsl(toHex);
        for (let i = 0; i < px.length; i += 4) {
          if (!px[i + 3]) continue;
          const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
          if (s < 0.3 || hueGap(h, h0) > 28) continue;               // not the art's colour (photo, white, outline)
          const nl = Math.max(0, Math.min(1, l1 + (l - l0)));
          const [r, gg, b] = hslToRgb(h1, Math.min(1, s1 * (s / s0)), nl);
          px[i] = r; px[i + 1] = gg; px[i + 2] = b;
        }
        g.putImageData(data, 0, 0);
        resolve(canvas.toDataURL());
      };
      img.onerror = () => resolve(src);
      img.src = src;
    }));
  }
  return cache.get(key);
};

// The art's own colour shows until the tinted copy is ready (and when no tint is needed).
export const useTinted = (src, fromHex, toHex) => {
  const [url, setUrl] = useState(null);
  const same = !toHex || toHex.toLowerCase() === fromHex.toLowerCase();
  useEffect(() => {
    if (same) return undefined;
    let live = true;
    tintImage(src, fromHex, toHex).then((result) => { if (live) setUrl(result); });
    return () => { live = false; };
  }, [src, fromHex, toHex, same]);
  return same ? src : url ?? src;
};
