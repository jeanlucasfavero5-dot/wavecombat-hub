// Rules of the Action Elite simulation, without a browser: collision, climbing, shooting, damage, reload.
//   node --test src/sim/test/sim.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeposito } from "../map.ts";
import { newBody, stepBody } from "../movement.ts";
import { rayBox, rayWorld, rayBody } from "../hit.ts";
import { Session } from "../../game/session.ts";
import type { MoveCmd } from "../types.ts";
import type { InputFrame } from "../../core/input.ts";

const map = buildDeposito();
const cmd = (o: Partial<MoveCmd>): MoveCmd => ({ fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false, yaw: 0, speedMult: 1, ...o });
const IDLE: InputFrame = { fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false, fire: false, firePressed: false, scopePressed: false, reloadPressed: false, lastWeaponPressed: false, slot: 0, wheel: 0, lookDx: 0, lookDy: 0 };
const seeded = (): (() => number) => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };

function settle(b: ReturnType<typeof newBody>, secs: number): void {
  for (let i = 0; i < secs * 60; i++) stepBody(b, cmd({}), 1 / 60, map.solids, map.half);
}

test("rayBox: distance and face normal", () => {
  const h = rayBox(0, 1, 5, 0, 0, -1, { x0: -1, y0: 0, z0: -1, x1: 1, y1: 2, z1: 1 }, 100)!;
  assert.ok(Math.abs(h.t - 4) < 1e-9 && h.nz === 1 && h.nx === 0 && h.ny === 0);
  assert.equal(rayBox(0, 5, 5, 0, 0, -1, { x0: -1, y0: 0, z0: -1, x1: 1, y1: 2, z1: 1 }, 100), null);
});

test("movement: gravity lands on the floor, the wall stops the player, no walking through solids", () => {
  const b = newBody(0, 5, 18);
  settle(b, 2);
  assert.ok(b.onGround && Math.abs(b.y) < 0.01, `landed at y=${b.y}`);
  for (let i = 0; i < 60 * 8; i++) stepBody(b, cmd({ fwd: 1, yaw: Math.PI }), 1 / 60, map.solids, map.half); // yaw PI faces +Z: the south wall
  assert.ok(b.z <= map.half - 0.34 && b.z > map.half - 0.5, `stopped at the wall, z=${b.z}`);
  const c = newBody(-3.2, 0, 8);
  settle(c, 1);
  for (let i = 0; i < 60 * 4; i++) stepBody(c, cmd({ fwd: 1, yaw: 0 }), 1 / 60, map.solids, map.half);
  assert.ok(Math.abs(c.z - (-2 + 4 + 0.35)) < 3 || c.z > -1, "a container or crate stops it");
});

test("movement: the catwalk stair climbs to the deck at 3.2 m", () => {
  const b = newBody(21.5, 0, -21);
  settle(b, 1);
  let i = 0;
  while (b.x > 10 && i++ < 60 * 8) stepBody(b, cmd({ fwd: 1, yaw: Math.PI / 2 }), 1 / 60, map.solids, map.half); // yaw PI/2 faces -X
  assert.ok(b.x <= 10 && Math.abs(b.y - 3.2) < 0.05 && b.onGround, `on the deck: x=${b.x.toFixed(2)} y=${b.y.toFixed(2)}`);
});

test("movement: a jump clears 1.2 m and mounts a 1.6 m crate; a 2.6 m container is too high", () => {
  const crate = newBody(-14.5, 0, 14); // south of the crate stack at (-14,12): its first crate is 1.6 m
  settle(crate, 1);
  let n = 0;
  while (!(crate.onGround && crate.y > 1.5) && n++ < 60 * 3) stepBody(crate, cmd({ fwd: 1, jump: true, yaw: 0 }), 1 / 60, map.solids, map.half);
  assert.ok(crate.onGround && crate.y > 1.5 && crate.y < 1.7, `on top of the first crate: y=${crate.y.toFixed(2)} after ${n} ticks`);
  const cont = newBody(-6, 0, 12); // south of the green container at (-6, 9), 2.6 m
  settle(cont, 1);
  for (let i = 0; i < 60 * 2; i++) stepBody(cont, cmd({ fwd: 1, jump: true, yaw: 0 }), 1 / 60, map.solids, map.half);
  for (let i = 0; i < 60; i++) stepBody(cont, cmd({}), 1 / 60, map.solids, map.half);
  assert.ok(cont.onGround && cont.y < 0.5, `still on the ground: y=${cont.y.toFixed(2)}`);
});

test("movement: crouching is slower and lowers the body; it does not stand up under a low ceiling", () => {
  const a = newBody(3, 0, 20); settle(a, 1);
  const b = newBody(10, 0, 20); settle(b, 1);
  for (let i = 0; i < 60; i++) { stepBody(a, cmd({ fwd: 1 }), 1 / 60, map.solids, map.half); stepBody(b, cmd({ fwd: 1, crouch: true }), 1 / 60, map.solids, map.half); }
  assert.ok(b.crouch > 0.95 && 20 - a.z > 20 - b.z + 1, `walked ${20 - a.z} vs crouched ${20 - b.z}`);
});

/** a target, and the player standing 8 m from it with nothing in between (no solid, no other target) */
function setup(slot: number, kind: "static" | "strafe" | "popup" = "static") {
  const s = new Session(map, seeded());
  const t = s.targets.find((x) => x.kind === kind)!;
  t.phase = 0;
  let placed = false;
  for (let k = 0; k < 32 && !placed; k++) {
    const ang = (k / 32) * Math.PI * 2, px = t.x + Math.cos(ang) * 8, pz = t.z + Math.sin(ang) * 8;
    if (Math.abs(px) > 22 || Math.abs(pz) > 22) continue;
    if (map.solids.some((b) => b.y1 > 0.2 && px + 0.5 > b.x0 && px - 0.5 < b.x1 && pz + 0.5 > b.z0 && pz - 0.5 < b.z1)) continue;
    const o = { x: px, y: 1.62, z: pz }, d = { x: (t.x - px) / 8, y: (t.y + 1.1 - 1.62) / 8, z: (t.z - pz) / 8 };
    const l = Math.hypot(d.x, d.y, d.z); d.x /= l; d.y /= l; d.z /= l;
    if (rayWorld(o, d, 9, map.solids)) continue;
    if (s.targets.some((u) => u !== t && rayBody(o, d, 9, u.x, u.y, u.z, 0))) continue;
    if (s.targets.some((u) => u !== t && Math.hypot(u.x - px, u.z - pz) < 1.5)) continue;
    s.body.x = px; s.body.z = pz; s.body.y = 0; s.body.vx = s.body.vz = 0; s.body.onGround = true;
    placed = true;
  }
  assert.ok(placed, "a clear spot to shoot from");
  s.switchWeapon(slot);
  for (let i = 0; i < 40; i++) s.tick(1 / 60, IDLE);
  const aim = (y: number): void => {
    const ex = s.body.x, ey = s.body.y + s.eyeHeight, ez = s.body.z;
    const dx = t.x - ex, dy = t.y + y - ey, dz = t.z - ez;
    s.yaw = Math.atan2(-dx, -dz); s.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  };
  return { s, t, aim };
}

test("rifle: 26 per body hit, headshot x2.2, kills in 4 body shots, the kill is counted once", () => {
  const { s, t, aim } = setup(4);
  aim(1.1);
  s.tick(1 / 60, { ...IDLE, fire: true, firePressed: true });
  assert.equal(t.hp, 74); assert.equal(s.stats.hits, 1);
  for (let i = 0; i < 80 && t.alive; i++) { aim(1.1); s.tick(1 / 60, { ...IDLE, fire: true }); }
  assert.ok(!t.alive && s.stats.kills === 1, `kills=${s.stats.kills} hp=${t.hp}`);
  const h = setup(4);
  h.aim(1.66);
  h.s.tick(1 / 60, { ...IDLE, fire: true, firePressed: true });
  assert.equal(h.t.hp, 100 - Math.round(26 * 2.2));
});

test("sniper: a body shot kills a 100 hp target in one, a leg shot does 75; the scope zooms", () => {
  const a = setup(6); a.aim(1.1);
  a.s.tick(1 / 60, { ...IDLE, scopePressed: true });
  assert.equal(a.s.scopeFov, 30);
  a.s.tick(1 / 60, { ...IDLE, scopePressed: true });
  assert.equal(a.s.scopeFov, 12);
  a.aim(1.1); a.s.tick(1 / 60, { ...IDLE, firePressed: true });
  assert.ok(!a.t.alive, "one body shot");
  const b = setup(6); b.aim(0.3); b.s.tick(1 / 60, { ...IDLE, firePressed: true });
  assert.equal(b.t.hp, 25);
});

test("shotgun: pellets spread and add up; the damage drops with distance", () => {
  const { s, t, aim } = setup(5);
  aim(1.1);
  s.tick(1 / 60, { ...IDLE, firePressed: true });
  assert.ok(t.hp < 100 && s.stats.hits === 1, `8 m: hp ${t.hp}`);
  assert.ok(100 - t.hp <= 9 * 10 * 1.6);
});

test("a wall (or a crate) between you and the target blocks the shot", () => {
  const s = new Session(map, seeded());
  const t = s.targets[0];
  s.body.x = t.x; s.body.z = t.z + 9; s.body.y = 0;
  // put a solid right in front of the player
  s.map.solids.push({ x0: t.x - 3, y0: 0, z0: t.z + 7, x1: t.x + 3, y1: 4, z1: t.z + 7.4, mat: "wall" });
  s.switchWeapon(4);
  for (let i = 0; i < 40; i++) s.tick(1 / 60, IDLE);
  const ex = s.body.x, ey = 1.62, ez = s.body.z, dx = t.x - ex, dy = t.y + 1.1 - ey, dz = t.z - ez;
  s.yaw = Math.atan2(-dx, -dz); s.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  s.tick(1 / 60, { ...IDLE, firePressed: true });
  s.map.solids.pop();
  assert.equal(t.hp, 100);
});

test("ammo: firing uses the magazine, R reloads from the reserve after the reload time, an empty magazine reloads by itself", () => {
  const { s } = setup(4);
  const w = s.weapon;
  for (let i = 0; i < 10; i++) { s.tick(1 / 60, { ...IDLE, fire: true, firePressed: true }); for (let k = 0; k < 8; k++) s.tick(1 / 60, IDLE); }
  assert.equal(s.state.mag, w.mag - 10);
  s.tick(1 / 60, { ...IDLE, reloadPressed: true });
  assert.ok(s.reloading);
  for (let i = 0; i < Math.ceil(w.reloadTime * 60) + 2; i++) s.tick(1 / 60, IDLE);
  assert.ok(!s.reloading && s.state.mag === w.mag && s.state.reserve === w.reserve - 10, `mag ${s.state.mag} reserve ${s.state.reserve}`);
  s.state.mag = 1;
  s.tick(1 / 60, { ...IDLE, fire: true, firePressed: true });
  assert.equal(s.state.mag, 0);
  assert.ok(s.reloading, "empty: reloads");
});

test("switching weapons cancels a reload and takes time", () => {
  const { s } = setup(4);
  s.state.mag = 5;
  s.tick(1 / 60, { ...IDLE, reloadPressed: true });
  assert.ok(s.reloading);
  s.tick(1 / 60, { ...IDLE, slot: 2 });
  assert.ok(!s.reloading && s.slot === 2 && s.switching);
  const before = s.stats.shots;
  s.tick(1 / 60, { ...IDLE, firePressed: true });
  assert.equal(s.stats.shots, before, "can not shoot while drawing");
  s.tick(1 / 60, { ...IDLE, lastWeaponPressed: true });
  assert.equal(s.slot, 4);
});

test("a hidden pop-up target takes no hits, a dead one respawns after 3 s", () => {
  const { s, t, aim } = setup(4, "popup");
  t.visible = false; t.phase = 3; // phase % 4.5 >= 2.4: hidden (updateTargets keeps it hidden)
  aim(1.1);
  s.tick(1 / 60, { ...IDLE, firePressed: true });
  assert.equal(t.hp, 100);
  const k = setup(6); k.aim(1.1);
  k.s.tick(1 / 60, { ...IDLE, firePressed: true });
  assert.ok(!k.t.alive);
  for (let i = 0; i < 60 * 3.2; i++) k.s.tick(1 / 60, IDLE);
  assert.ok(k.t.alive && k.t.hp === 100, "respawned");
});

test("every target spot is free of solids", () => {
  assert.ok(map.targetSpots.length >= 10, `${map.targetSpots.length} spots`);
  for (const sp of map.targetSpots) {
    const o = { x: sp.x, y: 0.9, z: sp.z };
    assert.ok(!map.solids.some((b) => o.x > b.x0 && o.x < b.x1 && o.z > b.z0 && o.z < b.z1 && b.y1 > 0.2), `spot ${sp.x},${sp.z} inside a solid`);
    assert.ok(rayBody({ x: sp.x, y: 1.1, z: sp.z + 5 }, { x: 0, y: 0, z: -1 }, 10, sp.x, sp.y, sp.z, 0)?.part === "body");
  }
});
