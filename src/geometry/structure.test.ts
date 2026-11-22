import { describe, expect, it } from 'vitest';
import raw from '../../venues/cluj-arena.json';
import { loadVenue } from '../venue/loadVenue.ts';
import type { MeshData } from './types.ts';

const venue = loadVenue(raw);
const { structure, config, manifest } = venue;

/** Every triangle's winding must agree with its vertices' normals (front faces render correctly). */
function windingAgreement(mesh: MeshData): { bad: number; total: number } {
  const P = mesh.positions;
  const N = mesh.normals;
  let bad = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!];
    const e1 = [P[b * 3]! - P[a * 3]!, P[b * 3 + 1]! - P[a * 3 + 1]!, P[b * 3 + 2]! - P[a * 3 + 2]!];
    const e2 = [P[c * 3]! - P[a * 3]!, P[c * 3 + 1]! - P[a * 3 + 1]!, P[c * 3 + 2]! - P[a * 3 + 2]!];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const vn = [N[a * 3]! + N[b * 3]! + N[c * 3]!, N[a * 3 + 1]! + N[b * 3 + 1]! + N[c * 3 + 1]!, N[a * 3 + 2]! + N[b * 3 + 2]! + N[c * 3 + 2]!];
    if (n[0]! * vn[0]! + n[1]! * vn[1]! + n[2]! * vn[2]! < 0) bad++;
  }
  return { bad, total: mesh.indices.length / 3 };
}

function assertWellFormed(mesh: MeshData): void {
  const vertexCount = mesh.positions.length / 3;
  expect(mesh.normals.length).toBe(mesh.positions.length);
  expect(mesh.indices.length % 3).toBe(0);
  for (const v of mesh.positions) expect(Number.isFinite(v)).toBe(true);
  for (const i of mesh.indices) expect(i).toBeLessThan(vertexCount);
  expect(windingAgreement(mesh).bad).toBe(0);
}

describe('structure buffers', () => {
  it('builds a closed, consistently wound solid for every sector', () => {
    for (const sector of manifest.sectors) {
      const mesh = structure.sectorSurfaces[sector.code];
      expect(mesh, sector.code).toBeDefined();
      expect(mesh!.indices.length).toBeGreaterThan(0);
      assertWellFormed(mesh!);
    }
  });

  it('builds the roof (four frames), facade and floodlights from the config', () => {
    assertWellFormed(structure.roof.opaque);
    assertWellFormed(structure.roof.translucent);
    assertWellFormed(structure.facade);
    expect(config.roof!.segments).toHaveLength(4);
    expect(structure.roof.columns.length).toBeGreaterThan(40);
    expect(structure.floodlights).toHaveLength(config.floodlights.count);
    expect(structure.screens).toHaveLength(config.screens.length);
  });

  it('keeps the roof above every spectator and the seats under its bounds', () => {
    const roofBottom = config.roof!.inner.height - 1; // fascia bottom
    const highestEye = Math.max(...manifest.seats.map((s) => s.position.y)) + config.eyeHeight;
    expect(roofBottom - highestEye).toBeGreaterThan(3);
    for (const seat of manifest.seats) {
      expect(Math.abs(seat.position.x)).toBeLessThan(structure.bounds.halfLength);
      expect(Math.abs(seat.position.z)).toBeLessThan(structure.bounds.halfWidth);
    }
  });

  it('aims floodlights downwards into the bowl', () => {
    for (const f of structure.floodlights) {
      expect(f.target.y).toBeLessThan(f.position.y);
      expect(Math.hypot(f.target.x, f.target.z)).toBeLessThan(Math.hypot(f.position.x, f.position.z));
    }
  });
});
