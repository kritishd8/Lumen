/**
 * Lazy OpenCV.js loader. OpenCV is an optional accelerator: the analysis
 * pipeline always has a pure-TypeScript fallback so the app remains usable if
 * the wasm/asm bundle cannot initialise.
 */
let cvPromise: Promise<any | null> | null = null;

export function loadOpenCv(): Promise<any | null> {
  if (cvPromise) return cvPromise;
  cvPromise = (async () => {
    try {
      const module: any = await import('@techstark/opencv-js');
      let cv = module?.default ?? module;
      if (cv && typeof cv.then === 'function') cv = await cv;
      if (typeof cv === 'function') cv = await cv();
      if (!cv) return null;
      if (!cv.Mat) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('OpenCV initialisation timed out')), 9000);
          cv.onRuntimeInitialized = () => {
            clearTimeout(timeout);
            resolve();
          };
        });
      }
      return cv.Mat ? cv : null;
    } catch (error) {
      console.warn('OpenCV.js could not be loaded; using the TypeScript vision fallback.', error);
      return null;
    }
  })();
  return cvPromise;
}

export interface CvComponent {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  cx: number;
  cy: number;
}

export function connectedComponentsWithOpenCv(
  mask: Uint8Array,
  width: number,
  height: number,
  cv: any,
): CvComponent[] | null {
  let src: any;
  let labels: any;
  let stats: any;
  let centroids: any;
  try {
    src = new cv.Mat(height, width, cv.CV_8UC1);
    src.data.set(mask);
    labels = new cv.Mat();
    stats = new cv.Mat();
    centroids = new cv.Mat();
    cv.connectedComponentsWithStats(
      src,
      labels,
      stats,
      centroids,
      8,
      cv.CV_32S,
    );
    const components: CvComponent[] = [];
    const count = stats.rows;
    for (let label = 1; label < count; label += 1) {
      const x = stats.intAt(label, cv.CC_STAT_LEFT);
      const y = stats.intAt(label, cv.CC_STAT_TOP);
      const w = stats.intAt(label, cv.CC_STAT_WIDTH);
      const h = stats.intAt(label, cv.CC_STAT_HEIGHT);
      const area = stats.intAt(label, cv.CC_STAT_AREA);
      components.push({
        x,
        y,
        w,
        h,
        area,
        cx: x + w / 2,
        cy: y + h / 2,
      });
    }
    return components;
  } catch (error) {
    console.warn('OpenCV connected components failed.', error);
    return null;
  } finally {
    src?.delete();
    labels?.delete();
    stats?.delete();
    centroids?.delete();
  }
}

export function morphologicalOpen(
  mask: Uint8Array,
  width: number,
  height: number,
  cv: any,
  kernelSize = 2,
): Uint8Array {
  let src: any;
  let dst: any;
  let kernel: any;
  try {
    src = new cv.Mat(height, width, cv.CV_8UC1);
    src.data.set(mask);
    dst = new cv.Mat();
    kernel = cv.getStructuringElement(
      cv.MORPH_ELLIPSE,
      new cv.Size(kernelSize, kernelSize),
    );
    cv.morphologyEx(src, dst, cv.MORPH_OPEN, kernel);
    return new Uint8Array(dst.data);
  } catch {
    return mask;
  } finally {
    src?.delete();
    dst?.delete();
    kernel?.delete();
  }
}
