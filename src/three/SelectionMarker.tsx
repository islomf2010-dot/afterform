import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, DoubleSide } from 'three';
import type { LineBasicMaterial, Mesh } from 'three';
import { useLookStore } from '@/store/lookStore';
import { useSceneStore } from '@/store/sceneStore';
import { useUiStore } from '@/store/uiStore';
import { UNIT_EDGES } from './geometry';

/**
 * Selection feedback: a wireframe of the element plus a footprint ring on the ground.
 * Deliberately quiet — the accent is a survey mark, not a highlight.
 */
export function SelectionMarker() {
  const selection = useSceneStore((s) => s.selection);
  const objects = useSceneStore((s) => s.objects);
  const accentColor = useLookStore((s) => s.accentColor);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const invalidate = useThree((s) => s.invalidate);

  const edges = useRef<import('three').LineSegments>(null);
  const ring = useRef<Mesh>(null);

  const object = useMemo(() => objects.find((o) => o.id === selection) ?? null, [objects, selection]);

  useFrame((state) => {
    if (!object || reducedMotion) return;
    // A very slow breath keeps the selection findable without pulling the eye.
    const value = 0.62 + 0.28 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 1.7));
    if (edges.current) (edges.current.material as LineBasicMaterial).opacity = value;
    if (ring.current) (ring.current.material as unknown as { opacity: number }).opacity = value * 0.55;
    invalidate();
  });

  if (!object) return null;

  const [w, h, d] = object.size;
  const radius = Math.max(w, d) * 0.52;

  return (
    <group position={object.position}>
      <lineSegments ref={edges} geometry={UNIT_EDGES} scale={[w, h, d]} renderOrder={6}>
        <lineBasicMaterial color={accentColor} transparent opacity={0.72} depthTest={false} />
      </lineSegments>
      <mesh ref={ring} position={[0, -h / 2 + 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5}>
        <ringGeometry args={[radius, radius + 0.06, 48]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.4} depthWrite={false} side={DoubleSide} blending={AdditiveBlending} />
      </mesh>
    </group>
  );
}