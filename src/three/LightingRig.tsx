import { useMemo, useRef } from 'react';
import { DirectionalLight, Object3D } from 'three';
import { LIGHTING_MODES, MATERIAL_PRESETS, QUALITY_PROFILES } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { selectBounds, useSceneStore } from '@/store/sceneStore';
import { useUiStore } from '@/store/uiStore';

const KEY_DIRECTION: Record<string, [number, number, number]> = {};

/**
 * Key / fill / rim / accent rig.
 *
 * The lighting is the image: one hard key that carves the masses, a cool bounce that keeps the
 * shadow side alive, and a back light that separates the silhouette from the background.
 * Exactly one shadow caster — a second shadow map is the first thing an integrated GPU notices.
 */
export function LightingRig() {
  const lighting = useLookStore((s) => s.lighting);
  const keyIntensity = useLookStore((s) => s.keyIntensity);
  const accentColor = useLookStore((s) => s.accentColor);
  const material = useLookStore((s) => s.material);
  const quality = useLookStore((s) => s.quality);
  const objects = useSceneStore((s) => s.objects);
  const phase = useUiStore((s) => s.phase);

  const mode = LIGHTING_MODES[lighting];
  const profile = QUALITY_PROFILES[quality];
  const preset = MATERIAL_PRESETS[material];

  // A single shared aim point keeps every light pointed at the centre of the composition.
  const target = useMemo(() => new Object3D(), []);
  const keyRef = useRef<DirectionalLight>(null);

  const rig = useMemo(() => {
    const bounds = selectBounds(objects);
    const radius = Math.max(7, Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) * 0.75 + 6);
    const height = Math.max(14, bounds.max[1] + 8);
    const centre: [number, number, number] = [
      (bounds.min[0] + bounds.max[0]) / 2,
      bounds.min[1] + height * 0.16,
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
    return { radius, height, centre };
  }, [objects]);

  /**
   * The key sits low and to the side. A high key flattens masses into slabs; a low one
   * rakes across them and gives every edge a line of light.
   */
  const keyDirection = KEY_DIRECTION[lighting] ?? (KEY_DIRECTION[lighting] = keyFor(lighting));

  const place = (direction: readonly [number, number, number], length: number): [number, number, number] => [
    rig.centre[0] + direction[0] * length,
    rig.centre[1] + direction[1] * length,
    rig.centre[2] + direction[2] * length,
  ];

  return (
    <group>
      <primitive object={target} position={rig.centre} />

      {/* Ambient only carries the deepest shadow — any more and the modelling dies. */}
      <ambientLight color={mode.ambient.color} intensity={mode.ambient.intensity * 0.55} />
      <hemisphereLight args={[mode.ambient.color, mode.fogColor, mode.ambient.intensity * 0.42]} />

      <directionalLight
        ref={keyRef}
        color={mode.key.color}
        intensity={mode.key.intensity * keyIntensity}
        position={place(keyDirection, rig.radius * 1.15 + rig.height * 0.5)}
        target={target}
        castShadow={profile.shadows}
        shadow-mapSize-width={profile.shadowMapSize}
        shadow-mapSize-height={profile.shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={rig.radius * 5 + 120}
        shadow-camera-left={-rig.radius}
        shadow-camera-right={rig.radius}
        shadow-camera-top={rig.radius}
        shadow-camera-bottom={-rig.radius}
        shadow-bias={-0.0004}
        shadow-normalBias={0.045}
        shadow-radius={profile.shadows ? 2.5 : 1}
      />

      {/* Cool bounce from the shadow side: keeps black from going dead without lifting the key. */}
      <directionalLight color={mode.fill.color} intensity={mode.fill.intensity * keyIntensity} position={place(mode.fill.position, rig.radius * 1.4)} target={target} />

      {/* Back light. This is the one that draws an edge around the silhouette. */}
      <directionalLight color={mode.rim.color} intensity={mode.rim.intensity * (0.6 + keyIntensity * 0.5)} position={place(mode.rim.position, rig.radius * 1.8)} target={target} />

      {/*
        Title-sequence fill: a soft frontal light that only matters while the intro is up.
        It is what keeps a dark composition readable behind the wordmark. Keyed on the phase,
        so the studio is never lit differently because of it.
      */}
      {phase !== 'studio' && <directionalLight color="#cfd8e4" intensity={1.1} position={place([0.35, 0.72, 1], rig.radius * 1.9)} target={target} />}

      {/* The single accent source — the only saturated colour in the scene. */}
      <directionalLight
        color={accentColor}
        intensity={preset.accentIntensity * keyIntensity}
        position={[rig.centre[0] - rig.radius * 0.7, rig.centre[1] + rig.height * 0.25, rig.centre[2] - rig.radius * 1.1]}
        target={target}
      />
    </group>
  );
}

/** Where the sun sits for each mode, as a unit direction from the composition. */
function keyFor(lighting: string): [number, number, number] {
  switch (lighting) {
    case 'day':
      return [0.62, 0.72, 0.3];
    case 'dusk':
      return [0.88, 0.26, 0.4];
    case 'night':
      return [-0.42, 0.66, -0.62];
    default:
      return [0.62, 0.72, 0.3];
  }
}