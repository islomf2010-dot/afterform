import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Color } from 'three';
import type { FogExp2, Scene } from 'three';
import { LIGHTING_MODES } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { useUiStore } from '@/store/uiStore';

const TRANSITION = 0.45;

/**
 * Smooths fog, exposure and environment intensity between lighting modes. Without this,
 * switching Day → Night is a hard cut; with it the scene reads as one continuous space.
 * Background is deliberately not touched here — the gradient dome owns it.
 */
export function AtmosphereRig() {
  const lighting = useLookStore((s) => s.lighting);
  const fogDensity = useLookStore((s) => s.fogDensity);
  const quality = useLookStore((s) => s.quality);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = useUiStore((s) => s.reducedMotion);

  const mode = LIGHTING_MODES[lighting];
  const fogBase = quality === 'lite' ? 0.7 : 1;

  const target = useRef({
    fog: new Color(mode.fogColor),
    density: mode.fogScale * fogDensity * fogBase,
    exposure: mode.exposure,
    environment: mode.envIntensity,
  });
  const current = useRef({ ...target.current });

  useEffect(() => {
    target.current.fog.set(mode.fogColor);
    target.current.density = mode.fogScale * fogDensity * fogBase;
    target.current.exposure = mode.exposure;
    target.current.environment = mode.envIntensity;
    if (reducedMotion) snap();
    else invalidate();
  }, [mode.fogColor, mode.fogScale, mode.exposure, mode.envIntensity, fogDensity, fogBase, reducedMotion, invalidate]);

  const snap = () => {
    current.current.fog.copy(target.current.fog);
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
      Math.abs(now.density - goal.density) < 1e-5 &&
      Math.abs(now.exposure - goal.exposure) < 1e-4 &&
      Math.abs(now.environment - goal.environment) < 1e-4;

    if (settled) return;

    now.fog.lerp(goal.fog, step);
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
  gl.toneMappingExposure = values.exposure;
  // How strongly the lightformer cube map lights the materials — per lighting mode.
  scene.environmentIntensity = values.environment;
}