import { LIGHTING_MODES, LIGHTING_ORDER } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { Section, Segmented, Slider } from './ui/Controls';

export function LightingControls() {
  const lighting = useLookStore((s) => s.lighting);
  const keyIntensity = useLookStore((s) => s.keyIntensity);
  const setLighting = useLookStore((s) => s.setLighting);
  const setKeyIntensity = useLookStore((s) => s.setKeyIntensity);

  return (
    <Section title="Lighting" index="04">
      <Segmented
        ariaLabel="Lighting mode"
        value={lighting}
        onChange={setLighting}
        options={LIGHTING_ORDER.map((id) => ({
          value: id,
          label: LIGHTING_MODES[id].name,
          note: LIGHTING_MODES[id].note,
          swatch: LIGHTING_MODES[id].key.color,
        }))}
      />
      <div style={{ marginTop: 14 }}>
        <Slider label="Key intensity" value={keyIntensity} min={0} max={2} step={0.01} onChange={setKeyIntensity} format={(v) => `${v.toFixed(2)}×`} />
      </div>
    </Section>
  );
}