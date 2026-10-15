import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { computeBounds } from '@/lib/generator';
import { useSceneStore } from '@/store/sceneStore';
import { useUiStore } from '@/store/uiStore';
import type { ArchObject } from '@/types/scene';
import { cameraApi } from './cameraApi';

/** Where the camera sits relative to the composition: a three quarter architectural view. */
const VIEW_DIRECTION = new Vector3(1, 0.62, 1).normalize();
const HOME_DIRECTION = new Vector3(1, 0.58, 1).normalize();

interface Transition {
  fromPosition: Vector3;
  toPosition: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  start: number;
  duration: number;
}

export interface CameraApi {
  focus: () => void;
  home: () => void;
}

/**
 * Owns the orbit controls and glides the camera whenever a new composition is generated,
 * loaded or focused. Any user interaction cancels the glide immediately.
 */
export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useUiStore((s) => s.reducedMotion);

  const objects = useSceneStore((s) => s.objects);
  const buildVersion = useSceneStore((s) => s.buildVersion);
  const transition = useRef<Transition | null>(null);

  const framing = useMemo(() => computeFrame(objects), [objects]);

  const applyFrame = (useHome: boolean) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const direction = useHome ? HOME_DIRECTION : VIEW_DIRECTION;
    const target = new Vector3(...framing.target);
    const position = target.clone().addScaledVector(direction, framing.distance);

    if (reducedMotion) {
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
      invalidate();
      return;
    }

    transition.current = {
      fromPosition: camera.position.clone(),
      toPosition: position,
      fromTarget: controls.target.clone(),
      toTarget: target,
      start: performance.now(),
      duration: 900,
    };
    invalidate();
  };

  // Re-frame on every rebuild (generate / reset / load), never on manual edits.
  useEffect(() => {
    applyFrame(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildVersion]);

  useEffect(() => {
    cameraApi.current = { focus: () => applyFrame(false), home: () => applyFrame(true) };
    return () => {
      cameraApi.current = null;
    };
  });

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const cancel = () => {
      transition.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, []);

  useFrame(() => {
    const state = transition.current;
    if (!state) return;
    const t = Math.min(1, (performance.now() - state.start) / state.duration);
    const eased = easeInOutCubic(t);
    camera.position.lerpVectors(state.fromPosition, state.toPosition, eased);
    controlsRef.current?.target.lerpVectors(state.fromTarget, state.toTarget, eased);
    controlsRef.current?.update();
    invalidate();
    if (t >= 1) transition.current = null;
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.07}
      rotateSpeed={0.62}
      zoomSpeed={0.75}
      panSpeed={0.6}
      minDistance={4}
      maxDistance={140}
      maxPolarAngle={Math.PI * 0.495}
      target={[framing.target[0], framing.target[1], framing.target[2]]}
    />
  );
}

function computeFrame(objects: readonly ArchObject[]): { target: [number, number, number]; distance: number } {
  const bounds = computeBounds(objects);
  const size = new Vector3(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
  // Frame on the horizontal footprint: the vertical extent is already the subject, not the margin.
  const radius = Math.max(3, Math.hypot(size.x, size.z) * 0.5 + size.y * 0.18);
  const target: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    Math.max(1.0, bounds.min[1] + size.y * 0.3),
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  return { target, distance: radius * 1.95 + 3 };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}