import * as THREE from 'three';

export function createDefaultScreenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  updateDefaultScreenTexture(texture, 0);
  return texture;
}

export function updateDefaultScreenTexture(
  texture: THREE.CanvasTexture,
  timeSeconds: number,
): void {
  const canvas = texture.image as HTMLCanvasElement;
  const context = canvas.getContext('2d');
  if (!context) return;

  const { width, height } = canvas;
  const phase = timeSeconds * 0.16;
  const horizon = height * 0.64;
  const sunX = width * (0.5 + Math.sin(phase * 0.7) * 0.08);
  const sunY = height * 0.48;

  const sky = context.createLinearGradient(0, 0, width * 0.25, height);
  sky.addColorStop(0, '#101a32');
  sky.addColorStop(0.42, '#385a78');
  sky.addColorStop(0.72, '#c47b68');
  sky.addColorStop(1, '#171d2d');
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  context.globalCompositeOperation = 'screen';
  for (let index = 0; index < 4; index += 1) {
    const x = width * (0.18 + index * 0.23) + Math.sin(phase + index) * 42;
    const y = height * (0.22 + (index % 2) * 0.13) + Math.cos(phase * 0.8 + index) * 10;
    const cloud = context.createRadialGradient(x, y, 2, x, y, width * 0.3);
    cloud.addColorStop(0, index % 2 ? 'rgba(104, 183, 197, 0.22)' : 'rgba(246, 173, 125, 0.2)');
    cloud.addColorStop(1, 'rgba(63, 107, 145, 0)');
    context.fillStyle = cloud;
    context.fillRect(0, 0, width, height);
  }
  context.globalCompositeOperation = 'source-over';

  const sun = context.createRadialGradient(sunX, sunY, 1, sunX, sunY, height * 0.28);
  sun.addColorStop(0, 'rgba(255, 232, 185, 0.95)');
  sun.addColorStop(0.12, 'rgba(255, 207, 159, 0.52)');
  sun.addColorStop(1, 'rgba(255, 194, 146, 0)');
  context.fillStyle = sun;
  context.fillRect(0, 0, width, height);
  context.beginPath();
  context.arc(sunX, sunY, height * 0.052, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 235, 204, 0.92)';
  context.fill();

  const drawRidge = (baseY: number, amplitude: number, speed: number, fill: string) => {
    context.beginPath();
    context.moveTo(0, height);
    for (let x = 0; x <= width; x += 8) {
      const y =
        baseY +
        Math.sin(x * 0.018 + phase * speed) * amplitude +
        Math.sin(x * 0.043 - phase * speed * 0.7) * amplitude * 0.32;
      context.lineTo(x, y);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
  };

  drawRidge(horizon + 6, 18, 0.8, '#364354');
  drawRidge(horizon + 29, 22, -0.55, '#202a3a');
  drawRidge(horizon + 58, 15, 0.35, '#111827');

  const reflection = context.createLinearGradient(0, horizon, 0, height);
  reflection.addColorStop(0, 'rgba(226, 157, 125, 0.24)');
  reflection.addColorStop(1, 'rgba(14, 20, 33, 0.02)');
  context.fillStyle = reflection;
  context.fillRect(0, horizon, width, height - horizon);

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    height * 0.18,
    width / 2,
    height / 2,
    width * 0.72,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  texture.needsUpdate = true;
}

export function loadScreenTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
      resolve(texture);
    };
    image.onerror = () => reject(new Error('Could not load the screen reference image.'));
    image.src = url;
  });
}

export function createCarpetTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  context.fillStyle = '#151619';
  context.fillRect(0, 0, 256, 256);
  let seed = 8473;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 3600; i += 1) {
    const x = random() * 256;
    const y = random() * 256;
    const shade = 18 + random() * 24;
    context.fillStyle = `rgba(${shade},${shade + 1},${shade + 3},${0.18 + random() * 0.3})`;
    context.fillRect(x, y, 1 + random() * 1.4, 1 + random() * 1.4);
  }
  context.strokeStyle = 'rgba(255,255,255,0.018)';
  context.lineWidth = 1;
  for (let i = 0; i < 256; i += 32) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i, 256);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 18);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const gradient = context.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, '#1b1d22');
  gradient.addColorStop(0.5, '#17191d');
  gradient.addColorStop(1, '#111216');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1200; i += 1) {
    context.fillStyle = `rgba(255,255,255,${Math.random() * 0.012})`;
    context.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 3);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
