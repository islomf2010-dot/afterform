import { useMemo } from 'react';
import { DoubleSide } from 'three';
import { LIGHTING_MODES, MATERIAL_PRESETS } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { selectBounds, useSceneStore } from '@/store/sceneStore';
import { shadowTexture } from './shadowTexture';

/**
 * Contact shadows: a soft dark pool under the composition, painted as a single quad.
 *
 * The key light already casts real shadows. What it cannot do is darken the ground *under* a
 * mass the camera is looking down on — the classic floating-object tell. One transparent quad,
 * one draw call, and it puts the model back on its table.
 */
export function ContactShadowRig() {
  const lighting = useLookStore((s) => s.lighting);
  const material = useLookStore((s) => s.material);
  const quality = useLookStore((s) => s.quality);
  const objects = useSceneStore((s) => s.objects);

  const mode = LIGHTING_MODES[lighting];
  const preset = MATERIAL_PRESETS[material];
  const texture = useMemo(() => shadowTexture(), []);

  const footprint = useMemo(() => {
    const bounds = selectBounds(objects);
    return {
      centre: [(bounds.min[0] + bounds.max[0]) / 2, 0, (bounds.min[2] + bounds.max[2]) / 2] as [number, number, number],
      width: bounds.max[0] - bounds.min[0] + 8,
      depth: bounds.max[2] - bounds.min[2] + 8,
    };
  }, [objects]);

  // A high sun casts a tight shadow; a low sun spreads it across the plate.
  const spread = lighting === 'day' ? 0.66 : lighting === 'dusk' ? 0.9 : 0.78;
  const opacity = mode.contactStrength * (quality === 'lite' ? 0.7 : 1);

  return (
    <mesh
      position={[footprint.centre[0], 0.0035, footprint.centre[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
      raycast={() => null}
    >
      <planeGeometry args={[footprint.width * spread, footprint.depth * spread]} />
      <meshBasicMaterial
        map={texture}
        color={preset.ground.color}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}