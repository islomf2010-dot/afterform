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

/**
 * Where the camera sits relative to the composition.
 * Low and slightly off-axis: a high centred view reads as a plan drawing, which is the one
 * thing an architectural image must not look like.
 */
const VIEW_DIRECTION = new Vector3(1, 0.5, 1).normalize();
const HOME_DIRECTION = new Vector3(1.35, 0.34, 0.72).normalize();
/**
 * The title sequence's own framing: further back and a little higher, so the whole model
 * reads as a poster behind the wordmark instead of a cropped close-up.
 */
const INTRO_DIRECTION = new Vector3(1, 0.46, 1).normalize();
const INTRO_DISTANCE = 1.32;
/** Offsets used to compose the shot — the subject never sits dead centre. */
const FRAME_OFFSET = new Vector3(0.08, 0.02, -0.1);

/** Seconds of stillness before the camera starts to drift around the composition. */
const IDLE_DELAY = 12_000;
/** Degrees per second — slow enough to be felt rather than watched. */
const DRIFT_SPEED = 0.22;
/** How often the idle clock is checked. The poll itself renders nothing. */
const POLL_INTERVAL = 120;

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
  const phase = useUiStore((s) => s.phase);

  const objects = useSceneStore((s) => s.objects);
  const buildVersion = useSceneStore((s) => s.buildVersion);
  const transition = useRef<Transition | null>(null);
  /** Timestamp of the last camera interaction, used to decide when to start drifting. */
  const lastInteraction = useRef(0);

  const framing = useMemo(() => computeFrame(objects), [objects]);

  type Shot = 'studio' | 'home' | 'intro';

  /**
   * Moves the camera to a named shot. `instant` is used for the title framing, which must be
   * already correct when the wordmark fades in over it — a glide there would show the move.
   */
  const applyFrame = (shot: Shot, instant = false) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const direction = shot === 'home' ? HOME_DIRECTION : shot === 'intro' ? INTRO_DIRECTION : VIEW_DIRECTION;
    // Shift the aim point sideways and up: a dead-centred subject reads as a screenshot.
    const target = new Vector3(...framing.target).add(FRAME_OFFSET);
    const distance = shot === 'intro' ? framing.distance * INTRO_DISTANCE : framing.distance;
    const position = target.clone().addScaledVector(direction, distance);

    if (reducedMotion || instant) {
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
      duration: 1000,
    };
    invalidate();
  };

  // The title sequence gets its own framing the moment it appears, and the studio framing
  // on entry — so entering the studio is a camera move rather than a cut. A rebuild
  // (generate / reset / load) re-frames in whichever shot is on screen.
  useEffect(() => {
    applyFrame(phase === 'studio' ? 'studio' : 'intro', phase !== 'studio');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildVersion, phase]);

  useEffect(() => {
    cameraApi.current = { focus: () => applyFrame('studio'), home: () => applyFrame('home') };
    return () => {
      cameraApi.current = null;
    };
  });

  // Entering the studio restarts the idle clock, so the opening glide gets its full window
  // before the camera starts to move on its own. The title's Enter press is on a DOM button,
  // not on the canvas, so none of the interaction listeners below would have caught it.
  useEffect(() => {
    lastInteraction.current = performance.now();
  }, [phase]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    // Entering the studio starts the idle clock, so the opening glide gets its full window
    // before the camera starts to move on its own.
    lastInteraction.current = performance.now();
    const cancel = () => {
      transition.current = null;
      lastInteraction.current = performance.now();
      controls.autoRotate = false;
      invalidate();
    };
    controls.addEventListener('start', cancel);
    // Wheel zoom and element drags never fire `start`, so the activity clock is bumped here too.
    const dom = controls.domElement;
    if (!dom) return;
    // Hovering is presence: it stops the drift but changes nothing and renders nothing,
    // so it only touches the clock.
    const markActivity = () => {
      lastInteraction.current = performance.now();
    };
    dom.addEventListener('pointerdown', cancel);
    dom.addEventListener('pointermove', markActivity);
    dom.addEventListener('wheel', cancel, { passive: true });
    return () => {
      controls.removeEventListener('start', cancel);
      dom.removeEventListener('pointerdown', cancel);
      dom.removeEventListener('pointermove', markActivity);
      dom.removeEventListener('wheel', cancel);
    };
  }, []);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const state = transition.current;
    if (!state) return;

    // Cancelled if the studio is not on screen: nothing animates behind the title.
    if (phase !== 'studio') {
      transition.current = null;
      return;
    }
    const t = Math.min(1, (performance.now() - state.start) / state.duration);
    const eased = easeInOutCubic(t);
    camera.position.lerpVectors(state.fromPosition, state.toPosition, eased);
    controls.target.lerpVectors(state.fromTarget, state.toTarget, eased);
    controls.update();
    invalidate();
    if (t >= 1) transition.current = null;
  });

  /* ---- idle drift -------------------------------------------------- */

  /**
   * The idle clock has to live on a timer, not in the frame loop.
   *
   * With `frameloop="demand"` the frame callbacks only run while something is already
   * rendering — so a callback waiting to *start* an animation would wait forever. The poll
   * is cheap: it inspects a timestamp and does nothing at all until the delay has passed.
   */
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const poll = window.setInterval(() => {
      const idleFor = performance.now() - lastInteraction.current;
      // StructureField disables the controls while an element is being dragged.
      const canDrift = phase === 'studio' && !reducedMotion && controls.enabled;
      const shouldDrift = canDrift && idleFor > IDLE_DELAY;

      if (shouldDrift !== controls.autoRotate) {
        controls.autoRotate = shouldDrift;
        if (shouldDrift) controls.autoRotateSpeed = DRIFT_SPEED;
      }
      // While drifting, the demand loop has to keep being fed for OrbitControls to advance.
      if (controls.autoRotate) invalidate();
    }, POLL_INTERVAL);

    return () => {
      window.clearInterval(poll);
      controls.autoRotate = false;
    };
  }, [phase, reducedMotion, invalidate]);

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
    // Aim at the middle of the built height: the skyline gets the upper third, the plate the lower.
    Math.max(1.0, bounds.min[1] + size.y * 0.34),
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  return { target, distance: radius * 2.05 + 3.5 };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}