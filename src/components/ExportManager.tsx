import { useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { parseProjectFile, serialiseProjectFile } from '@/lib/projectFile';
import { useLookStore } from '@/store/lookStore';
import { toComposition, useSceneStore } from '@/store/sceneStore';
import { useUiStore } from '@/store/uiStore';
import { downloadText } from '@/three/ExportBridge';

/**
 * Everything that leaves the app: JSON compositions, JSON files coming back in, and the
 * request that asks the canvas for a PNG frame.
 */
export function useProjectIO() {
  const notify = useUiStore((s) => s.notify);
  const requestExport = useUiStore((s) => s.requestExport);
  const fileInput = useRef<HTMLInputElement>(null);

  const saveJson = useCallback(() => {
    const state = useSceneStore.getState();
    const composition = toComposition(state);
    const payload = serialiseProjectFile(composition, useLookStore.getState());
    const slug = composition.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'composition';
    try {
      downloadText(payload, `afterform-${slug}.json`);
      notify(`Saved ${composition.objects.length} elements · ${slug}.json`, 'success');
    } catch (error) {
      notify(`Could not save file · ${message(error)}`, 'error');
    }
  }, [notify]);

  const onFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset immediately so picking the same file twice still fires a change event.
      event.target.value = '';
      if (!file) return;

      try {
        const text = await file.text();
        const result = parseProjectFile(text);
        if (!result.ok) {
          notify(`Import failed · ${result.error}`, 'error');
          return;
        }

        useSceneStore.getState().replaceComposition(result.file.composition);
        useLookStore.getState().applyLook(result.file.look);

        const count = result.file.composition.objects.length;
        notify(result.warnings.length > 0 ? `Imported · ${result.warnings[0]}` : `Imported ${count} elements · ${result.file.composition.name}`, result.warnings.length > 0 ? 'info' : 'success');
      } catch (error) {
        notify(`Import failed · ${message(error)}`, 'error');
      }
    },
    [notify],
  );

  return {
    saveJson,
    openFile: () => fileInput.current?.click(),
    onFile,
    fileInput,
    requestExport,
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'unexpected error';
}