import { PanelLeft, PanelRight } from 'lucide-react';
import { MATERIAL_PRESETS, LIGHTING_MODES } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { useSceneStore } from '@/store/sceneStore';
import { useUiStore } from '@/store/uiStore';
import { Button } from './ui/Controls';

export function BottomBar() {
  const count = useSceneStore((s) => s.objects.length);
  const selection = useSceneStore((s) => s.selection);
  const material = useLookStore((s) => s.material);
  const lighting = useLookStore((s) => s.lighting);
  const leftOpen = useUiStore((s) => s.leftPanelOpen);
  const rightOpen = useUiStore((s) => s.rightPanelOpen);
  const toggleLeft = useUiStore((s) => s.toggleLeftPanel);
  const toggleRight = useUiStore((s) => s.toggleRightPanel);

  return (
    <footer className="bottombar mono">
      {/* On a phone the top bar has no room for these, so the bottom bar takes them over. */}
      <span className="bottombar__toggles">
        <Button size="sm" variant="ghost" active={leftOpen} onClick={toggleLeft} aria-label="Toggle construction tools" title="Toggle construction tools">
          <PanelLeft size={13} strokeWidth={1.5} />
        </Button>
      </span>

      <span className="readout">
        <span>Objects</span>
        <span className="readout__value">{String(count).padStart(3, '0')}</span>
      </span>
      <span className="readout">
        <span>Material</span>
        <span className="readout__value">{MATERIAL_PRESETS[material].name}</span>
      </span>
      <span className="readout">
        <span>Light</span>
        <span className="readout__value">{LIGHTING_MODES[lighting].name}</span>
      </span>
      <span className="readout readout--selection">
        <span>Selected</span>
        <span className={`readout__value${selection ? ' readout__value--accent' : ''}`}>{selection ? selection.slice(-6).toUpperCase() : '—'}</span>
      </span>

      <span className="bottombar__toggles">
        <Button size="sm" variant="ghost" active={rightOpen} onClick={toggleRight} aria-label="Toggle inspector" title="Toggle inspector">
          <PanelRight size={13} strokeWidth={1.5} />
        </Button>
      </span>

      <div className="bottombar__hints">
        <span className="keyhint">
          <kbd>Drag</kbd> Orbit
        </span>
        <span className="keyhint">
          <kbd>Click</kbd> Select
        </span>
        <span className="keyhint">
          <kbd>Arrows</kbd> Nudge
        </span>
        <span className="keyhint">
          <kbd>PgUp</kbd> Height
        </span>
        <span className="keyhint">
          <kbd>F</kbd> Frame
        </span>
      </div>
    </footer>
  );
}