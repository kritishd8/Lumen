import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { AuditoriumConfig, SeatingLayout, SpatialGeometry } from '@/types';
import { floorElevationAt } from '@/modules/reconstruction/geometry';
import { projectToScreenAxes } from '@/modules/reconstruction/coordinates';
import { measureLayout } from '@/modules/reconstruction/calibration';
import { createCarpetTexture, createWallTexture } from '../textures';

interface AuditoriumProps {
  geometry: SpatialGeometry;
  config: AuditoriumConfig;
  layout: SeatingLayout;
  cutaway?: boolean;
}

export function Auditorium({ geometry, config, layout, cutaway = false }: AuditoriumProps) {
  const { widthM, lengthM, ceilingHeightM } = geometry.dimensions;
  const carpet = useMemo(() => createCarpetTexture(), []);
  const wall = useMemo(() => createWallTexture(), []);

  useEffect(
    () => () => {
      carpet.dispose();
      wall.dispose();
    },
    [carpet, wall],
  );

  const rows = useMemo(
    () => geometry.rows.slice().sort((a, b) => a.index - b.index),
    [geometry.rows],
  );

  const steps = useMemo(() => {
    if (!rows.length) {
      return [{ z: lengthM / 2, depth: lengthM, top: 0 }];
    }
    const platforms: { z: number; depth: number; top: number }[] = [];
    const frontZ = Math.max(0, rows[0].z - config.rowSpacingM / 2);
    if (frontZ > 0.05) {
      platforms.push({ z: frontZ / 2, depth: frontZ, top: 0 });
    }
    rows.forEach((row, index) => {
      const start = Math.max(0, row.z - config.rowSpacingM / 2);
      const end = Math.min(lengthM, row.z + config.rowSpacingM / 2);
      const nextTop = rows[index + 1]?.elevationM ?? row.elevationM;
      platforms.push({
        z: (start + end) / 2,
        depth: Math.max(0.05, end - start),
        top: row.elevationM,
      });
      if (index === rows.length - 1) {
        const rear = Math.max(0, lengthM - end);
        if (rear > 0.05) {
          platforms.push({ z: end + rear / 2, depth: rear, top: nextTop });
        }
      }
    });
    return platforms;
  }, [rows, config.rowSpacingM, lengthM]);

  const aisleSurfaces = useMemo(() => {
    const metrics = measureLayout(layout);
    const metresPerPixel = geometry.calibration.metresPerPixel;
    const zScale =
      metrics.rowSpacingPx > 0
        ? Math.max(
            0.55,
            Math.min(1.8, config.rowSpacingM / (metrics.rowSpacingPx * metresPerPixel)),
          )
        : 1;
    const { screenCenter, screenTangent, screenNormal } = geometry.calibration;
    const surfaces: {
      id: string;
      x: number;
      z: number;
      y: number;
      width: number;
      depth: number;
    }[] = [];

    layout.aisles.forEach((aisle) => {
      const projection = projectToScreenAxes(
        { x: aisle.x, y: aisle.y },
        { center: screenCenter, tangent: screenTangent, normal: screenNormal },
        layout.imageWidth,
        layout.imageHeight,
      );
      const centerZ =
        config.frontClearanceM +
        (projection.depthPx - metrics.firstRowDepthPx) * metresPerPixel * zScale;
      const aisleWidth =
        aisle.orientation === 'vertical'
          ? aisle.width * layout.imageWidth * metresPerPixel
          : aisle.width * layout.imageHeight * metresPerPixel * zScale;
      const surfaceWidth = Math.max(0.55, Math.min(2.4, aisleWidth));

      if (aisle.orientation === 'vertical') {
        const startZ = Math.max(0, geometry.dimensions.minZ - config.rowSpacingM / 2);
        const endZ = Math.min(lengthM, geometry.dimensions.maxZ + config.rowSpacingM / 2);
        steps.forEach((step, index) => {
          const stepStart = Math.max(startZ, step.z - step.depth / 2);
          const stepEnd = Math.min(endZ, step.z + step.depth / 2);
          if (stepEnd <= stepStart) return;
          surfaces.push({
            id: `${aisle.id}-${index}`,
            x: projection.horizontalPx * metresPerPixel,
            z: (stepStart + stepEnd) / 2,
            y: step.top + 0.012,
            width: surfaceWidth,
            depth: stepEnd - stepStart,
          });
        });
        return;
      }

      const step = steps.find(
        (item) => Math.abs(centerZ - item.z) <= item.depth / 2,
      );
      surfaces.push({
        id: aisle.id,
        x: 0,
        z: centerZ,
        y: (step?.top ?? floorElevationAt(centerZ, config)) + 0.012,
        width: widthM,
        depth: surfaceWidth,
      });
    });

    return surfaces;
  }, [layout, geometry, config, steps, widthM, lengthM]);

  const aisleLights = useMemo(() => {
    const lights: { x: number; y: number; z: number; width: number; horizontal: boolean }[] = [];
    const { screenCenter, screenTangent, screenNormal, metresPerPixel } = geometry.calibration;
    layout.aisles.forEach((aisle) => {
      const projection = projectToScreenAxes(
        { x: aisle.x, y: aisle.y },
        {
          center: screenCenter,
          tangent: screenTangent,
          normal: screenNormal,
        },
        layout.imageWidth,
        layout.imageHeight,
      );
      const x = projection.horizontalPx * metresPerPixel;
      if (aisle.orientation === 'horizontal') {
        for (let offset = -2; offset <= 2; offset += 1) {
          const z = (aisle.y * layout.imageHeight) * 0.001;
          lights.push({
            x: offset * Math.min(2, widthM / 6),
            y: floorElevationAt(Math.max(0, z), config) + 0.035,
            z: Math.max(0.6, projection.depthPx * metresPerPixel),
            width: 0.1,
            horizontal: true,
          });
        }
        return;
      }
      const minZ = Math.max(1.2, geometry.dimensions.minZ - config.rowSpacingM);
      const maxZ = Math.min(lengthM - 0.3, geometry.dimensions.maxZ + config.rearClearanceM);
      for (let z = minZ; z <= maxZ; z += 1.8) {
        lights.push({
          x,
          y: floorElevationAt(z, config) + 0.035,
          z,
          width: 0.08,
          horizontal: false,
        });
      }
    });
    return lights;
  }, [layout, geometry, config, widthM, lengthM]);

  const wallLights = useMemo(() => {
    const lights: { side: 1 | -1; z: number; y: number }[] = [];
    const count = Math.max(2, Math.floor(lengthM / 3.2));
    for (let index = 0; index < count; index += 1) {
      const z = 2 + (index / Math.max(1, count - 1)) * (lengthM - 3);
      lights.push({ side: -1, z, y: Math.min(2.7, ceilingHeightM - 0.8) });
      lights.push({ side: 1, z, y: Math.min(2.7, ceilingHeightM - 0.8) });
    }
    return lights;
  }, [lengthM, ceilingHeightM]);

  return (
    <group>
      {steps.map((step, index) => {
        const height = step.top + 0.18;
        return (
          <mesh
            key={`floor-${index}`}
            position={[0, step.top - height / 2, step.z]}
            receiveShadow
          >
            <boxGeometry args={[widthM, height, step.depth]} />
            <meshStandardMaterial
              map={carpet}
              color="#cfc8b8"
              roughness={0.98}
              metalness={0}
            />
          </mesh>
        );
      })}

      {aisleSurfaces.map((aisle) => (
        <mesh
          key={`aisle-surface-${aisle.id}`}
          position={[aisle.x, aisle.y, aisle.z]}
          receiveShadow
        >
          <boxGeometry args={[aisle.width, 0.018, aisle.depth]} />
          <meshStandardMaterial color="#38302a" roughness={0.96} />
        </mesh>
      ))}

      {!cutaway && (
        <>
          <mesh position={[0, ceilingHeightM + 0.12, lengthM / 2]} receiveShadow>
            <boxGeometry args={[widthM, 0.24, lengthM]} />
            <meshStandardMaterial color="#0f0d0a" roughness={0.96} metalness={0.02} />
          </mesh>

          <mesh position={[-widthM / 2 - 0.12, ceilingHeightM / 2, lengthM / 2]} receiveShadow>
            <boxGeometry args={[0.24, ceilingHeightM, lengthM]} />
            <meshStandardMaterial map={wall} color="#c9c1b1" roughness={0.94} />
          </mesh>
          <mesh position={[widthM / 2 + 0.12, ceilingHeightM / 2, lengthM / 2]} receiveShadow>
            <boxGeometry args={[0.24, ceilingHeightM, lengthM]} />
            <meshStandardMaterial map={wall} color="#c9c1b1" roughness={0.94} />
          </mesh>
          <mesh position={[0, ceilingHeightM / 2, lengthM + 0.12]} receiveShadow>
            <boxGeometry args={[widthM, ceilingHeightM, 0.24]} />
            <meshStandardMaterial map={wall} color="#bfb5a2" roughness={0.95} />
          </mesh>
          <mesh position={[0, ceilingHeightM / 2, -0.32]} receiveShadow>
            <boxGeometry args={[widthM, ceilingHeightM, 0.3]} />
            <meshStandardMaterial color="#0c0a08" roughness={0.92} />
          </mesh>
        </>
      )}

      {!cutaway && wallLights.map((light, index) => (
        <group key={`wall-light-${index}`}>
          <mesh position={[light.side * (widthM / 2 - 0.015), light.y, light.z]}>
            <boxGeometry args={[0.04, 0.16, 0.5]} />
            <meshBasicMaterial color="#cfa964" toneMapped={false} />
          </mesh>
          <mesh position={[light.side * (widthM / 2 - 0.04), light.y, light.z]}>
            <boxGeometry args={[0.07, 0.26, 0.62]} />
            <meshStandardMaterial color="#1b1712" roughness={0.6} metalness={0.4} />
          </mesh>
        </group>
      ))}

      {aisleLights.map((light, index) => (
        <mesh key={`aisle-light-${index}`} position={[light.x, light.y, light.z]}>
          <boxGeometry
            args={light.horizontal ? [0.24, 0.018, 0.07] : [0.07, 0.018, 0.24]}
          />
          <meshBasicMaterial color="#cfa964" toneMapped={false} />
        </mesh>
      ))}

      {config.stage.enabled && (
        <group>
          <mesh
            position={[0, config.stage.heightM / 2, config.stage.depthM / 2]}
            receiveShadow
            castShadow
          >
            <boxGeometry
              args={[widthM * 0.9, config.stage.heightM, config.stage.depthM]}
            />
            <meshStandardMaterial color="#1e1913" roughness={0.8} />
          </mesh>
          <mesh
            position={[
              0,
              config.stage.heightM + 0.012,
              config.stage.depthM / 2,
            ]}
            receiveShadow
          >
            <boxGeometry
              args={[widthM * 0.9, 0.025, config.stage.depthM]}
            />
            <meshStandardMaterial color="#242019" roughness={0.7} metalness={0.2} />
          </mesh>
        </group>
      )}

      <mesh
        position={[0, 0.006, lengthM / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[widthM, lengthM]} />
        <meshBasicMaterial color="#000000" transparent opacity={0} />
      </mesh>
    </group>
  );
}
