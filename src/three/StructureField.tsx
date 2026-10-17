import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  EdgesGeometry,
  Euler,
  FrontSide,
  InstancedMesh,
  Matrix4,
  Plane,
  Quaternion,
  Vector3,
} from 'three';
import { buildPartIndex } from '@/lib/parts';
import type { PartInstance } from '@/lib/parts';
import type { MaterialPreset, ToneMaterial } from '@/lib/presets';
import { useSceneStore } from '@/store/sceneStore';
import { useUiStore } from '@/store/uiStore';
import type { ArchObject, Tone } from '@/types/scene';
import { TONES } from '@/types/scene';
import { UNIT_BOX } from './geometry';

const UNIT_EDGES = new EdgesGeometry(UNIT_BOX);

const MATRIX = new Matrix4();
const QUAT = new Quaternion();
const EULER = new Euler();
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

interface ToneGroup {
  tone: Tone;
  /** Slice of `ordered` — one InstancedMesh, one entry point for picking. */
  start: number;
  count: number;
  mesh: InstancedMesh | null;
  progress: Float32Array;
  edges: BufferGeometry | null;
}

type DragHandlers = {
  onPointerDown: (event: ThreeEvent<PointerEvent>, objectId: string) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: () => void;
};

/**
 * Renders the composition as one InstancedMesh per material family.
 *
 * Three tones means three draw calls instead of one — still nothing — and it is what gives the
 * image its value structure: a dark base, light masses, and an accent catching the light.
 */
export function StructureField({ objects, preset }: Props) {
  // Parts are grouped by material family before anything else touches them: each group owns a
  // contiguous slice of this array, so picking and the edge overlay stay in step with rendering.
  const { ordered, groups } = useMemo(() => {
    const all = buildPartIndex(objects);
    const buckets = new Map<Tone, PartInstance[]>(TONES.map((tone) => [tone, []]));
    for (const part of all) buckets.get(part.tone)?.push(part);

    const ordered: PartInstance[] = [];
    const groups: ToneGroup[] = TONES.map((tone) => {
      const items = buckets.get(tone) ?? [];
      const start = ordered.length;
      ordered.push(...items);
      return { tone, start, count: items.length, mesh: null, progress: new Float32Array(1), edges: null };
    });
    return { ordered, groups };
  }, [objects]);

  const drag = useRef<DragState | null>(null);

  const select = useSceneStore((s) => s.select);
  const updateObject = useSceneStore((s) => s.updateObject);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;

  /* ---- entrance progress, one array per group --------------------- */

  useLayoutEffect(() => {
    for (const group of groups) {
      const progress = new Float32Array(Math.max(1, group.count));
      progress.fill(reducedMotion ? 1 : 0);
      group.progress = progress;
    }
  }, [groups, reducedMotion]);

  /* ---- write the instance matrices --------------------------------- */

  const writeMatrices = () => {
    for (const group of groups) {
      const mesh = group.mesh;
      if (!mesh) continue;
      for (let i = 0; i < group.count; i++) {
        const part = ordered[group.start + i];
        if (!part) continue;
        composePartMatrix(part, group.progress[i] ?? 1, MATRIX);
        mesh.setMatrixAt(i, MATRIX);
      }
      mesh.count = group.count;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  };

  useLayoutEffect(() => {
    for (const group of groups) {
      if (!group.mesh) continue;
      group.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    }
    writeMatrices();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, groups, reducedMotion]);

  useFrame((state) => {
    let animating = false;
    const elapsed = state.clock.elapsedTime;
    for (const group of groups) {
      for (let i = 0; i < group.count; i++) {
        if (group.progress[i] >= 1) continue;
        animating = true;
        group.progress[i] = easeOutCubic(clamp01((elapsed - (i % 28) * STAGGER) / ENTRANCE_DURATION));
      }
    }
    if (!animating) return;
    writeMatrices();
    invalidate();
  });

  /* ---- selection + dragging ---------------------------------------- */

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

  /* ---- edge overlay for transparent families ----------------------- */

  useEffect(() => {
    for (const group of groups) {
      const geometry = preset.tones[group.tone].transparent ? buildEdgeGeometry(ordered, group.start, group.count) : null;
      group.edges?.dispose();
      group.edges = geometry;
    }
    return () => {
      for (const group of groups) group.edges?.dispose();
    };
  }, [groups, ordered, preset]);

  const handlers: DragHandlers = { onPointerDown: beginDrag, onPointerMove: moveDrag, onPointerUp: endDrag };

  return (
    <group>
      {groups.map((group) => {
        const tone = preset.tones[group.tone];
        if (group.count === 0) return null;
        return (
          <group key={group.tone}>
            <instancedMesh
              ref={(mesh: InstancedMesh | null) => {
                // Assignment only: writing here would race the grouping effect on rebuilds.
                group.mesh = mesh;
              }}
              args={[UNIT_BOX, undefined, Math.max(1, group.count)]}
              castShadow={!tone.transparent}
              receiveShadow={!tone.transparent}
              frustumCulled={false}
              renderOrder={tone.transparent ? 2 : 0}
              onPointerDown={(event) => {
                if (event.instanceId === undefined) return;
                const part = ordered[group.start + event.instanceId];
                if (part) handlers.onPointerDown(event, part.objectId);
              }}
              onPointerMove={handlers.onPointerMove}
              onPointerUp={handlers.onPointerUp}
            >
              <meshPhysicalMaterial {...materialProps(tone)} />
            </instancedMesh>

            {group.edges && (
              <lineSegments geometry={group.edges} renderOrder={3} frustumCulled={false}>
                <lineBasicMaterial color={new Color(preset.edge)} transparent opacity={preset.edgeOpacity} depthWrite={false} />
              </lineSegments>
            )}
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function materialProps(tone: ToneMaterial) {
  return {
    color: tone.color,
    roughness: tone.roughness,
    metalness: tone.metalness,
    clearcoat: tone.clearcoat,
    clearcoatRoughness: tone.clearcoatRoughness,
    transparent: tone.transparent,
    opacity: tone.opacity,
    envMapIntensity: tone.envMapIntensity,
    depthWrite: !tone.transparent,
    side: FrontSide,
  };
}

/** Every box edge of every part in the group, in one buffer. */
function buildEdgeGeometry(parts: readonly PartInstance[], start: number, count: number): BufferGeometry {
  const source = UNIT_EDGES.getAttribute('position');
  const stride = source.count * 3;
  const available = Math.max(0, Math.min(count, parts.length - start));
  const positions = new Float32Array(available * stride);
  const local = new Matrix4();

  for (let p = 0; p < available; p++) {
    const part = parts[start + p];
    if (!part) continue;
    EULER.set(part.rotation[0], part.rotation[1], part.rotation[2]);
    local.compose(OFFSET.set(...part.position), QUAT.setFromEuler(EULER), SCALE.set(part.size[0], part.size[1], part.size[2]));
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
  EULER.set(part.rotation[0], part.rotation[1], part.rotation[2]);
  POSITION.set(part.position[0], part.position[1] - (part.size[1] / 2) * (1 - s), part.position[2]);
  SCALE.set(part.size[0] * s, part.size[1] * s, part.size[2] * s);
  target.compose(POSITION, QUAT.setFromEuler(EULER), SCALE);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}