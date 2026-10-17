import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MATERIAL_PRESETS, LIGHTING_MODES } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { useSceneStore } from '@/store/sceneStore';
import { useUiStore } from '@/store/uiStore';
import { AtmosphereRig } from './AtmosphereRig';
import { CameraRig } from './CameraRig';
import { EnvironmentRig } from './EnvironmentRig';
import { ExportBridge } from './ExportBridge';
import { GroundRig } from './GroundRig';
import { LightingRig } from './LightingRig';
import { ContactShadowRig } from './ContactShadowRig';
import { SelectionMarker } from './SelectionMarker';
import { SkyDome } from './SkyDome';
import { StructureField } from './StructureField';

/**
 * Composition of the scene. Each rig owns one concern so a change in one never re-renders another.
 */
export function ArchitectureScene() {
  const objects = useSceneStore((s) => s.objects);
  const material = useLookStore((s) => s.material);
  const lighting = useLookStore((s) => s.lighting);

  return (
    <>
      {/* The gradient dome is the visible background; fog only carries depth. */}
      <fogExp2 attach="fog" args={[LIGHTING_MODES[lighting].fogColor, 0.01]} />

      <SkyDome />
      <AtmosphereRig />
      <EnvironmentRig />
      <LightingRig />
      <GroundRig />
      <ContactShadowRig />
      <StructureField objects={objects} preset={MATERIAL_PRESETS[material]} />
      <SelectionMarker />
      <CameraRig />
      <ExportBridge />
      <InvalidateOnChange />
      <SceneReadySignal />
    </>
  );
}

/**
 * Flags the first drawn frame on the canvas wrapper. The renderer runs on demand, so this is
 * the only honest "the scene is on screen" signal — and what the end-to-end suite waits for.
 */
function SceneReadySignal() {
  const setSceneReady = useUiStore((s) => s.setSceneReady);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    setSceneReady(true);
  });
  return null;
}

/**
 * R3F runs on demand: nothing renders until something asks for a frame. Every source of visual
 * change funnels through here so the scene never shows a stale image.
 */
function InvalidateOnChange() {
  const invalidate = useThree((s) => s.invalidate);
  const revision = useSceneStore((s) => s.revision);
  const selection = useSceneStore((s) => s.selection);
  const material = useLookStore((s) => s.material);
  const lighting = useLookStore((s) => s.lighting);
  const keyIntensity = useLookStore((s) => s.keyIntensity);
  const accentColor = useLookStore((s) => s.accentColor);
  const fogDensity = useLookStore((s) => s.fogDensity);
  const gridVisible = useLookStore((s) => s.gridVisible);
  const quality = useLookStore((s) => s.quality);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
    }
    invalidate();
  }, [invalidate, revision, selection, material, lighting, keyIntensity, accentColor, fogDensity, gridVisible, quality]);

  return null;
}