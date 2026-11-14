// "Depósito 01": the first Action Elite map (original design). A walled warehouse yard with containers, crates, low walls and a catwalk
// with a stair on its east end. Everything is axis-aligned boxes, so the same map is the collision world on the client and the server.
import type { Box, MapDef, MatKind, Vec3 } from "./types.ts";

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: MatKind): Box => ({ x0, y0, z0, x1, y1, z1, mat });
/** a box from its center on the ground (or on y0) and its size */
const at = (cx: number, cz: number, w: number, d: number, h: number, mat: MatKind, y0 = 0): Box => box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, mat);

export function buildDeposito(): MapDef {
  const H = 24;
  const s: Box[] = [];
  // ground and the four outer walls
  s.push(box(-H, -1, -H, H, 0, H, "floor"));
  s.push(box(-H - 1, 0, -H - 1, H + 1, 8, -H, "wall"), box(-H - 1, 0, H, H + 1, 8, H + 1, "wall"));
  s.push(box(-H - 1, 0, -H, -H, 8, H, "wall"), box(H, 0, -H, H + 1, 8, H, "wall"));

  // containers (2.6 m tall: cover you can not just hop over)
  s.push(at(-9, -9, 7, 2.5, 2.6, "container-red"), at(9, -9, 7, 2.5, 2.6, "container-blue"));
  s.push(at(0, -2, 2.5, 8, 2.6, "container-green"));
  s.push(at(-17, 3, 2.5, 7, 2.6, "container-blue"), at(17, 3, 2.5, 7, 2.6, "container-red"));
  s.push(at(-6, 9, 6, 2.5, 2.6, "container-green"));

  // crate stacks (1.6 m: climbable with a jump) and a stair of crates up to a container top
  s.push(at(-14, 12, 1.6, 1.6, 1.6, "crate"), at(-12.4, 12, 1.6, 1.6, 1.6, "crate"), at(-13.2, 12, 1.6, 1.6, 1.6, "crate", 1.6));
  s.push(at(14, 10, 1.6, 1.6, 1.6, "crate"), at(15.6, 10, 1.6, 1.6, 1.6, "crate"), at(14.8, 10, 1.6, 1.6, 1.6, "crate", 1.6));
  s.push(at(6, 14, 1.6, 1.6, 1.6, "crate"), at(7.8, 14, 1.6, 1.6, 1.6, "crate"), at(-1, 16, 2.4, 2.4, 2.4, "crate"));
  s.push(at(-4, -2, 1.2, 1.2, 1.2, "crate"), at(-4, -3.2, 1.2, 1.2, 2.4, "crate"));
  s.push(at(21, -10, 2.4, 2.4, 2.4, "crate"), at(-21, -12, 2.4, 2.4, 2.4, "crate"));

  // low concrete walls: waist cover
  s.push(at(-6, 4, 5, 0.6, 1.2, "concrete"), at(7, 3, 5, 0.6, 1.2, "concrete"), at(0, 8, 4, 0.6, 1.2, "concrete"));
  s.push(at(-11, -3, 0.6, 5, 1.2, "concrete"), at(11, -3, 0.6, 5, 1.2, "concrete"));

  // catwalk along the north wall: deck at 3.2 m, pillars, a rail on the south edge, a 7-step stair on the east end
  s.push(box(-14, 2.8, -23, 14, 3.2, -18, "grate"));
  for (const px of [-13.7, 0, 13.7]) s.push(box(px - 0.3, 0, -20.8, px + 0.3, 2.8, -20.2, "metal"));
  s.push(box(-14, 3.2, -18.2, 14, 4.0, -18, "metal"));
  for (let i = 0; i < 7; i++) s.push(box(14 + 0.9 * i, 0, -23, 14 + 0.9 * (i + 1), 2.8 - 0.4 * i, -19.5, "grate"));

  const spawns = [
    { x: 0, y: 0, z: 19, yaw: 0, team: 0 }, { x: -10, y: 0, z: 19, yaw: 0, team: 0 }, { x: 10, y: 0, z: 19, yaw: 0, team: 0 },
    { x: 0, y: 0, z: -15, yaw: Math.PI, team: 1 }, { x: -10, y: 0, z: -15, yaw: Math.PI, team: 1 }, { x: 10, y: 0, z: -15, yaw: Math.PI, team: 1 },
  ];
  const spots: Vec3[] = [
    [-4, -8], [4, -8], [-16, -8], [16, -6], [-20, 8], [20, 8], [-2, 5], [3, -4], [-8, 14], [10, 15], [-18, -16], [18, -16], [0, 21], [-21, 18], [21, 18],
  ].map(([x, z]) => ({ x, y: 0, z }));
  const free = spots.filter((p) => !s.some((b) => p.x > b.x0 - 0.6 && p.x < b.x1 + 0.6 && p.z > b.z0 - 0.6 && p.z < b.z1 + 0.6 && b.y1 > 0.2 && b.y0 < 1.8));

  return { id: "deposito01", name: "Depósito 01", solids: s, half: H, spawns, targetSpots: free };
}
