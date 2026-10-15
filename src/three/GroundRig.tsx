import { Grid } from '@react-three/drei';
import { useMemo } from 'react';
import { MATERIAL_PRESETS, QUALITY_PROFILES } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { useSceneStore } from '@/store/sceneStore';
import { selectBounds } from '@/store/sceneStore';

/** The plate the whole study stands on, plus a survey grid that fades out with distance. */
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
        <planeGeometry args={[extent * 4, extent * 4]} />
        <meshStandardMaterial
          color={preset.ground.color}
          roughness={preset.ground.roughness}
          metalness={preset.ground.metalness}
          envMapIntensity={preset.envMapIntensity * 0.6}
        />
      </mesh>

      {gridVisible && (
        <Grid
          position={[0, 0.004, 0]}
          args={[extent * 2, profile.gridSegments]}
          cellSize={2}
          cellThickness={0.6}
          cellColor={preset.grid.color}
          sectionSize={10}
          sectionThickness={1}
          sectionColor={preset.grid.color}
          fadeDistance={extent * 1.35}
          fadeStrength={1.4}
          followCamera={false}
          infiniteGrid
        />
      )}
    </group>
  );
}