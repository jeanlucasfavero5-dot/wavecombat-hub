// Rays against the world and against player-shaped hitboxes (head / body / legs).
import type { Box, Vec3 } from "./types.ts";

export interface RayHit { t: number; nx: number; ny: number; nz: number }

/** slab test; t in meters along a unit direction, with the face normal of the entry */
export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }, maxT: number): RayHit | null {
  let tmin = 0, tmax = maxT;
  let nx = 0, ny = 0, nz = 0;
  const axis = (o: number, d: number, lo: number, hi: number, nAxis: 0 | 1 | 2): boolean => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    let t1 = (lo - o) / d, t2 = (hi - o) / d, sign = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sign = 1; }
    if (t1 > tmin) { tmin = t1; nx = ny = nz = 0; if (nAxis === 0) nx = sign; else if (nAxis === 1) ny = sign; else nz = sign; }
    if (t2 < tmax) tmax = t2;
    return tmin <= tmax;
  };
  if (!axis(ox, dx, b.x0, b.x1, 0)) return null;
  if (!axis(oy, dy, b.y0, b.y1, 1)) return null;
  if (!axis(oz, dz, b.z0, b.z1, 2)) return null;
  return { t: tmin, nx, ny, nz };
}

/** nearest solid along the ray, or null */
export function rayWorld(o: Vec3, d: Vec3, maxT: number, solids: readonly Box[]): RayHit | null {
  let best: RayHit | null = null;
  for (const b of solids) {
    const h = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b, best ? best.t : maxT);
    if (h && (!best || h.t < best.t)) best = h;
  }
  return best;
}

export type Part = "head" | "body" | "legs";
export const STAND_H = 1.8, CROUCH_H = 1.3, HALF_W = 0.35, EYE_STAND = 1.62, EYE_CROUCH = 1.15;

/** hitboxes of a body standing at (x, y, z), crouch 0..1 */
export function hitboxes(x: number, y: number, z: number, crouch: number): { part: Part; b: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } }[] {
  const h = STAND_H + (CROUCH_H - STAND_H) * crouch;
  const k = h / STAND_H;
  const box = (part: Part, hw: number, ya: number, yb: number) => ({ part, b: { x0: x - hw, y0: y + ya * k, z0: z - hw, x1: x + hw, y1: y + yb * k, z1: z + hw } });
  return [box("head", 0.19, 1.47, 1.8), box("body", 0.31, 0.78, 1.47), box("legs", 0.27, 0, 0.78)];
}

/** the nearest hitbox the ray enters, or null */
export function rayBody(o: Vec3, d: Vec3, maxT: number, x: number, y: number, z: number, crouch: number): { part: Part; hit: RayHit } | null {
  let best: { part: Part; hit: RayHit } | null = null;
  for (const { part, b } of hitboxes(x, y, z, crouch)) {
    const h = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, b, best ? best.hit.t : maxT);
    if (h && (!best || h.t < best.hit.t)) best = { part, hit: h };
  }
  return best;
}
