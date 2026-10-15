import type { CameraApi } from './CameraRig';

/**
 * Shared handle to the camera rig.
 * The rig lives inside the canvas; hotkeys and buttons outside it need a way to reach it.
 */
export const cameraApi: { current: CameraApi | null } = { current: null };