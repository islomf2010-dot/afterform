import { create } from 'zustand';
import { defaultLook } from '@/lib/projectFile';
import type { LightingModeId, LookState, MaterialPresetId, QualityMode } from '@/types/scene';

interface LookStore extends LookState {
  setMaterial: (material: MaterialPresetId) => void;
  setLighting: (lighting: LightingModeId) => void;
  setKeyIntensity: (value: number) => void;
  setAccentColor: (value: string) => void;
  setFogDensity: (value: number) => void;
  toggleGrid: () => void;
  setQuality: (quality: QualityMode) => void;
  applyLook: (look: LookState) => void;
}

export const useLookStore = create<LookStore>()((set) => ({
  ...defaultLook(),
  setMaterial: (material) => set({ material }),
  setLighting: (lighting) => set({ lighting }),
  setKeyIntensity: (keyIntensity) => set({ keyIntensity }),
  setAccentColor: (accentColor) => set({ accentColor }),
  setFogDensity: (fogDensity) => set({ fogDensity }),
  toggleGrid: () => set((state) => ({ gridVisible: !state.gridVisible })),
  setQuality: (quality) => set({ quality }),
  applyLook: (look) => set({ ...look }),
}));

/** Current look, without the actions — used by the export pipeline. */
export function currentLook(): LookState {
  const { material, lighting, keyIntensity, accentColor, fogDensity, gridVisible, quality } = useLookStore.getState();
  return { material, lighting, keyIntensity, accentColor, fogDensity, gridVisible, quality };
}