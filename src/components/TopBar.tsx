import { Download, FolderOpen, PanelRight, PanelLeft, RotateCcw, Sparkles, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useProjectIO } from './ExportManager';
import { Button } from './ui/Controls';
import { useSceneStore } from '@/store/sceneStore';
import { useUiStore } from '@/store/uiStore';

export function TopBar() {
  const name = useSceneStore((s) => s.name);
  const seed = useSceneStore((s) => s.seed);
  const rename = useSceneStore((s) => s.rename);
  const generate = useSceneStore((s) => s.generate);
  const reset = useSceneStore((s) => s.reset);

  const leftOpen = useUiStore((s) => s.leftPanelOpen);
  const rightOpen = useUiStore((s) => s.rightPanelOpen);
  const toggleLeft = useUiStore((s) => s.toggleLeftPanel);
  const toggleRight = useUiStore((s) => s.toggleRightPanel);

  const { saveJson, openFile, onFile, fileInput, requestExport } = useProjectIO();
  const [draft, setDraft] = useState(name);

  useEffect(() => setDraft(name), [name]);

  const commitName = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(name);
      return;
    }
    rename(trimmed);
    setDraft(trimmed);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true" />
        <span className="brand__name">AFTERFORM</span>
        <span className="brand__tag mono">Architecture beyond reality</span>
      </div>

      <span className="topbar__divider" aria-hidden="true" />

      <div className="composition">
        <label className="visually-hidden" htmlFor="composition-name">
          Composition name
        </label>
        <input
          id="composition-name"
          className="composition__name"
          value={draft}
          spellCheck={false}
          maxLength={64}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDraft(name);
              event.currentTarget.blur();
            }
          }}
        />
        <span className="composition__seed mono">Seed {seed}</span>
      </div>

      <div className="topbar__actions">
        <span className="topbar__toggles">
          <Button icon={<PanelLeft size={13} strokeWidth={1.5} />} active={leftOpen} onClick={toggleLeft} aria-label="Toggle construction tools" title="Toggle construction tools" />
          <Button icon={<PanelRight size={13} strokeWidth={1.5} />} active={rightOpen} onClick={toggleRight} aria-label="Toggle inspector" title="Toggle inspector" />
        </span>

        <span className="topbar__divider" aria-hidden="true" />

        <Button variant="accent" icon={<Sparkles size={13} strokeWidth={1.5} />} onClick={() => generate()} shortcut="G">
          Generate
        </Button>
        <Button icon={<RotateCcw size={13} strokeWidth={1.5} />} onClick={reset} shortcut="R">
          Reset
        </Button>

        <span className="topbar__divider" aria-hidden="true" />

        <Button icon={<Download size={13} strokeWidth={1.5} />} onClick={requestExport} shortcut="P">
          Export PNG
        </Button>
        <Button icon={<Upload size={13} strokeWidth={1.5} />} onClick={saveJson} shortcut="⌘S">
          Save JSON
        </Button>
        <Button icon={<FolderOpen size={13} strokeWidth={1.5} />} onClick={openFile} shortcut="O">
          Load JSON
        </Button>
        <input ref={fileInput} type="file" accept="application/json,.json" onChange={onFile} className="visually-hidden" tabIndex={-1} aria-hidden="true" />
      </div>
    </header>
  );
}