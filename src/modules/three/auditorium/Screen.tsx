import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { AuditoriumConfig, SpatialGeometry } from '@/types';
import {
  createDefaultScreenTexture,
  loadScreenTexture,
  updateDefaultScreenTexture,
} from '@/modules/three/textures';

const DEG = Math.PI / 180;
const DEFAULT_SCREEN_VIDEO_URL = `${import.meta.env.BASE_URL}cinema-preview.mp4`;

interface ScreenProps {
  geometry: SpatialGeometry;
  config: AuditoriumConfig;
}

export function buildCurvedScreenGeometry(
  width: number,
  height: number,
  sag: number,
  segments = 40,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const halfWidth = width / 2;

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const x = (t - 0.5) * width;
    const normalised = x / Math.max(0.001, halfWidth);
    // The centre of the screen sits furthest back; the edges wrap toward the
    // audience. This preserves a readable projection surface for every seat.
    const z = sag * normalised * normalised;
    positions.push(x, height / 2, z);
    positions.push(x, -height / 2, z);
    uvs.push(t, 1, t, 0);
    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 2, base + 1, base + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function useScreenTexture(dataUrl?: string): THREE.Texture {
  const [texture, setTexture] = useState<THREE.Texture>(() => createDefaultScreenTexture());

  useEffect(() => {
    let cancelled = false;
    let loaded: THREE.Texture | null = null;
    let video: HTMLVideoElement | null = null;
    let videoTexture: THREE.VideoTexture | null = null;
    let fallback: THREE.CanvasTexture | null = null;

    if (!dataUrl) {
      video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = DEFAULT_SCREEN_VIDEO_URL;
      videoTexture = new THREE.VideoTexture(video);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.generateMipmaps = false;

      let resolved = false;
      const showVideo = () => {
        if (cancelled || resolved || !videoTexture) return;
        resolved = true;
        const nextVideoTexture = videoTexture;
        loaded = nextVideoTexture;
        setTexture((previous) => {
          previous.dispose();
          return nextVideoTexture;
        });
      };
      const showFallback = () => {
        if (cancelled || resolved) return;
        resolved = true;
        const nextFallback = createDefaultScreenTexture();
        fallback = nextFallback;
        setTexture((previous) => {
          previous.dispose();
          return nextFallback;
        });
      };

      video.addEventListener('canplay', showVideo);
      video.addEventListener('error', showFallback);
      video.load();
      void video.play().catch((error: unknown) => {
        console.warn('The theater preview video could not start automatically.', error);
      });

      return () => {
        cancelled = true;
        video?.removeEventListener('canplay', showVideo);
        video?.removeEventListener('error', showFallback);
        video?.pause();
        video?.removeAttribute('src');
        video?.load();
        videoTexture?.dispose();
        fallback?.dispose();
      };
    }

    void loadScreenTexture(dataUrl)
      .then((next) => {
        if (cancelled) {
          next.dispose();
          return;
        }
        loaded = next;
        setTexture((previous) => {
          previous.dispose();
          return next;
        });
      })
      .catch(() => {
        // A malformed user image must never break the 3D scene.
        if (cancelled) return;
        const nextFallback = createDefaultScreenTexture();
        fallback = nextFallback;
        setTexture((previous) => {
          previous.dispose();
          return nextFallback;
        });
      });

    return () => {
      cancelled = true;
      if (loaded) loaded.dispose();
      if (fallback) fallback.dispose();
    };
  }, [dataUrl]);

  return texture;
}

export function Screen({ geometry, config }: ScreenProps) {
  const texture = useScreenTexture(config.screenImageDataUrl);
  const frameAccumulator = useRef(0);
  const { widthM, heightM, centerM, tiltDeg, curved, curvatureM } = geometry.screen;
  const sag = curved ? Math.max(0.05, Math.min(curvatureM, widthM * 0.35)) : 0;

  useFrame((state, delta) => {
    if (config.screenImageDataUrl || !(texture instanceof THREE.CanvasTexture)) return;
    frameAccumulator.current += delta;
    if (frameAccumulator.current < 1 / 24) return;
    frameAccumulator.current %= 1 / 24;
    updateDefaultScreenTexture(texture, state.clock.elapsedTime);
  });

  const screenGeometry = useMemo(
    () => buildCurvedScreenGeometry(widthM, heightM, sag),
    [widthM, heightM, sag],
  );

  const surroundGeometry = useMemo(
    () => buildCurvedScreenGeometry(widthM + 0.34, heightM + 0.34, sag * 1.08),
    [widthM, heightM, sag],
  );

  useEffect(
    () => () => {
      screenGeometry.dispose();
      surroundGeometry.dispose();
    },
    [screenGeometry, surroundGeometry],
  );

  return (
    <group position={[centerM[0], centerM[1], centerM[2]]}>
      <group rotation={[-tiltDeg * DEG, 0, 0]}>
        <mesh geometry={surroundGeometry} position={[0, 0, -0.045]}>
          <meshStandardMaterial color="#0a0b0d" roughness={0.88} metalness={0.18} />
        </mesh>

        <mesh geometry={screenGeometry} renderOrder={2}>
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>

        {/* A soft wash in front of the screen so the first rows read as lit by
            the image rather than floating in a black room. */}
        <pointLight
          position={[0, 0, 1.8]}
          intensity={18}
          distance={Math.max(7, widthM * 0.85)}
          decay={2}
          color="#d8e0ea"
        />
      </group>

      <mesh position={[0, heightM / 2 + 0.22, -0.06]}>
        <boxGeometry args={[widthM + 0.5, 0.08, 0.16]} />
        <meshStandardMaterial color="#17181c" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[0, -heightM / 2 - 0.2, -0.06]}>
        <boxGeometry args={[widthM + 0.5, 0.14, 0.2]} />
        <meshStandardMaterial color="#141518" roughness={0.55} metalness={0.42} />
      </mesh>
    </group>
  );
}
