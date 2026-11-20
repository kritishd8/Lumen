import { describe, expect, it } from 'vitest';
import { buildCurvedScreenGeometry } from '@/modules/three/auditorium/Screen';

describe('projection screen geometry', () => {
  it('faces the audience for flat and curved screens', () => {
    for (const sag of [0, 1.2]) {
      const geometry = buildCurvedScreenGeometry(12, 6, sag, 8);
      const normals = geometry.getAttribute('normal');

      for (let index = 0; index < normals.count; index += 1) {
        expect(normals.getZ(index)).toBeGreaterThan(0);
      }

      geometry.dispose();
    }
  });
});
