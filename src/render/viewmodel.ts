// The weapon in the player's hands: built from boxes, one model per weapon, with bob, recoil, reload and switch animation.
import * as THREE from "three";
import { WEAPONS, type WeaponDef } from "../sim/weapons.ts";

// no environment map in the scene: a high metalness would render black, and the world's sun may not reach the weapon, so each color also glows a little
const mat = (c: number, rough = 0.6, metal = 0.2): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: Math.min(metal, 0.2), emissive: c, emissiveIntensity: 0.4 });
const bx = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rx = 0): THREE.Mesh => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); o.rotation.x = rx;
  return o;
};

interface Model { group: THREE.Group; muzzle: THREE.Object3D }

function buildModel(w: WeaponDef): Model {
  const g = new THREE.Group();
  const body = mat(w.look.color, 0.5, 0.5), acc = mat(w.look.accent, 0.4, 0.3), dark = mat(0x16181b, 0.7, 0.3);
  const muzzle = new THREE.Object3D();
  switch (w.kind) {
    case "knife":
      g.add(bx(0.025, 0.06, 0.34, mat(0xe6ebef, 0.15, 0.95), 0, 0.0, -0.24), bx(0.03, 0.025, 0.3, mat(0xffffff, 0.1, 1), 0, 0.03, -0.22), bx(0.04, 0.045, 0.14, dark, 0, -0.005, -0.01), bx(0.07, 0.03, 0.025, acc, 0, 0, -0.07));
      g.rotation.set(0.35, 0.15, 0.2);
      muzzle.position.set(0, 0, -0.42); break;
    case "pistol":
      g.add(bx(0.05, 0.06, 0.24, body, 0, 0, -0.1), bx(0.045, 0.11, 0.06, dark, 0, -0.08, -0.02, 0.2), bx(0.02, 0.02, 0.02, acc, 0, 0.038, -0.21));
      muzzle.position.set(0, 0.0, -0.23); break;
    case "smg":
      g.add(bx(0.06, 0.09, 0.4, body, 0, 0, -0.15), bx(0.04, 0.16, 0.06, dark, 0, -0.12, -0.12), bx(0.05, 0.1, 0.06, dark, 0, -0.08, 0.04, 0.2), bx(0.03, 0.02, 0.2, acc, 0, 0.055, -0.2), bx(0.05, 0.07, 0.14, dark, 0, -0.01, 0.12));
      muzzle.position.set(0, 0.01, -0.38); break;
    case "rifle":
      g.add(bx(0.06, 0.09, 0.5, body, 0, 0, -0.18), bx(0.05, 0.06, 0.26, dark, 0, -0.005, -0.5), bx(0.045, 0.16, 0.07, dark, 0, -0.12, -0.14, 0.25), bx(0.05, 0.1, 0.07, dark, 0, -0.08, 0.06, 0.2),
        bx(0.05, 0.1, 0.22, body, 0, -0.01, 0.2), bx(0.03, 0.03, 0.04, acc, 0, 0.065, -0.35), bx(0.03, 0.03, 0.04, acc, 0, 0.065, -0.05));
      muzzle.position.set(0, 0.0, -0.64); break;
    case "shotgun":
      g.add(bx(0.05, 0.05, 0.62, body, 0, 0.0, -0.3), bx(0.04, 0.04, 0.5, dark, 0, -0.045, -0.26), bx(0.06, 0.07, 0.16, mat(0x6b4a2e, 0.8, 0), 0, -0.045, -0.3), bx(0.06, 0.09, 0.3, mat(0x6b4a2e, 0.8, 0), 0, -0.03, 0.15, 0.1), bx(0.04, 0.025, 0.05, acc, 0, 0.04, -0.58));
      muzzle.position.set(0, 0.0, -0.62); break;
    case "sniper": {
      g.add(bx(0.05, 0.07, 0.8, body, 0, 0, -0.3), bx(0.03, 0.03, 0.4, dark, 0, 0, -0.9), bx(0.06, 0.1, 0.3, mat(0x2c3138, 0.7, 0.2), 0, -0.04, 0.2, 0.08), bx(0.04, 0.11, 0.06, dark, 0, -0.1, -0.02, 0.2));
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12), dark);
      scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.075, -0.25);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 12), acc as THREE.Material);
      lens.position.set(0, 0.075, -0.1); lens.rotation.y = Math.PI;
      g.add(scope, lens);
      muzzle.position.set(0, 0, -1.1); break;
    }
  }
  g.add(muzzle);
  // hands
  const skin = mat(0xd9b08c, 0.8, 0), sleeve = mat(0x394032, 0.9, 0);
  const rh = bx(0.07, 0.07, 0.09, skin, 0.0, -0.1, 0.0); const fz = w.kind === "pistol" ? -0.02 : -w.look.len * 0.5;
  const lh = bx(0.07, 0.07, 0.09, skin, w.kind === "pistol" ? -0.04 : -0.02, w.kind === "pistol" ? -0.09 : -0.07, fz);
  const rs = bx(0.075, 0.075, 0.22, sleeve, 0.02, -0.13, 0.14); rs.rotation.x = -0.35;
  const ls = bx(0.07, 0.07, 0.22, sleeve, -0.08, -0.1, fz + 0.17); ls.rotation.set(-0.1, 0.35, 0);
  if (w.kind !== "knife") g.add(lh, ls);
  g.add(rh, rs);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = false; } });
  return { group: g, muzzle };
}

export class ViewModel {
  readonly root = new THREE.Group();
  private models: Model[] = WEAPONS.map(buildModel);
  private cur = -1;
  private kick = 0;
  private swing = 0;
  private bob = 0;
  private flash: THREE.Mesh;
  private flashLight: THREE.PointLight;
  private flashT = 0;
  hidden = false;

  constructor() {
    for (const m of this.models) { m.group.visible = false; this.root.add(m.group); }
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d")!; const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, "rgba(255,255,230,1)"); gr.addColorStop(0.35, "rgba(255,190,80,0.8)"); gr.addColorStop(1, "rgba(255,120,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.visible = false;
    this.flashLight = new THREE.PointLight(0xffb060, 0, 6);
    this.root.add(this.flash, this.flashLight);
  }

  /** world position of the muzzle of the current weapon */
  muzzleWorld(out: THREE.Vector3): THREE.Vector3 { return this.models[Math.max(0, this.cur)].muzzle.getWorldPosition(out); }

  fire(power = 1): void {
    this.kick = Math.min(1.4, this.kick + power);
    const w = WEAPONS[this.cur];
    if (w && w.kind !== "knife") { this.flashT = 0.05; }
  }
  swingKnife(): void { this.swing = 1; }

  update(dt: number, slot: number, moveSpeed: number, onGround: boolean, sprinting: boolean, reloadProgress: number, switching: number, scoped: boolean, lookDx: number, lookDy: number, crouch: number): void {
    if (slot !== this.cur) {
      if (this.cur >= 0) this.models[this.cur].group.visible = false;
      this.cur = slot; this.models[slot].group.visible = true;
    }
    this.kick = Math.max(0, this.kick - dt * 9);
    this.swing = Math.max(0, this.swing - dt * 4.5);
    this.flashT = Math.max(0, this.flashT - dt);
    const w = WEAPONS[this.cur];
    this.bob += dt * (3 + moveSpeed * 1.4) * (onGround ? 1 : 0.2);
    const bobAmt = onGround ? Math.min(1, moveSpeed / 5) : 0;
    const bx = Math.sin(this.bob) * 0.012 * bobAmt, by = Math.abs(Math.cos(this.bob)) * 0.014 * bobAmt;
    const reload = reloadProgress > 0 ? Math.sin(Math.min(1, reloadProgress) * Math.PI) : 0;
    const raise = switching > 0 ? switching / 0.4 : 0;
    const sprintTilt = sprinting ? 1 : 0;
    this.root.visible = !(scoped || this.hidden);
    const k = this.kick;
    this.root.position.set(0.19 + bx - lookDx * 0.00004 - sprintTilt * 0.04, -0.21 + by - reload * 0.14 - raise * 0.35 - crouch * 0.01 - sprintTilt * 0.05, -0.38 + k * 0.05 + (w.kind === "knife" ? 0.08 : 0));
    this.root.rotation.set(k * 0.05 + reload * 0.5 - lookDy * 0.00005 + sprintTilt * 0.2, -sprintTilt * 0.5 + (w.kind === "knife" ? -this.swing * 0.9 : 0), reload * 0.35 - bx * 1.5 + (w.kind === "knife" ? this.swing * 0.6 : 0));
    if (w.kind === "knife") this.root.position.x -= this.swing * 0.1;
    const m = this.models[this.cur].muzzle;
    this.flash.visible = this.flashT > 0 && !this.root.visible === false;
    this.flash.position.copy(m.position).add(this.models[this.cur].group.position);
    this.flash.rotation.z = Math.random() * 6.28;
    this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
    this.flashLight.position.copy(this.flash.position);
    this.flashLight.intensity = this.flashT > 0 ? 3 : 0;
  }
}
