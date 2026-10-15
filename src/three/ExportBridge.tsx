import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector2 } from 'three';
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { useUiStore } from '@/store/uiStore';

/** Longest edge of the exported image, in device pixels. */
const MAX_EXPORT_EDGE = 4096;

export interface ExportResult {
  ok: boolean;
  error?: string;
  bytes?: number;
}

/**
 * Bridges the UI export button to the renderer.
 *
 * The frame is rendered at export resolution on demand rather than reading the canvas back —
 * that way the export keeps full quality without paying for `preserveDrawingBuffer` on every
 * frame the user is looking at.
 */
export function ExportBridge({ onResult }: { onResult?: (result: ExportResult) => void }) {
  const gl = useThree((s) => s.gl) as WebGLRenderer;
  const scene = useThree((s) => s.scene) as Scene;
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);

  const request = useUiStore((s) => s.exportRequest);
  const notify = useUiStore((s) => s.notify);
  const busy = useRef(false);
  const lastRequest = useRef(request);

  const run = async () => {
    busy.current = true;
    const started = performance.now();
    try {
      const dataUrl = await captureFrame({ gl, scene, camera, invalidate, scale: 2, filename: 'afterform.png' });
      const bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
      onResult?.({ ok: true, bytes });
      notify(`PNG exported · ${(bytes / 1024 / 1024).toFixed(1)} MB`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The renderer refused to produce an image.';
      onResult?.({ ok: false, error: message });
      notify(`Export failed · ${message}`, 'error');
    } finally {
      // Keep the button responsive even on a slow integrated GPU.
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 260 - (performance.now() - started))));
      busy.current = false;
      lastRequest.current = useUiStore.getState().exportRequest;
    }
  };

  useEffect(() => {
    if (request === lastRequest.current || busy.current) return;
    lastRequest.current = request;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  return null;
}

interface CaptureOptions {
  gl: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  invalidate: () => void;
  scale: number;
  filename: string;
}

export async function captureFrame({ gl, scene, camera, invalidate, scale, filename }: CaptureOptions): Promise<string> {
  if (gl.getContext().isContextLost?.()) throw new Error('WebGL context lost.');

  const size = new Vector2();
  gl.getSize(size);
  const previousRatio = gl.getPixelRatio();
  const previousAspect = camera.aspect;

  const targetWidth = Math.min(MAX_EXPORT_EDGE, Math.round(size.x * scale));
  const targetHeight = Math.min(MAX_EXPORT_EDGE, Math.round(size.y * scale));

  try {
    gl.setPixelRatio(1);
    gl.setSize(targetWidth, targetHeight, false);
    camera.aspect = targetWidth / targetHeight;
    camera.updateProjectionMatrix();
    gl.render(scene, camera);

    const dataUrl = gl.domElement.toDataURL('image/png');
    if (!dataUrl || dataUrl.length < 128) throw new Error('Canvas returned an empty image.');
    downloadDataUrl(dataUrl, filename);
    return dataUrl;
  } finally {
    gl.setPixelRatio(previousRatio);
    gl.setSize(size.x, size.y, false);
    camera.aspect = previousAspect;
    camera.updateProjectionMatrix();
    gl.render(scene, camera);
    invalidate();
  }
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Exposed for the JSON side of the export manager. */
export function downloadText(text: string, filename: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next tick so Safari has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}