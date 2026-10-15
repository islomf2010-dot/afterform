import { EnvironmentControls } from './EnvironmentControls';
import { GeometryControls } from './GeometryControls';
import { LightingControls } from './LightingControls';
import { MaterialControls } from './MaterialControls';
import { ObjectEditor } from './ObjectEditor';
import { useSceneStore } from '@/store/sceneStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Inspector column. The element editor only takes space when something is selected, so the
 * look controls keep their position.
 */
export function RightPanel() {
  const selection = useSceneStore((s) => s.selection);
  const open = useUiStore((s) => s.rightPanelOpen);

  return (
    <aside className="panel panel--right" aria-label="Inspector" hidden={!open}>
      {selection && <ObjectEditor />}
      <GeometryControls />
      <MaterialControls />
      <LightingControls />
      <EnvironmentControls />
    </aside>
  );
}