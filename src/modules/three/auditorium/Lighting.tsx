import { useMemo } from 'react';
import type { AuditoriumConfig, SpatialGeometry } from '@/types';

interface LightingProps {
  geometry: SpatialGeometry;
  config: AuditoriumConfig;
  lightsOn?: boolean;
}

export function Lighting({ geometry, config, lightsOn = false }: LightingProps) {
  const { widthM, lengthM, ceilingHeightM } = geometry.dimensions;

  const downlights = useMemo(() => {
    const count = Math.max(3, Math.min(8, Math.round(lengthM / 2.6)));
    return Array.from({ length: count }, (_, index) => {
      const z = 1.8 + (index / Math.max(1, count - 1)) * Math.max(0.5, lengthM - 3.2);
      return {
        position: [0, ceilingHeightM - 0.045, z] as [number, number, number],
        z,
      };
    });
  }, [lengthM, ceilingHeightM]);

  const wallLights = useMemo(
    () => [
      { position: [-widthM / 2 + 0.18, Math.min(2.9, ceilingHeightM - 0.7), lengthM * 0.32] as [number, number, number] },
      { position: [widthM / 2 - 0.18, Math.min(2.9, ceilingHeightM - 0.7), lengthM * 0.32] as [number, number, number] },
      { position: [-widthM / 2 + 0.18, Math.min(2.9, ceilingHeightM - 0.7), lengthM * 0.7] as [number, number, number] },
      { position: [widthM / 2 - 0.18, Math.min(2.9, ceilingHeightM - 0.7), lengthM * 0.7] as [number, number, number] },
    ],
    [widthM, lengthM, ceilingHeightM],
  );

  return (
    <group>
      <ambientLight intensity={lightsOn ? 1.25 : 0.32} color={lightsOn ? '#fff9ed' : '#8d8779'} />
      <hemisphereLight args={['#f5f0e6', lightsOn ? '#aaa69d' : '#241d17', lightsOn ? 1.15 : 0.5]} />
      {lightsOn && <>
        <directionalLight position={[0, ceilingHeightM - 0.2, lengthM * 0.35]} intensity={2.2} color="#fff8ec" />
        <directionalLight position={[widthM * 0.34, ceilingHeightM * 0.8, lengthM * 0.8]} intensity={1.35} color="#e9f2ff" />
        <directionalLight position={[-widthM * 0.34, ceilingHeightM * 0.8, lengthM * 0.8]} intensity={1.35} color="#e9f2ff" />
      </>}

      {/* Cool spill from the screen. */}
      <pointLight
        position={[0, geometry.screen.centerM[1], 2.6]}
        intensity={lightsOn ? 14 : 24}
        distance={Math.max(10, config.screen.widthM * 1.1)}
        decay={2}
        color="#d8d4c9"
      />

      {/* Warm ceiling wash. */}
      {downlights.map((light, index) => (
        <group key={`downlight-${index}`}>
          <mesh position={light.position} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.09, 0.11, 0.035, 16]} />
            <meshBasicMaterial color="#f0d3a8" toneMapped={false} />
          </mesh>
          {index % 2 === 0 && (
            <pointLight
              position={[light.position[0], light.position[1] - 0.12, light.position[2]]}
              intensity={lightsOn ? 28 : 7}
              distance={Math.max(4, lengthM * 0.32)}
              decay={2}
              color="#f2c895"
            />
          )}
        </group>
      ))}

      {wallLights.map((light, index) => (
        <pointLight
          key={`wall-glow-${index}`}
          position={light.position}
          intensity={lightsOn ? 14 : 3.4}
          distance={5.2}
          decay={2}
          color="#e0ab74"
        />
      ))}

      {/* A gentle rear fill keeps the back rows legible without flattening the
          room. */}
      <pointLight
        position={[0, ceilingHeightM * 0.72, lengthM * 0.92]}
        intensity={lightsOn ? 25 : 9}
        distance={Math.max(8, lengthM * 0.7)}
        decay={2}
        color="#b3a88f"
      />
    </group>
  );
}
