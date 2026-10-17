import { CanvasTexture } from 'three';

let shadow: CanvasTexture | null = null;

/**
 * A radial falloff built once and shared: the contact shadow has no edges, only weight.
 * Black and transparent, so it can be tinted by whatever the ground colour is.
 */
export function shadowTexture(): CanvasTexture {
  if (shadow) return shadow;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.06, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,0.95)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0.62)');
    gradient.addColorStop(0.82, 'rgba(0,0,0,0.18)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  shadow = new CanvasTexture(canvas);
  return shadow;
}