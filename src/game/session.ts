// The local game session: one player with the whole arsenal, in the "Treino" field with training targets.
// All rules live here (weapons, recoil, reload, damage); drawing and sound listen to `ev`. The same rules will run on the server.
import type { Body, MapDef, MoveCmd, Vec3 } from "../sim/types.ts";
import { WEAPONS, type WeaponDef } from "../sim/weapons.ts";
import { bodyHeight, newBody, stepBody } from "../sim/movement.ts";
import { EYE_CROUCH, EYE_STAND, rayBody, rayWorld, type Part } from "../sim/hit.ts";
import type { InputFrame } from "../core/input.ts";

export type TargetKind = "static" | "strafe" | "popup";

export interface Target {
  id: number;
  kind: TargetKind;
  x: number; y: number; z: number;
  homeX: number; homeZ: number;
  yaw: number;
  hp: number;
  alive: boolean;
  /** popup targets hide between exposures: a hidden one takes no hits */
  visible: boolean;
  phase: number;
  respawnAt: number;
  /** seconds since the last hit (for the flash) */
  sinceHit: number;
  /** seconds since death (for the fall animation) */
  sinceDeath: number;
}

export interface WeaponState { mag: number; reserve: number }

export interface Stats { shots: number; hits: number; kills: number; headshots: number; damage: number; streak: number; bestStreak: number }

export interface ShotInfo { weapon: WeaponDef; origin: Vec3; dir: Vec3; ends: Vec3[]; hitTarget: boolean }
export interface HitInfo { target: Target; dmg: number; part: Part; killed: boolean; point: Vec3 }

export interface SessionEvents {
  shot(i: ShotInfo): void;
  impact(p: Vec3, n: Vec3, onTarget: boolean): void;
  hit(i: HitInfo): void;
  empty(): void;
  reloadStart(w: WeaponDef): void;
  reloadEnd(w: WeaponDef): void;
  switchTo(w: WeaponDef): void;
  step(sprint: boolean): void;
  land(hard: boolean): void;
  swing(): void;
  scope(level: number): void;
  targetRespawn(t: Target): void;
}

const noop = () => {};
const rad = (d: number) => (d * Math.PI) / 180;
const MAX_PITCH = rad(89);

export class Session {
  readonly map: MapDef;
  readonly body: Body;
  yaw = 0;
  pitch = 0;
  hp = 100;
  time = 0;
  readonly weapons: WeaponState[];
  slot = 4; // 1-based: starts with the rifle
  lastSlot = 2;
  readonly targets: Target[] = [];
  readonly stats: Stats = { shots: 0, hits: 0, kills: 0, headshots: 0, damage: 0, streak: 0, bestStreak: 0 };
  /** the player's previous tick position (render interpolation) */
  prev = { x: 0, y: 0, z: 0 };
  readonly ev: SessionEvents = {
    shot: noop, impact: noop, hit: noop, empty: noop, reloadStart: noop, reloadEnd: noop, switchTo: noop, step: noop, land: noop, swing: noop, scope: noop, targetRespawn: noop,
  };

  private cooldown = 0;
  private reloadLeft = 0;
  private switchLeft = 0;
  private zoomLevel = 0;
  private recoilDebt = 0;
  private bloom = 0;
  private sinceShot = 10;
  private stepDist = 0;
  private wasGround = true;
  private fallSpeed = 0;
  private nextId = 1;
  private rng: () => number;

  constructor(map: MapDef, rng: () => number = Math.random) {
    this.map = map;
    this.rng = rng;
    const sp = map.spawns[0];
    this.body = newBody(sp.x, sp.y, sp.z);
    this.prev = { x: sp.x, y: sp.y, z: sp.z };
    this.yaw = sp.yaw;
    this.weapons = WEAPONS.map((w) => ({ mag: w.mag, reserve: w.reserve }));
    const kinds: TargetKind[] = ["static", "static", "static", "static", "strafe", "strafe", "strafe", "strafe", "popup", "popup"];
    const spots = [...map.targetSpots];
    kinds.forEach((k, i) => this.spawnTarget(k, spots[i % spots.length]));
  }

  get weapon(): WeaponDef { return WEAPONS[this.slot - 1]; }
  get state(): WeaponState { return this.weapons[this.slot - 1]; }
  get reloading(): boolean { return this.reloadLeft > 0; }
  get reloadProgress(): number { const w = this.weapon; if (!w.mag || this.reloadLeft <= 0) return 0; return 1 - this.reloadLeft / this.reloadTotal(); }
  get switching(): boolean { return this.switchLeft > 0; }
  get zoom(): number { return this.zoomLevel; }
  /** the scope field of view in degrees, or 0 when not scoped */
  get scopeFov(): number { return this.zoomLevel > 0 ? this.weapon.zoom[this.zoomLevel - 1] : 0; }
  get eyeHeight(): number { return EYE_STAND + (EYE_CROUCH - EYE_STAND) * this.body.crouch; }
  get moving(): boolean { return Math.hypot(this.body.vx, this.body.vz) > 0.5; }

  private reloadTotal(): number {
    const w = this.weapon;
    if (!w.perShellReload) return w.reloadTime;
    return Math.max(1, w.mag - this.state.mag) * w.reloadTime;
  }

  private spawnTarget(kind: TargetKind, spot: Vec3): Target {
    const t: Target = { id: this.nextId++, kind, x: spot.x, y: spot.y, z: spot.z, homeX: spot.x, homeZ: spot.z, yaw: 0, hp: 100, alive: true, visible: true, phase: this.rng() * 6.28, respawnAt: 0, sinceHit: 9, sinceDeath: 0 };
    this.faceYou(t);
    this.targets.push(t);
    return t;
  }

  private faceYou(t: Target): void { t.yaw = Math.atan2(-(this.body.x - t.x), -(this.body.z - t.z)); }

  /** mouse look: applied every frame by the caller, in radians */
  look(dYaw: number, dPitch: number): void {
    this.yaw -= dYaw;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - dPitch));
  }

  /** one fixed tick */
  tick(dt: number, inp: InputFrame): void {
    this.time += dt;
    this.prev = { x: this.body.x, y: this.body.y, z: this.body.z };
    this.sinceShot += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 6);

    this.handleSwitch(inp);
    if (this.switchLeft > 0) { this.switchLeft -= dt; if (this.switchLeft < 0) this.switchLeft = 0; }
    this.handleScope(inp);
    this.handleReload(inp, dt);
    this.handleFire(inp);

    // recoil recovery: the view comes back down a part of the way
    if (this.recoilDebt > 0) {
      const back = Math.min(this.recoilDebt, Math.max(0.02, this.recoilDebt * 5) * dt);
      this.recoilDebt -= back;
      this.pitch = Math.max(-MAX_PITCH, this.pitch - back * 0.6);
    }

    const w = this.weapon;
    const cmd: MoveCmd = {
      fwd: inp.fwd, strafe: inp.strafe, jump: inp.jump, sprint: inp.sprint && !this.reloading && this.zoomLevel === 0, crouch: inp.crouch, yaw: this.yaw,
      speedMult: w.speedMult * (this.zoomLevel > 0 ? 0.6 : 1) * (this.reloading ? 0.9 : 1),
    };
    this.fallSpeed = Math.min(this.fallSpeed, this.body.vy);
    const gx = this.body.x, gz = this.body.z;
    stepBody(this.body, cmd, dt, this.map.solids, this.map.half);
    if (this.body.onGround) {
      this.stepDist += Math.hypot(this.body.x - gx, this.body.z - gz);
      const stride = cmd.sprint ? 2.0 : 2.6;
      if (this.stepDist > stride && this.moving && this.body.crouch < 0.5) { this.stepDist = 0; this.ev.step(cmd.sprint); }
      if (!this.wasGround) { this.ev.land(this.fallSpeed < -8); this.fallSpeed = 0; }
    }
    this.wasGround = this.body.onGround;

    this.updateTargets(dt);
  }

  private handleSwitch(inp: InputFrame): void {
    let to = 0;
    if (inp.slot >= 1 && inp.slot <= WEAPONS.length) to = inp.slot;
    else if (inp.lastWeaponPressed) to = this.lastSlot;
    else if (inp.wheel !== 0) to = ((this.slot - 1 + inp.wheel + WEAPONS.length) % WEAPONS.length) + 1;
    if (to && to !== this.slot) this.switchWeapon(to);
  }

  switchWeapon(to: number): void {
    this.lastSlot = this.slot;
    this.slot = to;
    this.reloadLeft = 0;
    this.zoomLevel = 0;
    this.switchLeft = 0.4;
    this.cooldown = Math.max(this.cooldown, 0.2);
    this.recoilDebt = 0;
    this.ev.switchTo(this.weapon);
  }

  private handleScope(inp: InputFrame): void {
    if (!inp.scopePressed || this.weapon.zoom.length === 0 || this.switchLeft > 0 || this.reloading) return;
    this.zoomLevel = (this.zoomLevel + 1) % (this.weapon.zoom.length + 1);
    this.ev.scope(this.zoomLevel);
  }

  private startReload(): void {
    const w = this.weapon, st = this.state;
    if (!w.mag || st.mag >= w.mag || st.reserve <= 0 || this.reloading || this.switching) return;
    this.zoomLevel = 0;
    this.reloadLeft = this.reloadTotal();
    this.ev.reloadStart(w);
  }

  private handleReload(inp: InputFrame, dt: number): void {
    const w = this.weapon, st = this.state;
    if (inp.reloadPressed) this.startReload();
    if (this.reloadLeft <= 0) return;
    if (w.perShellReload) {
      // a shotgun can be fired mid-reload: the shells loaded so far stay
      const total = this.reloadTotal();
      const shellsLeft = Math.ceil(this.reloadLeft / w.reloadTime);
      this.reloadLeft -= dt;
      const shellsNow = Math.ceil(Math.max(0, this.reloadLeft) / w.reloadTime);
      for (let i = shellsLeft; i > shellsNow; i--) if (st.reserve > 0 && st.mag < w.mag) { st.mag++; st.reserve--; }
      if (this.reloadLeft <= 0 || (inp.firePressed && st.mag > 0)) { this.reloadLeft = 0; this.ev.reloadEnd(w); }
      void total;
    } else {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        this.reloadLeft = 0;
        const need = w.mag - st.mag, take = Math.min(need, st.reserve);
        st.mag += take; st.reserve -= take;
        this.ev.reloadEnd(w);
      }
    }
  }

  private handleFire(inp: InputFrame): void {
    const w = this.weapon, st = this.state;
    const wants = w.auto ? inp.fire : inp.firePressed;
    if (!wants || this.cooldown > 0 || this.switching) return;
    if (this.reloading && !(w.perShellReload && st.mag > 0)) return;
    if (w.kind === "knife") { this.cooldown = 60 / w.rpm; this.ev.swing(); this.shoot(w, true); return; }
    if (st.mag <= 0) {
      this.cooldown = 0.25;
      this.ev.empty();
      this.startReload();
      return;
    }
    st.mag--;
    this.cooldown = 60 / w.rpm;
    this.sinceShot = 0;
    this.shoot(w, false);
    if (st.mag <= 0 && st.reserve > 0 && w.kind !== "sniper") this.startReload();
  }

  /** the cone of the next shot in degrees (the crosshair spreads with it) */
  get spreadNow(): number { return this.spreadDeg(this.weapon); }

  private spreadDeg(w: WeaponDef): number {
    const b = this.body, speed = Math.hypot(b.vx, b.vz);
    let s = w.spread;
    s += w.spreadMove * Math.min(1, speed / 5);
    if (!b.onGround) s += w.spreadAir;
    s *= 1 - 0.3 * b.crouch;
    if (w.kind === "sniper" && this.zoomLevel > 0) s *= speed < 0.5 && b.onGround ? 0 : 1;
    else if (w.kind === "sniper") s += 3;
    if (w.auto) s += this.bloom * 0.35;
    return s;
  }

  private shoot(w: WeaponDef, melee: boolean): void {
    const origin: Vec3 = { x: this.body.x, y: this.body.y + this.eyeHeight, z: this.body.z };
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fwd: Vec3 = { x: -sy * cp, y: sp, z: -cy * cp };
    const right: Vec3 = { x: cy, y: 0, z: -sy };
    const up: Vec3 = { x: sy * sp, y: cp, z: cy * sp };
    const cone = Math.tan(rad(this.spreadDeg(w)));
    const ends: Vec3[] = [];
    const perTarget = new Map<Target, { dmg: number; part: Part; point: Vec3 }>();
    let anyHit = false;

    for (let p = 0; p < w.pellets; p++) {
      const r = cone * Math.sqrt(this.rng()), a = this.rng() * Math.PI * 2;
      let dx = fwd.x + right.x * r * Math.cos(a) + up.x * r * Math.sin(a);
      let dy = fwd.y + up.y * r * Math.sin(a);
      let dz = fwd.z + right.z * r * Math.cos(a) + up.z * r * Math.sin(a);
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      const dir: Vec3 = { x: dx, y: dy, z: dz };
      const wh = rayWorld(origin, dir, w.range, this.map.solids);
      const maxT = wh ? wh.t : w.range;
      let best: { t: Target; part: Part; tt: number; nx: number; ny: number; nz: number } | null = null;
      for (const t of this.targets) {
        if (!t.alive || !t.visible) continue;
        const bh = rayBody(origin, dir, best ? best.tt : maxT, t.x, t.y, t.z, 0);
        if (bh && (!best || bh.hit.t < best.tt)) best = { t, part: bh.part, tt: bh.hit.t, nx: bh.hit.nx, ny: bh.hit.ny, nz: bh.hit.nz };
      }
      if (best) {
        const mult = best.part === "head" ? w.headMult : best.part === "legs" ? w.legMult : 1;
        const fall = best.tt > w.range * 0.5 ? 1 - (1 - w.falloff) * Math.min(1, (best.tt - w.range * 0.5) / (w.range * 0.5)) : 1;
        const dmg = w.damage * mult * fall;
        const pt = { x: origin.x + dx * best.tt, y: origin.y + dy * best.tt, z: origin.z + dz * best.tt };
        ends.push(pt);
        const acc = perTarget.get(best.t);
        if (acc) { acc.dmg += dmg; if (best.part === "head") acc.part = "head"; acc.point = pt; }
        else perTarget.set(best.t, { dmg, part: best.part, point: pt });
        this.ev.impact(pt, { x: best.nx, y: best.ny, z: best.nz }, true);
        anyHit = true;
      } else if (wh) {
        const pt = { x: origin.x + dx * wh.t, y: origin.y + dy * wh.t, z: origin.z + dz * wh.t };
        ends.push(pt);
        if (!melee || p === 0) this.ev.impact(pt, { x: wh.nx, y: wh.ny, z: wh.nz }, false);
      } else {
        ends.push({ x: origin.x + dx * Math.min(w.range, 120), y: origin.y + dy * Math.min(w.range, 120), z: origin.z + dz * Math.min(w.range, 120) });
      }
    }

    if (!melee) {
      this.stats.shots++;
      // view kick
      const kick = rad(w.recoilPitch) * (0.8 + this.rng() * 0.4) * (this.zoomLevel > 0 ? 0.6 : 1) * (1 - 0.25 * this.body.crouch);
      this.pitch = Math.min(MAX_PITCH, this.pitch + kick);
      this.yaw += (this.rng() - 0.5) * 2 * rad(w.recoilYaw);
      this.recoilDebt += kick;
      this.bloom = Math.min(8, this.bloom + 1);
      this.ev.shot({ weapon: w, origin, dir: fwd, ends, hitTarget: anyHit });
    }
    if (anyHit) this.stats.hits++;
    for (const [t, h] of perTarget) {
      const dmg = Math.round(h.dmg);
      t.hp -= dmg;
      t.sinceHit = 0;
      this.stats.damage += dmg;
      const killed = t.hp <= 0;
      if (killed) {
        t.alive = false; t.hp = 0; t.respawnAt = this.time + 3; t.sinceDeath = 0;
        this.stats.kills++; this.stats.streak++; this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
        if (h.part === "head") this.stats.headshots++;
      }
      this.ev.hit({ target: t, dmg, part: h.part, killed, point: h.point });
    }
  }

  private updateTargets(dt: number): void {
    for (const t of this.targets) {
      t.sinceHit += dt;
      if (!t.alive) {
        t.sinceDeath += dt;
        if (this.time >= t.respawnAt) this.respawn(t);
        continue;
      }
      t.phase += dt;
      if (t.kind === "strafe") { t.x = t.homeX + Math.sin(t.phase * 0.9) * 3.5; this.faceYou(t); }
      else if (t.kind === "popup") { const c = t.phase % 4.5; t.visible = c < 2.4; if (t.visible) this.faceYou(t); }
      else this.faceYou(t);
    }
  }

  private respawn(t: Target): void {
    const spots = this.map.targetSpots;
    const spot = spots[Math.floor(this.rng() * spots.length)];
    const kinds: TargetKind[] = ["static", "strafe", "popup"];
    t.kind = kinds[Math.floor(this.rng() * kinds.length)];
    t.x = t.homeX = spot.x; t.z = t.homeZ = spot.z; t.y = spot.y;
    t.hp = 100; t.alive = true; t.visible = true; t.phase = this.rng() * 6.28; t.sinceHit = 9;
    this.faceYou(t);
    this.ev.targetRespawn(t);
  }

  /** the body height now (for the camera) */
  get height(): number { return bodyHeight(this.body.crouch); }
}
