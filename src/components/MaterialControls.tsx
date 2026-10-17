import { MATERIAL_ORDER, MATERIAL_PRESETS } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { Section, Segmented } from './ui/Controls';

export function MaterialControls() {
  const material = useLookStore((s) => s.material);
  const setMaterial = useLookStore((s) => s.setMaterial);

  return (
    <Section title="Materials" index="03">
      <Segmented
        ariaLabel="Material preset"
        value={material}
        onChange={setMaterial}
        options={MATERIAL_ORDER.map((id) => ({
          value: id,
          label: MATERIAL_PRESETS[id].name,
          note: MATERIAL_PRESETS[id].note,
          swatch: MATERIAL_PRESETS[id].tones.mass.color,
        }))}
      />
    </Section>
  );
}