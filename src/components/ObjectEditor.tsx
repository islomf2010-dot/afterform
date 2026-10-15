import { Box, Columns3, Frame, Layers, RotateCcw, Trash2 } from 'lucide-react';
import { useSceneStore } from '@/store/sceneStore';
import { Button, NumberField, Section } from './ui/Controls';
import { KIND_LABEL } from '@/lib/presets';
import type { ObjectKind } from '@/types/scene';

const KIND_ICONS: Record<ObjectKind, typeof Box> = {
  block: Box,
  column: Columns3,
  slab: Layers,
  frame: Frame,
};

/**
 * Inspector for the selected element: position, size and kind.
 * Every field writes straight into the scene, so the viewport is always the source of truth.
 */
export function ObjectEditor() {
  const selection = useSceneStore((s) => s.selection);
  const objects = useSceneStore((s) => s.objects);
  const updateObject = useSceneStore((s) => s.updateObject);
  const deleteSelected = useSceneStore((s) => s.deleteSelected);

  const object = objects.find((o) => o.id === selection) ?? null;
  if (!object) return null;

  const Icon = KIND_ICONS[object.kind];

  return (
    <Section
      title="Element"
      index="01"
      action={
        <span className="mono" style={{ color: 'var(--accent)' }}>
          {object.id.slice(-6).toUpperCase()}
        </span>
      }
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="mono" style={{ color: 'var(--text-dim)', flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon size={13} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
          {KIND_LABEL[object.kind]}
        </span>
        <Button size="sm" variant="ghost" icon={<RotateCcw size={12} strokeWidth={1.5} />} onClick={() => updateObject(object.id, { kind: object.kind })}>
          Reset
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 size={12} strokeWidth={1.5} />} onClick={deleteSelected} aria-label="Delete selected element" />
      </div>

      <div className="mono" style={{ color: 'var(--text-ghost)', marginBottom: 5 }}>
        Position
      </div>
      <div className="vec" style={{ marginBottom: 12 }}>
        <NumberField label="X" value={object.position[0]} step={0.1} onCommit={(v) => updateObject(object.id, { position: [v, object.position[1], object.position[2]] })} />
        <NumberField label="Y" value={object.position[1]} step={0.1} onCommit={(v) => updateObject(object.id, { position: [object.position[0], v, object.position[2]] })} />
        <NumberField label="Z" value={object.position[2]} step={0.1} onCommit={(v) => updateObject(object.id, { position: [object.position[0], object.position[1], v] })} />
      </div>

      <div className="mono" style={{ color: 'var(--text-ghost)', marginBottom: 5 }}>
        Size
      </div>
      <div className="vec">
        <NumberField label="W" value={object.size[0]} step={0.1} min={0.08} onCommit={(v) => updateObject(object.id, { size: [v, object.size[1], object.size[2]] })} />
        <NumberField label="H" value={object.size[1]} step={0.1} min={0.08} onCommit={(v) => updateObject(object.id, { size: [object.size[0], v, object.size[2]] })} />
        <NumberField label="D" value={object.size[2]} step={0.1} min={0.08} onCommit={(v) => updateObject(object.id, { size: [object.size[0], object.size[1], v] })} />
      </div>
    </Section>
  );
}