// Player movement: a standing / crouching box walking on axis-aligned solids, with gravity, jumping and automatic step-up.
import type { Body, Box, MoveCmd } from "./types.ts";
import { CROUCH_H, HALF_W, STAND_H } from "./hit.ts";

export const WALK = 5.0, SPRINT = 7.0, CROUCH_SPEED = 2.6, GRAVITY = 24, JUMP_V = 8.0, STEP_H = 0.45;
const GROUND_ACCEL = 60, AIR_ACCEL = 14, FRICTION = 10;
const EPS = 0.001;

export const newBody = (x: number, y: number, z: number): Body => ({ x, y, z, vx: 0, vy: 0, vz: 0, onGround: false, crouch: 0 });
export const bodyHeight = (crouch: number): number => STAND_H + (CROUCH_H - STAND_H) * crouch;

/** does a body box at (x, y, z) with height h overlap a solid? (returns the first one) */
function hits(solids: readonly Box[], x: number, y: number, z: number, h: number): Box | null {
  for (const b of solids) {
    if (x + HALF_W > b.x0 && x - HALF_W < b.x1 && y + h > b.y0 && y < b.y1 && z + HALF_W > b.z0 && z - HALF_W < b.z1) return b;
  }
  return null;
}

export function stepBody(p: Body, cmd: MoveCmd, dt: number, solids: readonly Box[], half: number): void {
  // crouch: smooth, and never stand up inside a ceiling
  const wantCrouch = cmd.crouch ? 1 : 0;
  const nextCrouch = p.crouch + Math.sign(wantCrouch - p.crouch) * Math.min(Math.abs(wantCrouch - p.crouch), dt * 9);
  if (nextCrouch >= p.crouch || !hits(solids, p.x, p.y, p.z, bodyHeight(nextCrouch))) p.crouch = nextCrouch;
  else if (wantCrouch === 0) p.crouch = Math.max(p.crouch, nextCrouch); // blocked: stay low

  // wish direction from the view yaw (yaw 0 faces -Z)
  const sy = Math.sin(cmd.yaw), cy = Math.cos(cmd.yaw);
  let wx = -sy * cmd.fwd + cy * cmd.strafe;
  let wz = -cy * cmd.fwd - sy * cmd.strafe;
  const wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; }
  const crouched = p.crouch > 0.5;
  const speed = (crouched ? CROUCH_SPEED : cmd.sprint && cmd.fwd > 0 ? SPRINT : WALK) * cmd.speedMult;
  const tx = wx * speed, tz = wz * speed;

  if (p.onGround) {
    if (wl > 0.01) {
      const a = Math.min(1, GROUND_ACCEL * dt / Math.max(speed, 1));
      p.vx += (tx - p.vx) * a; p.vz += (tz - p.vz) * a;
    } else {
      const f = Math.max(0, 1 - FRICTION * dt);
      p.vx *= f; p.vz *= f;
    }
    if (cmd.jump) { p.vy = JUMP_V; p.onGround = false; }
  } else {
    const a = Math.min(1, AIR_ACCEL * dt / Math.max(speed, 1));
    if (wl > 0.01) { p.vx += (tx - p.vx) * a; p.vz += (tz - p.vz) * a; }
  }
  if (!p.onGround) p.vy -= GRAVITY * dt;

  const h = bodyHeight(p.crouch);
  // X then Z: slide along walls, step up small ledges when on the ground
  for (const axis of ["x", "z"] as const) {
    const v = axis === "x" ? p.vx : p.vz;
    if (v === 0) continue;
    const nx = axis === "x" ? p.x + v * dt : p.x, nz = axis === "z" ? p.z + v * dt : p.z;
    const hit = hits(solids, nx, p.y, nz, h);
    if (!hit) { p.x = nx; p.z = nz; continue; }
    const rise = hit.y1 - p.y;
    // step up a small ledge: walking, or near the top of a jump (so a 1.6 m crate can be mounted with a jump)
    if ((p.onGround || p.vy < 3) && rise > 0 && rise <= STEP_H && !hits(solids, nx, hit.y1 + EPS, nz, h)) { p.x = nx; p.z = nz; p.y = hit.y1 + EPS; if (p.vy < 0) p.vy = 0; p.onGround = true; continue; }
    if (axis === "x") { p.x = v > 0 ? hit.x0 - HALF_W - EPS : hit.x1 + HALF_W + EPS; p.vx = 0; }
    else { p.z = v > 0 ? hit.z0 - HALF_W - EPS : hit.z1 + HALF_W + EPS; p.vz = 0; }
  }
  // Y
  p.y += p.vy * dt;
  p.onGround = false;
  const yhit = hits(solids, p.x, p.y, p.z, h);
  if (yhit) {
    if (p.vy <= 0) { p.y = yhit.y1 + EPS; p.onGround = true; }
    else p.y = yhit.y0 - h - EPS;
    p.vy = 0;
  } else if (p.vy <= 0 && hits(solids, p.x, p.y - 0.03, p.z, h)) {
    p.onGround = true; p.vy = 0; // resting just above a surface
  }
  if (p.onGround && p.vy < 0) p.vy = 0;
  // the playable square (the outer walls already stop it; this only guards a bug)
  const lim = half - HALF_W;
  p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
  if (p.y < -20) { p.y = 0; p.vy = 0; }
}
