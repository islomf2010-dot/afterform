import { useEffect } from 'react';
import { useSceneStore } from '@/store/sceneStore';

/** Arrow keys nudge the selection; Shift makes the step coarse. */
const NUDGE = 0.25;
const NUDGE_COARSE = 1;

const AXIS_STEP: Record<string, [number, number, number]> = {
  ArrowLeft: [-1, 0, 0],
  ArrowRight: [1, 0, 0],
  ArrowUp: [0, 0, -1],
  ArrowDown: [0, 0, 1],
};

export interface HotkeyHandlers {
  generate: () => void;
  reset: () => void;
  exportPng: () => void;
  saveJson: () => void;
  openFile: () => void;
  focusCamera: () => void;
  addObject: (kind: 'block' | 'column' | 'slab' | 'frame') => void;
}

/**
 * Global shortcuts. Anything typed inside a field is left alone — an editor where the keyboard
 * hijacks the caret is an editor nobody trusts.
 */
export function useHotkeys(handlers: HotkeyHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;

      const store = useSceneStore.getState();
      const meta = event.metaKey || event.ctrlKey;
      const step = event.shiftKey ? NUDGE_COARSE : NUDGE;
      const axis = AXIS_STEP[event.key];

      if (meta) {
        switch (event.key.toLowerCase()) {
          case 'z':
            event.preventDefault();
            if (event.shiftKey) store.redo();
            else store.undo();
            return;
          case 'y':
            event.preventDefault();
            store.redo();
            return;
          case 's':
            event.preventDefault();
            handlers.saveJson();
            return;
          case 'o':
            event.preventDefault();
            handlers.openFile();
            return;
          default:
            return;
        }
      }

      if (axis && store.selection) {
        event.preventDefault();
        const object = store.objects.find((o) => o.id === store.selection);
        if (!object) return;
        store.updateObject(object.id, {
          position: [
            object.position[0] + axis[0] * step,
            object.position[1] + axis[1] * step,
            object.position[2] + axis[2] * step,
          ],
        });
        return;
      }

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          if (store.selection) {
            event.preventDefault();
            store.deleteSelected();
          }
          return;
        case 'Escape':
          store.select(null);
          return;
        case 'PageUp':
          if (store.selection) {
            event.preventDefault();
            nudgeY(store.selection, step);
          }
          return;
        case 'PageDown':
          if (store.selection) {
            event.preventDefault();
            nudgeY(store.selection, -step);
          }
          return;
        default:
          break;
      }

      switch (event.key.toLowerCase()) {
        case 'g':
          handlers.generate();
          break;
        case 'r':
          handlers.reset();
          break;
        case 'p':
          handlers.exportPng();
          break;
        case 'f':
          handlers.focusCamera();
          break;
        case 'b':
          handlers.addObject('block');
          break;
        case 'c':
          handlers.addObject('column');
          break;
        case 'l':
          handlers.addObject('slab');
          break;
        case 'm':
          handlers.addObject('frame');
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}

function nudgeY(id: string, delta: number): void {
  const store = useSceneStore.getState();
  const object = store.objects.find((o) => o.id === id);
  if (!object) return;
  store.updateObject(id, { position: [object.position[0], object.position[1] + delta, object.position[2]] });
}