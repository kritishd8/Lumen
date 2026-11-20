import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type {
  AuditoriumConfig,
  CameraCommand,
  CameraMode,
  LookRequest,
  SeatingLayout,
  SpatialGeometry,
} from '@/types';
import { Auditorium } from './auditorium/Auditorium';
import { Lighting } from './auditorium/Lighting';
import { Screen } from './auditorium/Screen';
import { ChairInstances } from './seats/ChairInstances';
import { OverviewCamera, SeatCamera } from './CameraRig';

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') || canvas.getContext('webgl')),
    );
  } catch {
    return false;
  }
}

interface SceneContentProps {
  geometry: SpatialGeometry;
  config: AuditoriumConfig;
  layout: SeatingLayout;
  mode: CameraMode;
  seatId: string | null;
  command: CameraCommand;
  lookRequest: LookRequest;
  interactive: boolean;
  lightsOn: boolean;
  onSelectSeat?: (seatId: string) => void;
  onDoubleClickSeat?: (seatId: string) => void;
}

function SceneContent({
  geometry,
  config,
  layout,
  mode,
  seatId,
  command,
  lookRequest,
  interactive,
  lightsOn,
  onSelectSeat,
  onDoubleClickSeat,
}: SceneContentProps) {
  const seat = useMemo(
    () => geometry.seats.find((item) => item.seat.id === seatId) ?? null,
    [geometry.seats, seatId],
  );
  const fogNear = Math.max(14, geometry.dimensions.lengthM * 1.05);
  const fogFar = Math.max(34, geometry.dimensions.lengthM * 2.8);

  return (
    <>
      <color attach="background" args={[mode === 'overview' ? '#171a20' : '#06070a']} />
      {mode === 'seat' && <fog attach="fog" args={['#06070a', fogNear, fogFar]} />}

      <Lighting geometry={geometry} config={config} lightsOn={lightsOn} />
      <Auditorium
        geometry={geometry}
        config={config}
        layout={layout}
        cutaway={mode === 'overview'}
      />
      <Screen geometry={geometry} config={config} />
      <ChairInstances
        seats={geometry.seats}
        config={config}
        selectedSeatId={seatId}
        onSelectSeat={onSelectSeat}
        onDoubleClickSeat={onDoubleClickSeat}
      />

      {mode === 'seat' && seat ? (
        <SeatCamera
          seat={seat}
          geometry={geometry}
          lookRequest={lookRequest}
          interactive={interactive}
        />
      ) : (
        <OverviewCamera geometry={geometry} command={command} />
      )}
    </>
  );
}

interface CinemaSceneProps extends Omit<SceneContentProps, 'interactive' | 'lightsOn'> {
  interactive?: boolean;
  lightsOn?: boolean;
  className?: string;
}

export function CinemaScene({
  interactive = true,
  lightsOn = false,
  className,
  ...scene
}: CinemaSceneProps) {
  const { geometry } = scene;
  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
        }}
        camera={{
          position: [geometry.dimensions.widthM * 0.6, geometry.dimensions.ceilingHeightM * 0.6, geometry.dimensions.lengthM * 1.1],
          fov: 48,
          near: 0.03,
          far: 420,
        }}
        onPointerMissed={() => {
          // Selection is managed by the viewer; clicking empty space is a
          // deliberate no-op rather than a silent deselection.
        }}
      >
        <Suspense fallback={null}>
          <SceneContent {...scene} interactive={interactive} lightsOn={lightsOn} />
        </Suspense>
      </Canvas>
    </div>
  );
}
