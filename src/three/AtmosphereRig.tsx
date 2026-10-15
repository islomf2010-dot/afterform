import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Color } from 'three';
import type { FogExp2, Scene } from 'three';
import { LIGHTING_MODES } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { useUiStore } from '@/store/uiStore';

const TRANSITION = 0.45;

/**
 * Smooths fog, background and exposure between lighting modes. Without this, switching
 * Day → Night is a hard cut; with it the scene reads as one continuous space.
 */
export function AtmosphereRig() {
  const lighting = useLookStore((s) => s.lighting);
  const fogDensity = useLookStore((s) => s.fogDensity);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useUiStore((s) => s.reducedMotion);

  const mode = LIGHTING_MODES[lighting];
  const target = useRef({
    fog: new Color(mode.fogColor),
    background: new Color(mode.background),
    density: mode.fogScale * fogDensity,
    exposure: mode.exposure,
    environment: mode.envIntensity,
  });
  const current = useRef({ ...target.current });

  useEffect(() => {
    target.current.fog.set(mode.fogColor);
    target.current.background.set(mode.background);
    target.current.density = mode.fogScale * fogDensity;
    target.current.exposure = mode.exposure;
    target.current.environment = mode.envIntensity;
    if (reducedMotion) snap();
    else invalidate();
  }, [mode.fogColor, mode.background, mode.fogScale, mode.exposure, mode.envIntensity, fogDensity, reducedMotion, invalidate]);

  const snap = () => {
    current.current.fog.copy(target.current.fog);
    current.current.background.copy(target.current.background);
    current.current.density = target.current.density;
    current.current.exposure = target.current.exposure;
    current.current.environment = target.current.environment;
    write(scene, gl, current.current);
    invalidate();
  };

  useFrame((_, delta) => {
    const step = Math.min(1, delta / TRANSITION);
    const now = current.current;
    const goal = target.current;
    const settled =
      now.fog.equals(goal.fog) &&
      now.background.equals(goal.background) &&
      Math.abs(now.density - goal.density) < 1e-5 &&
      Math.abs(now.exposure - goal.exposure) < 1e-4 &&
      Math.abs(now.environment - goal.environment) < 1e-4;

    if (settled) return;

    now.fog.lerp(goal.fog, step);
    now.background.lerp(goal.background, step);
    now.density += (goal.density - now.density) * step;
    now.exposure += (goal.exposure - now.exposure) * step;
    now.environment += (goal.environment - now.environment) * step;
    write(scene, gl, now);
    invalidate();
  });

  return null;
}

interface AtmosphereValues {
  fog: Color;
  background: Color;
  density: number;
  exposure: number;
  environment: number;
}

function write(scene: Scene, gl: { toneMappingExposure: number }, values: AtmosphereValues): void {
  const fog = scene.fog as FogExp2 | null;
  if (fog) {
    fog.color.copy(values.fog);
    fog.density = values.density;
  }
  if (scene.background instanceof Color) scene.background.copy(values.background);
  gl.toneMappingExposure = values.exposure;
  // How strongly the lightformer cube map lights the materials — per lighting mode.
  scene.environmentIntensity = values.environment;
}