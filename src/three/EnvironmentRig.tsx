import { Environment, Lightformer } from '@react-three/drei';
import { useMemo } from 'react';
import { QUALITY_PROFILES } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import type { LightingMode } from '@/lib/presets';

/**
 * Procedural environment: lightformers rendered into a small cube map once per lighting mode.
 * No HDR downloads, no external assets — it also means the reflections work offline.
 */
export function EnvironmentRig() {
  const lighting = useLookStore((s) => s.lighting);
  const quality = useLookStore((s) => s.quality);
  const profile = QUALITY_PROFILES[quality];

  const config = useMemo(() => buildLightformers(lighting), [lighting]);

  return (
    <Environment key={`${lighting}-${quality}`} resolution={profile.environmentResolution} frames={profile.environmentFrames} background={false}>
      {config.map((form, index) => (
        <Lightformer key={index} {...form.props} />
      ))}
    </Environment>
  );
}

type FormProps = React.ComponentProps<typeof Lightformer>;

function buildLightformers(lighting: 'day' | 'dusk' | 'night'): { props: FormProps }[] {
  const mode = LIGHTING_COLORS[lighting];

  return [
    // Overhead source — the dominant light in the image.
    { props: { form: 'rect' as const, intensity: mode.topIntensity, color: mode.top, position: [0, 12, 0] as [number, number, number], rotation: [Math.PI / 2, 0, 0] as [number, number, number], scale: [26, 26, 1] as [number, number, 1] } },
    // Warm/cool source on the key side.
    { props: { form: 'rect' as const, intensity: mode.sideIntensity, color: mode.side, position: [9, 5, 7] as [number, number, number], rotation: [0, -Math.PI / 3.1, 0] as [number, number, number], scale: [14, 9, 1] as [number, number, 1] } },
    // Cool bounce from the opposite side keeps the shadow side from going dead.
    { props: { form: 'rect' as const, intensity: mode.fillIntensity, color: mode.fill, position: [-10, 4, -6] as [number, number, number], rotation: [0, Math.PI / 2.6, 0] as [number, number, number], scale: [14, 10, 1] as [number, number, 1] } },
    // Dark card: gives glass and stone something to reflect.
    { props: { form: 'rect' as const, intensity: 0.35, color: '#101215', position: [0, 2, -14] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [30, 14, 1] as [number, number, 1] } },
  ];
}

const LIGHTING_COLORS: Record<LightingMode['id'], { top: string; topIntensity: number; side: string; sideIntensity: number; fill: string; fillIntensity: number }> = {
  day: { top: '#ffffff', topIntensity: 2.4, side: '#fff3e0', sideIntensity: 2.2, fill: '#d8e6f5', fillIntensity: 1.5 },
  dusk: { top: '#ffd9b0', topIntensity: 1.5, side: '#ff9a52', sideIntensity: 2.6, fill: '#5c7ea8', fillIntensity: 1.1 },
  night: { top: '#9fb8d6', topIntensity: 0.55, side: '#7f9fc4', sideIntensity: 0.7, fill: '#2f4055', fillIntensity: 0.6 },
};