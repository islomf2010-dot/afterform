import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BackSide, Color, ShaderMaterial } from 'three';
import { LIGHTING_MODES } from '@/lib/presets';
import { useLookStore } from '@/store/lookStore';
import { useUiStore } from '@/store/uiStore';

const VERTEX = /* glsl */ `
  varying float vHeight;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vHeight = world.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMiddle;
  uniform vec3 uBottom;
  uniform float uHeight;
  uniform float uFloor;
  varying float vHeight;

  void main() {
    float up = smoothstep(0.0, uHeight * 2.2, vHeight);
    float down = 1.0 - smoothstep(uFloor, uFloor + 3.0, vHeight);
    vec3 color = mix(uBottom, uMiddle, down);
    color = mix(color, uTop, up);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const TMP = new Color();

/**
 * A gradient dome instead of a flat clear colour.
 *
 * One extra draw call, and it is the difference between "scene on a background" and
 * "scene in air" — the horizon haze gives the composition somewhere to sit, and it costs
 * nothing on the integrated GPU.
 */
export function SkyDome() {
  const lighting = useLookStore((s) => s.lighting);
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const fogDensity = useLookStore((s) => s.fogDensity);

  const uniforms = useMemo(
    () => ({
      uTop: { value: new Color(LIGHTING_MODES[lighting].sky.top) },
      uMiddle: { value: new Color(LIGHTING_MODES[lighting].sky.middle) },
      uBottom: { value: new Color(LIGHTING_MODES[lighting].sky.bottom) },
      uHeight: { value: 40 },
      uFloor: { value: -0.6 },
    }),
    // Recreated only when the material is rebuilt; values are pushed through apply().
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms,
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    [uniforms],
  );

  const current = useRef({
    top: new Color(LIGHTING_MODES[lighting].sky.top),
    middle: new Color(LIGHTING_MODES[lighting].sky.middle),
    bottom: new Color(LIGHTING_MODES[lighting].sky.bottom),
    height: 40,
  });

  const mode = LIGHTING_MODES[lighting];
  // Heavier atmosphere pulls the gradient down; clearer air lifts it.
  const targetHeight = Math.max(22, 26 + fogDensity * 260);

  useFrame((_, delta) => {
    const now = current.current;
    const step = reducedMotion ? 1 : Math.min(1, delta / 0.5);
    now.top.lerp(TMP.set(mode.sky.top), step);
    now.middle.lerp(TMP.set(mode.sky.middle), step);
    now.bottom.lerp(TMP.set(mode.sky.bottom), step);
    now.height += (targetHeight - now.height) * step;

    uniforms.uTop.value.copy(now.top);
    uniforms.uMiddle.value.copy(now.middle);
    uniforms.uBottom.value.copy(now.bottom);
    uniforms.uHeight.value = now.height;
  });

  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false} scale={DOME_RADIUS}>
      <sphereGeometry args={[1, 24, 16]} />
    </mesh>
  );
}

/** Large enough to enclose the camera at the maximum orbit distance. */
const DOME_RADIUS: [number, number, number] = [200, 200, 200];