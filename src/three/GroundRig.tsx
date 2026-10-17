import { useMemo } from 'react';
import { AdditiveBlending, CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { MATERIAL_PRESETS, QUALITY_PROFILES } from '@/lib/presets';
import type { MaterialPreset } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { selectBounds, useSceneStore } from '@/store/sceneStore';

const GROUND_SIZE = 360;

/**
 * The plate the study sits on, plus a survey grid that fades with distance.
 *
 * The ground is darker than the masses on purpose: it reads as a table the model stands on
 * rather than a horizon, and it gives the composition a base line.
 */
export function GroundRig() {
  const material = useLookStore((s) => s.material);
  const gridVisible = useLookStore((s) => s.gridVisible);
  const quality = useLookStore((s) => s.quality);
  const objects = useSceneStore((s) => s.objects);

  const preset = MATERIAL_PRESETS[material];
  const profile = QUALITY_PROFILES[quality];

  const extent = useMemo(() => {
    const bounds = selectBounds(objects);
    return Math.max(40, Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) + 40);
  }, [objects]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial
          color={preset.ground.color}
          roughness={preset.ground.roughness}
          metalness={preset.ground.metalness}
          envMapIntensity={preset.tones.mass.envMapIntensity * 0.5}
        />
      </mesh>

      {gridVisible && <SurveyGrid extent={extent} preset={preset} segments={profile.gridSegments} />}
    </group>
  );
}

/**
 * The survey grid is a generated texture on one quad, not a shader grid: it costs a single
 * draw call, needs no uniforms, and dissolves toward the horizon instead of stopping at a
 * hard edge. Additive blending makes the lines glow on dark grounds and vanish on light ones.
 */
function SurveyGrid({ extent, preset, segments }: { extent: number; preset: MaterialPreset; segments: number }) {
  const texture = useMemo(() => {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    const cells = Math.max(8, Math.round(segments / 2));
    const step = size / cells;
    ctx.strokeStyle = preset.grid.color;

    for (let i = 0; i <= cells; i++) {
      const at = Math.round(i * step) + 0.5;
      // Every fifth line is a setting-out line: heavier, the way a real plan is drawn.
      const major = i % 5 === 0;
      ctx.globalAlpha = major ? 1 : 0.4;
      ctx.lineWidth = major ? 2.2 : 1.1;
      ctx.beginPath();
      ctx.moveTo(at, 0);
      ctx.lineTo(at, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, at);
      ctx.lineTo(size, at);
      ctx.stroke();
    }

    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.wrapS = RepeatWrapping;
    map.wrapT = RepeatWrapping;
    const repeat = Math.max(4, Math.round(extent / 4));
    map.repeat.set(repeat, repeat);
    return map;
  }, [preset.grid.color, segments, extent]);

  if (!texture) return null;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} renderOrder={1}>
      <planeGeometry args={[extent * 2.4, extent * 2.4]} />
      <meshBasicMaterial map={texture} transparent opacity={0.42} depthWrite={false} blending={AdditiveBlending} />
    </mesh>
  );
}