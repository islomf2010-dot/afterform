import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/Controls';

/**
 * Shown instead of the canvas when the browser cannot give us a WebGL context.
 * The editor stays usable: the composition data is not lost, only the view.
 */
export function WebGLFallback() {
  return (
    <div className="fallback">
      <div className="fallback__card" role="alert">
        <div className="row" style={{ marginBottom: 12, color: 'var(--accent)' }}>
          <AlertTriangle size={16} strokeWidth={1.5} />
          <span className="mono" style={{ color: 'var(--accent)' }}>
            Rendering unavailable
          </span>
        </div>
        <h1 className="fallback__title">This browser cannot open a WebGL context</h1>
        <p className="fallback__body">
          AFTERFORM renders its compositions on the GPU. Hardware acceleration appears to be disabled, or the context could not be created.
          Enable it in the browser settings, update the graphics driver, or open the studio on a machine with a supported GPU.
        </p>
        <div className="row">
          <Button onClick={() => window.location.reload()}>Try again</Button>
          <span className="mono" style={{ color: 'var(--text-ghost)' }}>
            Composition data is preserved
          </span>
        </div>
        <div className="fallback__meta mono">
          <span>Check chrome://gpu</span>
          <span>Check about:config · webgl.force-enabled</span>
        </div>
      </div>
    </div>
  );
}