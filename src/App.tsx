import { useEffect, useMemo } from 'react';
import { BottomBar } from './components/BottomBar';
import { IntroGate } from './components/IntroGate';
import { RightPanel } from './components/RightPanel';
import { SidePanel } from './components/SidePanel';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { useProjectIO } from './components/ExportManager';
import { useHotkeys } from './hooks/useHotkeys';
import { usePrefersReducedMotion } from './hooks/useMediaQuery';
import { SceneCanvas } from './three/SceneCanvas';
import { cameraApi } from './three/cameraApi';
import { useLookStore } from './store/lookStore';
import { useSceneStore } from './store/sceneStore';
import { useUiStore } from './store/uiStore';
import type { ObjectKind } from './types/scene';

export function App() {
  const { saveJson, openFile, requestExport } = useProjectIO();
  const setReducedMotion = useUiStore((s) => s.setReducedMotion);
  const reducedMotion = usePrefersReducedMotion();
  const accentColor = useLookStore((s) => s.accentColor);
  const sceneReady = useUiStore((s) => s.sceneReady);

  useEffect(() => setReducedMotion(reducedMotion), [reducedMotion, setReducedMotion]);

  // The accent is a single decision: it tints the light, the selection and the interface.
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor);
  }, [accentColor]);

  const hotkeys = useMemo(
    () => ({
      generate: () => useSceneStore.getState().generate(),
      reset: () => useSceneStore.getState().reset(),
      exportPng: () => requestExport(),
      saveJson,
      openFile,
      focusCamera: () => cameraApi.current?.focus(),
      addObject: (kind: ObjectKind) => useSceneStore.getState().addObject(kind),
    }),
    [requestExport, saveJson, openFile],
  );

  // Guarded: the studio keys must not fire behind the title sequence.
  const phase = useUiStore((s) => s.phase);
  const guarded = useMemo(() => {
    if (phase === 'studio') return hotkeys;
    return {
      generate: () => {},
      reset: () => {},
      exportPng: () => {},
      saveJson: () => {},
      openFile: () => {},
      focusCamera: () => {},
      addObject: () => {},
    };
  }, [hotkeys, phase]);

  useHotkeys(guarded);

  // The chrome is withheld until the studio is entered: the title sequence owns the screen.
  const inStudio = phase === 'studio';

  return (
    <main className={`app${inStudio ? '' : ' app--intro'}`}>
      {inStudio && <TopBar />}
      {inStudio && <SidePanel />}
      <div className="canvas-region" data-scene-ready={sceneReady ? 'true' : 'false'}>
        <SceneCanvas />
      </div>
      {inStudio && <RightPanel />}
      {inStudio && <BottomBar />}
      <IntroGate />
      {inStudio && <Toasts />}
      <StatusLine />
    </main>
  );
}

/** Screen reader announcements for actions that have no visible focus target. */
function StatusLine() {
  const status = useUiStore((s) => s.status);
  const count = useSceneStore((s) => s.objects.length);
  const selection = useSceneStore((s) => s.selection);

  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => useUiStore.getState().setStatus(''), 4000);
    return () => window.clearTimeout(timer);
  }, [status, count, selection]);

  return (
    <p aria-live="polite" role="status" className="visually-hidden">
      {status}
    </p>
  );
}