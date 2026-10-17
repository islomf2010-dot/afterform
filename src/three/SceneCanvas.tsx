import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping } from 'three';
import { QUALITY_PROFILES } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { useSceneStore } from '@/store/sceneStore';
import { WebGLFallback } from '@/components/WebGLFallback';
import { ArchitectureScene } from './ArchitectureScene';
import { isWebGLAvailable } from './webgl';

/**
 * Full bleed canvas. Everything runs on demand: `frameloop="demand"` means the GPU is idle
 * unless a change, an animation or a user gesture asks for a frame.
 */
export function SceneCanvas() {
  const quality = useLookStore((s) => s.quality);
  const select = useSceneStore((s) => s.select);
  const profile = QUALITY_PROFILES[quality];

  if (!isWebGLAvailable()) return <WebGLFallback />;

  return (
    <Canvas
      className="scene-canvas"
      // PCF (type 1): PCFSoftShadowMap was removed in three 0.186 and silently downgrades.
      shadows={profile.shadows ? { type: 1, enabled: true } : false}
      dpr={[1, profile.maxPixelRatio]}
      frameloop="demand"
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      camera={{ fov: 38, near: 0.4, far: 400, position: [22, 14, 22] }}
      onCreated={(state) => {
        state.gl.toneMapping = ACESFilmicToneMapping;
        state.gl.toneMappingExposure = 1;
        // Dev-only handle for the preview and audit tools in scripts/.
        if (import.meta.env.DEV) (window as unknown as { __afterformScene?: unknown }).__afterformScene = state;
      }}
      onPointerMissed={() => select(null)}
    >
      <ArchitectureScene />
    </Canvas>
  );
}