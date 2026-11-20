/**
 * React Three Fiber augments the JSX intrinsic elements from `react`. The
 * augmentation is only applied when the module is part of the program, which
 * can be missed by files that render three.js elements without importing the
 * renderer directly. Importing the types here makes the augmentation global.
 */
import type { ThreeElements } from '@react-three/fiber';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

export {};
