import { Check, Dices } from 'lucide-react';
import { useEffect, useState } from 'react';
import { randomSeed } from '@/lib/rng';
import { useSceneStore } from '@/store/sceneStore';
import { Button, Section, Slider } from './ui/Controls';

const PARAM_DEFS = [
  { key: 'height', label: 'Height' },
  { key: 'density', label: 'Density' },
  { key: 'symmetry', label: 'Symmetry' },
  { key: 'complexity', label: 'Complexity' },
] as const;

export function GeometryControls() {
  const params = useSceneStore((s) => s.params);
  const seed = useSceneStore((s) => s.seed);
  const setParams = useSceneStore((s) => s.setParams);
  const generate = useSceneStore((s) => s.generate);

  const [draft, setDraft] = useState(seed);
  useEffect(() => setDraft(seed), [seed]);
  const dirty = draft.trim().length > 0 && draft.trim() !== seed;

  const applySeed = (value: string) => {
    const next = value.trim().toUpperCase().slice(0, 16);
    if (!next || next === seed) {
      setDraft(seed);
      return;
    }
    generate({ seed: next });
  };

  return (
    <Section title="Geometry" index="02">
      {PARAM_DEFS.map((def) => (
        <Slider
          key={def.key}
          label={def.label}
          value={params[def.key]}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => setParams({ [def.key]: value })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      ))}

      <div className="mono" style={{ color: 'var(--text-ghost)', marginBottom: 5 }}>
        Random seed
      </div>
      <div className="row">
        <input
          className="text-input"
          value={draft}
          spellCheck={false}
          maxLength={16}
          aria-label="Random seed"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => applySeed(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              applySeed(draft);
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              setDraft(seed);
              event.currentTarget.blur();
            }
          }}
        />
        <Button size="sm" variant={dirty ? 'accent' : 'ghost'} disabled={!dirty} onClick={() => applySeed(draft)} aria-label="Apply seed">
          <Check size={12} strokeWidth={1.5} />
        </Button>
        <Button size="sm" variant="ghost" icon={<Dices size={12} strokeWidth={1.5} />} onClick={() => generate({ seed: randomSeed() })} aria-label="Draw a new seed">
          <span className="btn__label">New</span>
        </Button>
      </div>
      <p className="caption">Same seed · same composition. Generate draws a new one.</p>
    </Section>
  );
}