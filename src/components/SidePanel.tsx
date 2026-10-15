import { Box, Columns3, Frame, Layers, MousePointer2, Trash2, Undo2, Redo2 } from 'lucide-react';
import { Button } from './ui/Controls';
import { useSceneStore } from '@/store/sceneStore';
import { useUiStore } from '@/store/uiStore';
import type { ObjectKind } from '@/types/scene';

const ADD_ITEMS: { kind: ObjectKind; label: string; icon: typeof Box }[] = [
  { kind: 'block', label: 'Block', icon: Box },
  { kind: 'column', label: 'Column', icon: Columns3 },
  { kind: 'slab', label: 'Slab', icon: Layers },
  { kind: 'frame', label: 'Frame', icon: Frame },
];

/** Screen reader names: the visible labels alone are ambiguous next to the inspector. */
const ADD_LABEL: Record<ObjectKind, string> = {
  block: 'Add block',
  column: 'Add column',
  slab: 'Add slab',
  frame: 'Add frame',
};

export function SidePanel() {
  const setTool = useUiStore((s) => s.setTool);
  const addObject = useSceneStore((s) => s.addObject);
  const deleteSelected = useSceneStore((s) => s.deleteSelected);
  const selection = useSceneStore((s) => s.selection);
  const undo = useSceneStore((s) => s.undo);
  const redo = useSceneStore((s) => s.redo);
  const canUndo = useSceneStore((s) => s.past.length > 0);
  const canRedo = useSceneStore((s) => s.future.length > 0);
  const count = useSceneStore((s) => s.objects.length);
  const open = useUiStore((s) => s.leftPanelOpen);
  const select = useSceneStore((s) => s.select);

  return (
    <aside className="panel panel--left" aria-label="Construction tools" hidden={!open}>
      <div className="panel__group">
        <div className="panel__title mono">
          <span>Tool</span>
          <span>01</span>
        </div>
        <div className="stack">
          <Button
            block
            active
            aria-pressed
            icon={<MousePointer2 size={13} strokeWidth={1.5} />}
            onClick={() => setTool('select')}
            title="Select tool — click an element, drag to move it"
          >
            Select
          </Button>
          <div className="row">
            <Button block icon={<Undo2 size={13} strokeWidth={1.5} />} disabled={!canUndo} onClick={undo} shortcut="⌘Z">
              Undo
            </Button>
            <Button block icon={<Redo2 size={13} strokeWidth={1.5} />} disabled={!canRedo} onClick={redo} shortcut="⇧⌘Z">
              Redo
            </Button>
          </div>
        </div>
      </div>

      <div className="panel__group">
        <div className="panel__title mono">
          <span>Add element</span>
          <span>02</span>
        </div>
        <div className="stack stack--2">
          {ADD_ITEMS.map((item) => (
            <Button
              key={item.kind}
              block
              icon={<item.icon size={13} strokeWidth={1.5} />}
              onClick={() => addObject(item.kind)}
              aria-label={ADD_LABEL[item.kind]}
              title={ADD_LABEL[item.kind]}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="panel__group">
        <div className="panel__title mono">
          <span>Selection</span>
          <span>03</span>
        </div>
        <div className="stack">
          <Button
            block
            variant="danger"
            icon={<Trash2 size={13} strokeWidth={1.5} />}
            disabled={!selection}
            onClick={deleteSelected}
            shortcut="⌫"
          >
            Delete Selected
          </Button>
          <Button block variant="ghost" disabled={!selection} onClick={() => select(null)} shortcut="Esc">
            Deselect
          </Button>
          <p className="mono" style={{ color: 'var(--text-ghost)', lineHeight: 1.7, marginTop: 4 }}>
            {selection ? 'Selected · drag to move, shift-drag for height' : 'No selection · click an element'}
          </p>
        </div>
      </div>

      <div className="panel__group" style={{ marginTop: 'auto' }}>
        <div className="panel__title mono">
          <span>Elements</span>
          <span>{String(count).padStart(3, '0')}</span>
        </div>
      </div>
    </aside>
  );
}