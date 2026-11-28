import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { AuditoriumConfig, Seat, SeatType, SpatialSeat } from '@/types';
import { MATERIAL_PRESETS, seatColorFor } from '@/utils/defaults';

interface ChairInstancesProps {
  seats: SpatialSeat[];
  config: AuditoriumConfig;
  selectedSeatId?: string | null;
  onSelectSeat?: (seatId: string) => void;
  onDoubleClickSeat?: (seatId: string) => void;
}

type PartMaterial = 'fabric' | 'accent' | 'metal';

interface PartDefinition {
  key: string;
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation?: [number, number, number];
  countMultiplier: number;
  material: PartMaterial;
}

function normaliseType(type: SeatType): 'standard' | 'recliner' | 'premium' | 'accessible' {
  return type === 'unknown' ? 'standard' : type;
}

function typeScale(type: SeatType): { width: number; depth: number; back: number } {
  switch (normaliseType(type)) {
    case 'recliner':
      return { width: 1.3, depth: 1.13, back: 1.06 };
    case 'premium':
      return { width: 1.12, depth: 1.03, back: 1.02 };
    case 'accessible':
      return { width: 1.06, depth: 1, back: 1 };
    default:
      return { width: 1, depth: 1, back: 1 };
  }
}

function buildParts(config: AuditoriumConfig, type: SeatType): PartDefinition[] {
  const scale = typeScale(type);
  const w = config.seatWidthM * scale.width;
  const d = config.seatDepthM * scale.depth;
  const cushionY = config.seating.seatHeightM;
  const backH = Math.max(0.7, config.seating.backrestHeightM * scale.back);
  const armHeight = 0.11;
  const armY = cushionY + 0.17;
  const backHeight = Math.max(0.2, backH - 0.28);

  const cushion = new RoundedBoxGeometry(w * 0.88, 0.15, d * 0.62, 2, 0.035);
  const back = new RoundedBoxGeometry(w * 0.86, backHeight, 0.16, 2, 0.045);
  const arm = new RoundedBoxGeometry(0.078, armHeight, d * 0.7, 2, 0.025);
  const armSupport = new RoundedBoxGeometry(0.055, 0.22, 0.08, 2, 0.02);
  const base = new RoundedBoxGeometry(w * 0.22, 0.25, d * 0.24, 2, 0.025);
  const foot = new RoundedBoxGeometry(w * 0.5, 0.035, d * 0.36, 2, 0.015);

  return [
    {
      key: 'base',
      geometry: base,
      position: [0, 0.125, 0.04],
      countMultiplier: 1,
      material: 'metal',
    },
    {
      key: 'cushion',
      geometry: cushion,
      position: [0, cushionY, -d * 0.02],
      countMultiplier: 1,
      material: 'fabric',
    },
    {
      key: 'back',
      geometry: back,
      position: [0, 0.29 + backHeight / 2, d * 0.32],
      rotation: [0.075, 0, 0],
      countMultiplier: 1,
      material: 'fabric',
    },
    {
      key: 'arm-left',
      geometry: arm,
      position: [-w * 0.47, armY, 0.02],
      countMultiplier: 1,
      material: 'accent',
    },
    {
      key: 'arm-right',
      geometry: arm,
      position: [w * 0.47, armY, 0.02],
      countMultiplier: 1,
      material: 'accent',
    },
    {
      key: 'support-left',
      geometry: armSupport,
      position: [-w * 0.47, cushionY + 0.03, 0.15],
      countMultiplier: 1,
      material: 'metal',
    },
    {
      key: 'support-right',
      geometry: armSupport,
      position: [w * 0.47, cushionY + 0.03, 0.15],
      countMultiplier: 1,
      material: 'metal',
    },
    {
      key: 'foot',
      geometry: foot,
      position: [0, 0.03, -d * 0.2],
      countMultiplier: 1,
      material: 'metal',
    },
  ];
}

function seatColour(
  seat: Seat,
  selected: boolean,
  config: AuditoriumConfig,
  part: PartMaterial,
): THREE.Color {
  if (selected) return new THREE.Color('#cfa964');
  if (part === 'metal') return new THREE.Color('#27231d');
  if (part === 'accent') {
    if (seat.status === 'available') {
      return new THREE.Color(
        config.materialPreset === 'custom'
          ? config.customSeatColor
          : MATERIAL_PRESETS[config.materialPreset].accent,
      ).multiplyScalar(1.22);
    }
    return new THREE.Color(seat.status === 'occupied' ? '#2b2721' : '#5a4c3a');
  }
  return new THREE.Color(seatColorFor(seat.status, config.materialPreset, config.customSeatColor));
}

function ChairGroup({
  seats,
  type,
  config,
  selectedSeatId,
  seatWidthScales,
  onSelectSeat,
  onDoubleClickSeat,
}: {
  seats: SpatialSeat[];
  type: SeatType;
  config: AuditoriumConfig;
  selectedSeatId?: string | null;
  seatWidthScales: Map<string, number>;
  onSelectSeat?: (seatId: string) => void;
  onDoubleClickSeat?: (seatId: string) => void;
}) {
  const parts = useMemo(() => buildParts(config, type), [config, type]);
  const meshRefs = useRef<Record<string, THREE.InstancedMesh | null>>({});
  const hitRef = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const selectedSeat = seats.find((seat) => seat.seat.id === selectedSeatId);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    const partMatrix = new THREE.Matrix4();
    const chairMatrix = new THREE.Matrix4();
    parts.forEach((part) => {
      const mesh = meshRefs.current[part.key];
      if (!mesh) return;
      seats.forEach((seat, index) => {
        const quaternion = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, seat.rotationY, 0, 'YXZ'),
        );
        const widthScale = seatWidthScales.get(seat.seat.id) ?? 1;
        chairMatrix.compose(
          new THREE.Vector3(...seat.position),
          quaternion,
          new THREE.Vector3(widthScale, 1, 1),
        );
        const localQuaternion = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            part.rotation?.[0] ?? 0,
            part.rotation?.[1] ?? 0,
            part.rotation?.[2] ?? 0,
          ),
        );
        partMatrix.compose(
          new THREE.Vector3(...part.position),
          localQuaternion,
          new THREE.Vector3(1, 1, 1),
        );
        const world = chairMatrix.clone().multiply(partMatrix);
        mesh.setMatrixAt(index, world);
        const selected = seat.seat.id === selectedSeatId;
        if (part.material !== 'metal') {
          mesh.setColorAt(index, seatColour(seat.seat, selected, config, part.material));
        }
      });
      mesh.count = seats.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });

    const hit = hitRef.current;
    if (hit) {
      seats.forEach((seat, index) => {
        const quaternion = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, seat.rotationY, 0, 'YXZ'),
        );
        const scale = typeScale(type);
        dummy.position.set(seat.position[0], config.seating.backrestHeightM / 2, seat.position[2]);
        dummy.quaternion.copy(quaternion);
        dummy.scale.set(
          config.seatWidthM * scale.width * (seatWidthScales.get(seat.seat.id) ?? 1) * 1.04,
          config.seating.backrestHeightM,
          config.seatDepthM * scale.depth * 1.18,
        );
        dummy.updateMatrix();
        hit.setMatrixAt(index, dummy.matrix);
      });
      hit.count = seats.length;
      hit.instanceMatrix.needsUpdate = true;
      hit.computeBoundingSphere();
    }
  }, [seats, config, type, parts, selectedSeatId, seatWidthScales]);

  useEffect(() => {
    if (!ringRef.current) return;
    if (!selectedSeat) {
      ringRef.current.visible = false;
      return;
    }
    ringRef.current.visible = true;
    ringRef.current.position.set(
      selectedSeat.position[0],
      selectedSeat.position[1] + 0.015,
      selectedSeat.position[2],
    );
  }, [selectedSeat]);

  return (
    <group>
      {parts.map((part) => (
        <instancedMesh
          key={part.key}
          ref={(node) => {
            meshRefs.current[part.key] = node;
          }}
          args={[part.geometry, undefined, seats.length]}
          castShadow={part.material !== 'metal'}
          receiveShadow
          frustumCulled={false}
        >
          {part.material === 'metal' ? (
            <meshStandardMaterial
              color="#27231d"
              roughness={0.55}
              metalness={0.62}
            />
          ) : (
            <meshStandardMaterial
              color="#ffffff"
              roughness={part.material === 'accent' ? 0.72 : 0.86}
              metalness={0.03}
            />
          )}
        </instancedMesh>
      ))}

      <instancedMesh
        ref={hitRef}
        args={[undefined, undefined, seats.length]}
        onClick={(event) => {
          event.stopPropagation();
          const index = event.instanceId ?? -1;
          if (index >= 0 && seats[index]) onSelectSeat?.(seats[index].seat.id);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          const index = event.instanceId ?? -1;
          if (index >= 0 && seats[index]) onDoubleClickSeat?.(seats[index].seat.id);
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} colorWrite={false} />
      </instancedMesh>

      <mesh
        ref={ringRef}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
        renderOrder={3}
      >
        <ringGeometry args={[config.seatWidthM * 0.54, config.seatWidthM * 0.63, 40]} />
        <meshBasicMaterial
          color="#cfa964"
          transparent
          opacity={0.9}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export function ChairInstances({
  seats,
  config,
  selectedSeatId,
  onSelectSeat,
  onDoubleClickSeat,
}: ChairInstancesProps) {
  const seatWidthScales = useMemo(() => {
    const rows = new Map<number, SpatialSeat[]>();
    seats.forEach((seat) => {
      const row = rows.get(seat.rowIndex) ?? [];
      row.push(seat);
      rows.set(seat.rowIndex, row);
    });

    const scales = new Map<string, number>();
    rows.forEach((row) => {
      const sorted = row.slice().sort((a, b) => a.position[0] - b.position[0]);
      sorted.forEach((seat, index) => {
        const neighbourGaps = [
          sorted[index - 1],
          sorted[index + 1],
        ]
          .filter((neighbour): neighbour is SpatialSeat => Boolean(neighbour))
          .map((neighbour) =>
            Math.hypot(
              seat.position[0] - neighbour.position[0],
              seat.position[2] - neighbour.position[2],
            ),
          );
        if (!neighbourGaps.length) {
          scales.set(seat.seat.id, 1);
          return;
        }

        const width = config.seatWidthM * typeScale(seat.seat.type).width;
        const availableWidth = Math.max(
          width * 0.55,
          Math.min(...neighbourGaps) - config.seating.seatGapM,
        );
        scales.set(seat.seat.id, Math.min(1, availableWidth / width));
      });
    });
    return scales;
  }, [seats, config.seatWidthM, config.seating.seatGapM]);

  const grouped = useMemo(() => {
    const groups = new Map<SeatType, SpatialSeat[]>();
    seats.forEach((seat) => {
      const type = seat.seat.type;
      const list = groups.get(type) ?? [];
      list.push(seat);
      groups.set(type, list);
    });
    return [...groups.entries()];
  }, [seats]);

  return (
    <>
      {grouped.map(([type, groupSeats]) => (
        <ChairGroup
          key={type}
          seats={groupSeats}
          type={type}
          config={config}
          selectedSeatId={selectedSeatId}
          seatWidthScales={seatWidthScales}
          onSelectSeat={onSelectSeat}
          onDoubleClickSeat={onDoubleClickSeat}
        />
      ))}
    </>
  );
}
