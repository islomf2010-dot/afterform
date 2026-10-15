import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  EdgesGeometry,
  FrontSide,
  InstancedMesh,
  Matrix4,
  Plane,
  Quaternion,
  Vector3,
} from 'three';
import { buildPartIndex } from '@/lib/parts';
import type { PartInstance } from '@/lib/parts';
import type { MaterialPreset } from '@/lib/presets';
import { useSceneStore } from '@/store/sceneStore';
import { useUiStore } from '@/store/uiStore';
import type { ArchObject } from '@/types/scene';
import { UNIT_BOX } from './geometry';

const UNIT_EDGES = new EdgesGeometry(UNIT_BOX);

const MATRIX = new Matrix4();
const QUAT = new Quaternion();
const POSITION = new Vector3();
const SCALE = new Vector3();
const HIT = new Vector3();
const NORMAL = new Vector3();
const CAMERA_DIR = new Vector3();
const OFFSET = new Vector3();

const ENTRANCE_DURATION = 0.52;
const STAGGER = 0.016;

interface DragState {
  id: string;
  mode: 'xz' | 'y';
  offset: Vector3;
  plane: Plane;
}

interface Props {
  objects: ArchObject[];
  preset: MaterialPreset;
}

/**
 * Renders the whole composition as one InstancedMesh — a single draw call regardless of how many
 * elements the generator produced. Selection and editing happen through instanceId, which keeps
 * picking exact and cheap.
 */
export function StructureField({ objects, preset }: Props) {
  const parts = useMemo(() => buildPartIndex(objects), [objects]);
  const meshRef = useRef<InstancedMesh>(null);
  const drag = useRef<DragState | null>(null);

  const select = useSceneStore((s) => s.select);
  const updateObject = useSceneStore((s) => s.updateObject);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const invalidate = useThree((s) => s.invalidate);
  const clock = useThree((s) => s.clock);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;

  /* ---- entrance animation ---------------------------------------- */

  /** Per element entrance progress, kept in a ref so it never triggers React renders. */
  const progress = useMemo(() => new Float32Array(Math.max(1, parts.length)).fill(1), [parts.length]);
  const startTime = useRef(0);

  const writeMatrices = () => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < parts.length; i++) {
      composePartMatrix(parts[i], progress[i] ?? 1, MATRIX);
      mesh.setMatrixAt(i, MATRIX);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = parts.length;
    progress.fill(reducedMotion ? 1 : 0);
    startTime.current = clock.getElapsedTime();
    writeMatrices();
    invalidate();
  }, [parts, reducedMotion, progress, clock, invalidate]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    let animating = false;
    const elapsed = state.clock.elapsedTime - startTime.current;
    for (let i = 0; i < parts.length; i++) {
      if (progress[i] >= 1) continue;
      animating = true;
      progress[i] = easeOutCubic(clamp01((elapsed - (i % 28) * STAGGER) / ENTRANCE_DURATION));
    }
    if (!animating) return;
    writeMatrices();
    invalidate();
  });

  /* ---- selection + dragging -------------------------------------- */

  const beginDrag = (event: ThreeEvent<PointerEvent>, objectId: string) => {
    event.stopPropagation();
    select(objectId);
    if (event.button !== 0) return;

    const object = objects.find((o) => o.id === objectId);
    if (!object) return;

    const mode: 'xz' | 'y' = event.shiftKey ? 'y' : 'xz';
    const plane = new Plane();
    if (mode === 'xz') {
      plane.setFromNormalAndCoplanarPoint(NORMAL.set(0, 1, 0), POSITION.set(...object.position));
    } else {
      event.camera.getWorldDirection(CAMERA_DIR);
      CAMERA_DIR.y = 0;
      if (CAMERA_DIR.lengthSq() < 1e-6) CAMERA_DIR.set(0, 0, 1);
      plane.setFromNormalAndCoplanarPoint(CAMERA_DIR.normalize(), POSITION.set(...object.position));
    }
    if (!event.ray.intersectPlane(plane, HIT)) return;

    OFFSET.set(...object.position).sub(HIT);
    drag.current = { id: objectId, mode, offset: OFFSET.clone(), plane };
    if (controls) controls.enabled = false;
  };

  const moveDrag = (event: ThreeEvent<PointerEvent>) => {
    const state = drag.current;
    if (!state) return;
    event.stopPropagation();
    const object = objects.find((o) => o.id === state.id);
    if (!object) return;
    if (!event.ray.intersectPlane(state.plane, HIT)) return;
    HIT.add(state.offset);
    if (state.mode === 'y') updateObject(state.id, { position: [object.position[0], HIT.y, object.position[2]] });
    else updateObject(state.id, { position: [HIT.x, object.position[1], HIT.z] });
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    if (controls) controls.enabled = true;
  };

  useEffect(() => {
    const stop = () => endDrag();
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
  }, [controls]);

  useEffect(() => {
    invalidate();
  }, [objects, invalidate]);

  /* ---- glass edge overlay ---------------------------------------- */

  const edgeGeometry = useMemo(() => (preset.transparent ? buildEdgeGeometry(parts) : null), [parts, preset.transparent]);

  useEffect(() => {
    return () => edgeGeometry?.dispose();
  }, [edgeGeometry]);

  const edgeColor = useMemo(() => new Color(preset.edge), [preset.edge]);

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[UNIT_BOX, undefined, Math.max(1, parts.length)]}
        castShadow={!preset.transparent}
        receiveShadow={!preset.transparent}
        frustumCulled={false}
        renderOrder={preset.transparent ? 2 : 0}
        onPointerDown={(event) => {
          const id = event.instanceId === undefined ? undefined : parts[event.instanceId]?.objectId;
          if (id) beginDrag(event, id);
        }}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      >
        <meshPhysicalMaterial {...materialProps(preset)} />
      </instancedMesh>

      {edgeGeometry && (
        <lineSegments geometry={edgeGeometry} renderOrder={3} frustumCulled={false}>
          <lineBasicMaterial color={edgeColor} transparent opacity={preset.edgeOpacity} depthWrite={false} />
        </lineSegments>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function materialProps(preset: MaterialPreset) {
  return {
    color: preset.color,
    roughness: preset.roughness,
    metalness: preset.metalness,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: preset.clearcoatRoughness,
    transparent: preset.transparent,
    opacity: preset.opacity,
    envMapIntensity: preset.envMapIntensity,
    depthWrite: !preset.transparent,
    side: FrontSide,
  };
}

/** Every box edge of every part in one buffer — one draw call instead of hundreds. */
function buildEdgeGeometry(parts: readonly PartInstance[]): BufferGeometry {
  const source = UNIT_EDGES.getAttribute('position');
  const stride = source.count * 3;
  const positions = new Float32Array(parts.length * stride);
  const local = new Matrix4();
  const offset = new Vector3();

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    offset.set(0, 0, 0);
    local.compose(offset, QUAT, SCALE.set(part.size[0], part.size[1], part.size[2]));
    local.setPosition(...part.position);
    const base = p * stride;
    for (let v = 0; v < source.count; v++) {
      POSITION.fromBufferAttribute(source as BufferAttribute, v).applyMatrix4(local);
      positions[base + v * 3] = POSITION.x;
      positions[base + v * 3 + 1] = POSITION.y;
      positions[base + v * 3 + 2] = POSITION.z;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Anchors the entrance animation so elements grow out of the ground, not out of their centre. */
function composePartMatrix(part: PartInstance, scale: number, target: Matrix4): void {
  const s = Math.max(0.0001, scale);
  POSITION.set(part.position[0], part.position[1] - (part.size[1] / 2) * (1 - s), part.position[2]);
  SCALE.set(part.size[0] * s, part.size[1] * s, part.size[2] * s);
  target.compose(POSITION, QUAT.identity(), SCALE);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}