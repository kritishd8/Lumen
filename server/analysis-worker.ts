import { parentPort } from 'node:worker_threads';
import { detectSeating } from '@/modules/image-processing/detection';

if (!parentPort) {
  throw new Error('The image-analysis worker must run in a worker thread.');
}

parentPort.on(
  'message',
  async (input: {
    data: ArrayBuffer;
    width: number;
    height: number;
    originalWidth: number;
    originalHeight: number;
  }) => {
    try {
      const result = await detectSeating(
        {
          data: new Uint8Array(input.data),
          width: input.width,
          height: input.height,
        },
        input.originalWidth,
        input.originalHeight,
        { useOpenCv: false },
      );
      parentPort?.postMessage({ type: 'result', result });
    } catch (error) {
      parentPort?.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : 'Image analysis failed.',
      });
    }
  },
);
