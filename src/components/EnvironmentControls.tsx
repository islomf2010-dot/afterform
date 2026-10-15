import { Grid3x3 } from 'lucide-react';
import { QUALITY_PROFILES } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { Button, Section, Segmented, Slider } from './ui/Controls';
import type { QualityMode } from '@/types/scene';

export function EnvironmentControls() {
  const fogDensity = useLookStore((s) => s.fogDensity);
  const setFogDensity = useLookStore((s) => s.setFogDensity);
  const accentColor = useLookStore((s) => s.accentColor);
  const setAccentColor = useLookStore((s) => s.setAccentColor);
  const gridVisible = useLookStore((s) => s.gridVisible);
  const toggleGrid = useLookStore((s) => s.toggleGrid);
  const quality = useLookStore((s) => s.quality);
  const setQuality = useLookStore((s) => s.setQuality);

  return (
    <Section title="Environment" index="05">
      <Slider label="Atmosphere" value={fogDensity} min={0} max={0.05} step={0.001} onChange={setFogDensity} format={(v) => v.toFixed(3)} />

      <div className="mono" style={{ color: 'var(--text-ghost)', marginBottom: 5 }}>
        Accent light
      </div>
      <div className="color-field" style={{ marginBottom: 14 }}>
        <input
          type="color"
          value={accentColor}
          onChange={(event) => setAccentColor(event.target.value)}
          aria-label="Accent light colour"
        />
        <input className="text-input" value={accentColor.toUpperCase()} onChange={(event) => setAccentColor(event.target.value)} aria-label="Accent hex value" spellCheck={false} />
      </div>

      <div className="mono" style={{ color: 'var(--text-ghost)', marginBottom: 5 }}>
        Quality
      </div>
      <Segmented
        ariaLabel="Rendering quality"
        compact
        value={quality}
        onChange={(next: QualityMode) => setQuality(next)}
        options={[
          { value: 'high' as QualityMode, label: 'High', note: `${QUALITY_PROFILES.high.maxObjects} max` },
          { value: 'lite' as QualityMode, label: 'Lite', note: `${QUALITY_PROFILES.lite.maxObjects} max` },
        ]}
      />

      <div className="row" style={{ marginTop: 10 }}>
        <Button
          block
          active={gridVisible}
          icon={<Grid3x3 size={12} strokeWidth={1.5} />}
          onClick={toggleGrid}
          aria-pressed={gridVisible}
        >
          Grid
        </Button>
      </div>
    </Section>
  );
}