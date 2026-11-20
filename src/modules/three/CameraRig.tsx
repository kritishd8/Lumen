import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { CameraCommand, LookRequest, SpatialGeometry, SpatialSeat } from '@/types';
import { clamp } from '@/modules/reconstruction/coordinates';

const DEG = Math.PI / 180;

interface OverviewCameraProps {
  geometry: SpatialGeometry;
  command: CameraCommand;
}

export function OverviewCamera({ geometry, command }: OverviewCameraProps) {
  const camera = useThree((state) => state.camera);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { widthM, lengthM, ceilingHeightM } = geometry.dimensions;

  const framing = useMemo(() => {
    const center: [number, number, number] = [
      0,
      Math.max(1.1, ceilingHeightM * 0.28),
      lengthM * 0.48,
    ];
    const radius = Math.hypot(widthM, lengthM, ceilingHeightM) / 2;
    const verticalFov = 48;
    const distance = (radius / Math.tan((verticalFov / 2) * DEG)) * 0.76;
    const direction = new THREE.Vector3(0.52, 0.44, 0.78).normalize();
    const position = new THREE.Vector3(...center).add(direction.multiplyScalar(distance));
    return { center, distance, position };
  }, [widthM, lengthM, ceilingHeightM]);

  useEffect(() => {
    const controls = controlsRef.current;
    const target = new THREE.Vector3(...framing.center);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 48;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(framing.position);
    camera.lookAt(target);
    if (controls) {
      controls.target.copy(target);
      controls.update();
    }
  }, [camera, framing, command.nonce]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={framing.center}
      enableDamping
      dampingFactor={0.075}
      minDistance={1.8}
      maxDistance={framing.distance * 1.35}
      maxPolarAngle={Math.PI * 0.46}
      enablePan={false}
      panSpeed={0.8}
      rotateSpeed={0.62}
      zoomSpeed={0.72}
    />
  );
}

interface SeatCameraProps {
  seat: SpatialSeat;
  geometry: SpatialGeometry;
  lookRequest: LookRequest;
  interactive?: boolean;
}

export function SeatCamera({
  seat,
  geometry,
  lookRequest,
  interactive = true,
}: SeatCameraProps) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  const base = useMemo(() => {
    const [x, y, z] = seat.eyePosition;
    const [sx, sy, sz] = geometry.screen.centerM;
    const dx = sx - x;
    const dy = sy - y;
    const dz = sz - z;
    const horizontal = Math.hypot(dx, dz);
    return {
      position: new THREE.Vector3(x, y, z),
      yaw: Math.atan2(-dx, -dz),
      pitch: Math.atan2(dy, Math.max(0.001, horizontal)),
    };
  }, [seat, geometry.screen.centerM]);

  const targetOffset = useRef({ yaw: 0, pitch: 0 });
  const currentOffset = useRef({ yaw: 0, pitch: 0 });
  const drag = useRef({ active: false, x: 0, y: 0 });

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 58;
      camera.near = 0.03;
      camera.far = 400;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(base.position);
    camera.rotation.order = 'YXZ';
    currentOffset.current = { yaw: 0, pitch: 0 };
    targetOffset.current = {
      yaw: clamp(lookRequest.yawDeg, -110, 110) * DEG,
      pitch: clamp(lookRequest.pitchDeg, -65, 65) * DEG,
    };
  }, [
    camera,
    base.position.x,
    base.position.y,
    base.position.z,
    base.yaw,
    base.pitch,
    seat.seat.id,
  ]);

  useEffect(() => {
    targetOffset.current = {
      yaw: clamp(lookRequest.yawDeg, -110, 110) * DEG,
      pitch: clamp(lookRequest.pitchDeg, -65, 65) * DEG,
    };
  }, [lookRequest.nonce, lookRequest.yawDeg, lookRequest.pitchDeg]);

  useEffect(() => {
    if (!interactive) return;
    const element = gl.domElement;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      drag.current = { active: true, x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
      element.style.cursor = 'grabbing';
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag.current.active) return;
      const dx = event.clientX - drag.current.x;
      const dy = event.clientY - drag.current.y;
      drag.current.x = event.clientX;
      drag.current.y = event.clientY;
      targetOffset.current.yaw = clamp(
        targetOffset.current.yaw - dx * 0.0034,
        -110 * DEG,
        110 * DEG,
      );
      targetOffset.current.pitch = clamp(
        targetOffset.current.pitch - dy * 0.0034,
        -65 * DEG,
        65 * DEG,
      );
    };
    const onPointerUp = (event: PointerEvent) => {
      drag.current.active = false;
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
      element.style.cursor = 'grab';
    };

    element.style.cursor = 'grab';
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
      element.style.cursor = '';
    };
  }, [gl, interactive]);

  useFrame((_, delta) => {
    const smoothing = 1 - Math.pow(0.0008, Math.min(0.1, delta));
    currentOffset.current.yaw +=
      (targetOffset.current.yaw - currentOffset.current.yaw) * smoothing;
    currentOffset.current.pitch +=
      (targetOffset.current.pitch - currentOffset.current.pitch) * smoothing;
    camera.rotation.order = 'YXZ';
    camera.rotation.set(
      base.pitch + currentOffset.current.pitch,
      base.yaw + currentOffset.current.yaw,
      0,
    );
  });

  return null;
}
