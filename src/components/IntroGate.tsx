import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useUiStore } from '@/store/uiStore';
import type { Phase } from '@/store/uiStore';

const STORAGE_KEY = 'afterform.intro.seen';

/** The intro shows once per browsing session; ENTER, Escape, Space or a click always skips it. */
function seenThisSession(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private mode: no storage, no gate. The studio is the product.
    return true;
  }
}

/**
 * Title sequence.
 *
 * The studio renders underneath the whole time, so entering is a cross-fade over a composition
 * that is already there — no second scene, no second canvas, nothing to load.
 */
export function IntroGate() {
  const phase = useUiStore((s) => s.phase);
  const setPhase = useUiStore((s) => s.setPhase);
  const setStatus = useUiStore((s) => s.setStatus);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (seenThisSession()) return;
    // Wait for the first rendered frame so the title fades over a real image.
    const timer = window.setTimeout(() => {
      setPhase('intro');
      setStatus('AFTERFORM. Architecture beyond reality. Press Enter to enter the studio.');
      setArmed(true);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [setPhase, setStatus]);

  const enter = () => {
    if (useUiStore.getState().phase !== 'intro') return;
    setPhase('leaving');
    try {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* nothing to remember: fine */
    }
    setStatus('Studio ready. Press G to generate a new composition.');
    window.setTimeout(() => setPhase('studio'), 820);
  };

  useEffect(() => {
    if (!armed || phase !== 'intro') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Escape' && event.key !== ' ') return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      event.preventDefault();
      enter();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armed, phase]);

  if (phase !== 'intro' && phase !== 'leaving') return null;

  return (
    <div className={`intro${phase === 'leaving' ? ' intro--leaving' : ''}`} onClick={enter} role="dialog" aria-modal="true" aria-label="AFTERFORM — Architecture beyond reality">
      <div className="intro__veil" aria-hidden="true" />
      <div className="intro__body">
        <p className="intro__eyebrow mono">Generative Architecture Laboratory</p>
        <h1 className="intro__title">
          <span className="intro__title-mark" aria-hidden="true" />
          AFTERFORM
        </h1>
        <p className="intro__tagline">Architecture beyond reality.</p>
        <button type="button" className="intro__enter" onClick={enter}>
          <span>Enter Studio</span>
          <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <p className="intro__hint mono">Enter · Escape · click anywhere</p>
      </div>
      <div className="intro__meta mono" aria-hidden="true">
        <span>Seeded compositions</span>
        <span>Instanced rendering</span>
        <span>Real-time WebGL</span>
      </div>
    </div>
  );
}

export type { Phase };