// Tiny pixel-buffer drawing toolkit: hard edges only, no anti-aliasing.

export class Surface {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  idx(x, y) {
    return (y * this.width + x) * 4;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Hard set (replaces the pixel, alpha included). */
  set(x, y, c) {
    x |= 0;
    y |= 0;
    if (!this.inside(x, y) || !c) return;
    const i = this.idx(x, y);
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c.length > 3 ? c[3] : 255;
  }

  get(x, y) {
    if (!this.inside(x, y)) return [0, 0, 0, 0];
    const i = this.idx(x, y);
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  alphaAt(x, y) {
    if (!this.inside(x, y)) return 0;
    return this.data[this.idx(x, y) + 3];
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  hline(x0, x1, y, c) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }

  vline(x, y0, y1, c) {
    if (y1 < y0) [y0, y1] = [y1, y0];
    for (let y = y0; y <= y1; y++) this.set(x, y, c);
  }

  /** Solid ellipse, integer bounds, no AA. */
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
      for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++) {
        const dx = (x - cx) / (rx + 0.001);
        const dy = (y - cy) / (ry + 0.001);
        if (dx * dx + dy * dy <= 1.02) this.set(x, y, c);
      }
    }
  }

  /** Rounded rectangle with 1px clipped corners (classic pixel-art shape). */
  roundRect(x, y, w, h, c, corner = 1) {
    for (let j = 0; j < h; j++) {
      let inset = 0;
      if (j < corner) inset = corner - j;
      else if (j >= h - corner) inset = corner - (h - 1 - j);
      this.hline(x + inset, x + w - 1 - inset, y + j, c);
    }
  }

  /** Vertical trapezoid: edges interpolate linearly from (y0) to (y1). */
  trapezoid(y0, y1, leftTop, rightTop, leftBottom, rightBottom, c) {
    const span = Math.max(1, y1 - y0);
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / span;
      const l = Math.round(leftTop + (leftBottom - leftTop) * t);
      const r = Math.round(rightTop + (rightBottom - rightTop) * t);
      this.hline(l, r, y, c);
    }
  }

  /** Thick line (Bresenham + square brush) — used for blades and limbs. */
  line(x0, y0, x1, y1, c, thickness = 1) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    const half = Math.floor((thickness - 1) / 2);
    for (;;) {
      for (let j = 0; j < thickness; j++)
        for (let i = 0; i < thickness; i++) this.set(x0 + i - half, y0 + j - half, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Arc of pixels (crescent / swoosh trails). */
  arc(cx, cy, radius, a0, a1, c, thickness = 1, radiusY = radius) {
    const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) * radius * 2));
    for (let s = 0; s <= steps; s++) {
      const a = a0 + ((a1 - a0) * s) / steps;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radiusY;
      const half = Math.floor((thickness - 1) / 2);
      for (let j = 0; j < thickness; j++)
        for (let i = 0; i < thickness; i++)
          this.set(Math.round(x) + i - half, Math.round(y) + j - half, c);
    }
  }

  /** 1px outline hugging the silhouette, expanded outward. */
  outline(color) {
    const mask = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++)
        if (this.alphaAt(x, y) > 0) mask[y * this.width + x] = 1;
    const solid = (x, y) =>
      x >= 0 && y >= 0 && x < this.width && y < this.height ? mask[y * this.width + x] : 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))
          this.set(x, y, color);
      }
    }
  }

  scaleAlpha(factor) {
    for (let i = 3; i < this.data.length; i += 4)
      this.data[i] = Math.max(0, Math.min(255, Math.round(this.data[i] * factor)));
  }

  /** Source-over composite of another surface at an offset. */
  blit(src, ox = 0, oy = 0) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const sa = src.alphaAt(x, y);
        if (sa === 0) continue;
        const dx = ox + x;
        const dy = oy + y;
        if (!this.inside(dx, dy)) continue;
        const s = src.get(x, y);
        if (sa === 255) {
          this.set(dx, dy, s);
          continue;
        }
        const d = this.get(dx, dy);
        const a = sa / 255;
        const da = d[3] / 255;
        const outA = a + da * (1 - a);
        const mix = (sc, dc) => Math.round((sc * a + dc * da * (1 - a)) / (outA || 1));
        this.set(dx, dy, [mix(s[0], d[0]), mix(s[1], d[1]), mix(s[2], d[2]), Math.round(outA * 255)]);
      }
    }
  }
}

/** Blend a colour toward white — used for the hurt flash. */
export function flashed(c, amount) {
  if (!amount) return c;
  const a = c.length > 3 ? c[3] : 255;
  return [
    Math.round(c[0] + (255 - c[0]) * amount),
    Math.round(c[1] + (255 - c[1]) * amount),
    Math.round(c[2] + (255 - c[2]) * amount),
    a,
  ];
}
