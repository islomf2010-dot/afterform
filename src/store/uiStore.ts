import { create } from 'zustand';
import type { Tool } from '@/types/scene';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

export type Phase = 'intro' | 'leaving' | 'studio';

interface UiState {
  tool: Tool;
  /** Title sequence → cross-fade → studio. The chrome only appears in `studio`. */
  phase: Phase;
  setPhase: (phase: Phase) => void;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  /** Bumped to ask the canvas for a PNG; handled inside the render tree. */
  exportRequest: number;
  toasts: Toast[];
  status: string;
  reducedMotion: boolean;
  /** Set once the renderer has drawn its first frame. */
  sceneReady: boolean;
  setTool: (tool: Tool) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  requestExport: () => void;
  notify: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: number) => void;
  setStatus: (status: string) => void;
  setReducedMotion: (value: boolean) => void;
  setSceneReady: (value: boolean) => void;
}

let toastId = 0;

export const useUiStore = create<UiState>()((set, get) => ({
  tool: 'select',
  phase: 'studio',
  setPhase: (phase) => set({ phase }),
  leftPanelOpen: true,
  rightPanelOpen: true,
  exportRequest: 0,
  toasts: [],
  status: '',
  reducedMotion: false,
  sceneReady: false,
  setTool: (tool) => set({ tool }),
  toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  requestExport: () => set((state) => ({ exportRequest: state.exportRequest + 1 })),
  notify: (message, kind = 'info') => {
    const id = ++toastId;
    set((state) => ({ toasts: [...state.toasts.slice(-2), { id, message, kind }] }));
    const ttl = kind === 'error' ? 6000 : 3200;
    if (typeof window !== 'undefined') window.setTimeout(() => get().dismissToast(id), ttl);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  setStatus: (status) => set({ status }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
}));