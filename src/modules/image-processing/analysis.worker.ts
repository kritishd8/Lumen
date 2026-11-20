/// <reference lib="webworker" />
import { detectSeating } from './detection';

export type WorkerRequest = {
  type: 'analyze';
  imageData: ImageData;
  originalWidth: number;
  originalHeight: number;
};

export type WorkerResponse =
  | { type: 'progress'; percent: number; step: string }
  | { type: 'result'; result: Awaited<ReturnType<typeof detectSeating>> }
  | { type: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== 'analyze') return;
  try {
    const result = await detectSeating(
      event.data.imageData,
      event.data.originalWidth,
      event.data.originalHeight,
      {
        onProgress: (percent, step) => {
          scope.postMessage({
            type: 'progress',
            percent,
            step,
          } satisfies WorkerResponse);
        },
      },
    );
    scope.postMessage({ type: 'result', result } satisfies WorkerResponse);
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Image analysis failed.',
    } satisfies WorkerResponse);
  }
};
