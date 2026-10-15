import { useMemo, useRef } from 'react';
import { Object3D } from 'three';
import type { DirectionalLight } from 'three';
import { LIGHTING_MODES, MATERIAL_PRESETS, QUALITY_PROFILES } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { selectBounds, useSceneStore } from '@/store/sceneStore';

/**
 * Key / fill / rim / accent rig.
 * Exactly one shadow caster — a second shadow map is the first thing an integrated GPU notices.
 */
export function LightingRig() {
  const lighting = useLookStore((s) => s.lighting);
  const keyIntensity = useLookStore((s) => s.keyIntensity);
  const accentColor = useLookStore((s) => s.accentColor);
  const material = useLookStore((s) => s.material);
  const quality = useLookStore((s) => s.quality);
  const objects = useSceneStore((s) => s.objects);

  const mode = LIGHTING_MODES[lighting];
  const profile = QUALITY_PROFILES[quality];
  const preset = MATERIAL_PRESETS[material];
  const keyRef = useRef<DirectionalLight>(null);

  // A single shared aim point keeps every light pointed at the centre of the composition.
  const target = useMemo(() => new Object3D(), []);

  const rig = useMemo(() => {
    const bounds = selectBounds(objects);
    const radius = Math.max(7, Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) * 0.75 + 6);
    const height = Math.max(14, bounds.max[1] + 8);
    const centre: [number, number, number] = [(bounds.min[0] + bounds.max[0]) / 2, bounds.min[1] + height * 0.16, (bounds.min[2] + bounds.max[2]) / 2];
    return { radius, height, centre };
  }, [objects]);

  const scale = (position: readonly [number, number, number]): [number, number, number] => {
    const factor = rig.radius / 12;
    return [position[0] * factor, position[1] * factor, position[2] * factor];
  };

  return (
    <group>
      <primitive object={target} position={rig.centre} />

      <ambientLight color={mode.ambient.color} intensity={mode.ambient.intensity} />
      <hemisphereLight args={[mode.ambient.color, mode.fogColor, mode.ambient.intensity * 0.5]} />

      <directionalLight
        ref={keyRef}
        color={mode.key.color}
        intensity={mode.key.intensity * keyIntensity}
        position={scale(mode.key.position)}
        target={target}
        castShadow={profile.shadows}
        shadow-mapSize-width={profile.shadowMapSize}
        shadow-mapSize-height={profile.shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={rig.radius * 4 + 80}
        shadow-camera-left={-rig.radius}
        shadow-camera-right={rig.radius}
        shadow-camera-top={rig.radius}
        shadow-camera-bottom={-rig.radius}
        shadow-bias={-0.0006}
        shadow-normalBias={0.035}
      />

      <directionalLight color={mode.fill.color} intensity={mode.fill.intensity * keyIntensity} position={scale(mode.fill.position)} target={target} />
      <directionalLight color={mode.rim.color} intensity={mode.rim.intensity} position={scale(mode.rim.position)} target={target} />

      {/* The single accent source — the only saturated colour allowed in the scene. */}
      <directionalLight
        color={accentColor}
        intensity={preset.accentIntensity * keyIntensity}
        position={[-rig.radius * 0.5, rig.height * 0.3, -rig.radius * 0.9]}
        target={target}
      />
    </group>
  );
}