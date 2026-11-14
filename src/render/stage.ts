// The 3D view: renderer, lights, the map built from its solids, the targets and the player's camera.
import * as THREE from "three";
import type { Box, MapDef, MatKind } from "../sim/types.ts";
import type { Session, Target } from "../game/session.ts";
import { makeTextures } from "./textures.ts";
import { buildDummy, poseAvatar, type AvatarView } from "./avatars.ts";
import { ViewModel } from "./viewmodel.ts";
import { Fx } from "./fx.ts";

const TILE: Partial<Record<MatKind, number>> = { floor: 4, wall: 4, crate: 1.6, "container-red": 2.4, "container-blue": 2.4, "container-green": 2.4, concrete: 2, metal: 1.5, grate: 1 };

/** BoxGeometry whose UVs repeat every `tile` meters, so a big wall and a small crate show the same texel size */
function tiledBox(b: Box, tile: number): THREE.BoxGeometry {
  const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0;
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const sizes: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, (uv.getX(i) * sizes[f][0]) / tile, (uv.getY(i) * sizes[f][1]) / tile);
  }
  return g;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly view = new ViewModel();
  readonly fx: Fx;
  private sun: THREE.DirectionalLight;
  private dummies = new Map<number, AvatarView>();
  private fovNow: number;
  hFov = 90;
  private tmpV = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement, map: MapDef, shadows: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x9db7cf);
    this.scene.fog = new THREE.Fog(0xb4c6d6, 45, 150);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.04, 400);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);
    this.camera.add(this.view.root);
    this.fovNow = this.hFov;

    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5b5348, 1.05));
    this.sun = new THREE.DirectionalLight(0xfff0d2, 1.9);
    this.sun.position.set(-18, 34, 14);
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 5; sc.far = 90;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.setShadows(shadows);

    const T = makeTextures();
    const mats = new Map<MatKind, THREE.MeshStandardMaterial>();
    const matFor = (k: MatKind): THREE.MeshStandardMaterial => {
      let m = mats.get(k);
      if (!m) { m = new THREE.MeshStandardMaterial({ map: T[k] ?? T.concrete, roughness: k === "metal" || k === "grate" ? 0.55 : 0.88, metalness: k === "metal" ? 0.3 : k.startsWith("container") ? 0.15 : 0.05 }); mats.set(k, m); }
      return m;
    };
    for (const b of map.solids) {
      const mesh = new THREE.Mesh(tiledBox(b, TILE[b.mat] ?? 2), matFor(b.mat));
      mesh.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      mesh.castShadow = b.mat !== "floor"; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.scene.add(mesh);
    }
    this.fx = new Fx(this.scene);
    this.resize();
    addEventListener("resize", () => this.resize());
  }

  setShadows(on: boolean): void { this.renderer.shadowMap.enabled = on; this.sun.castShadow = on; this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; }); }

  resize(): void {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyFov(this.fovNow);
  }

  /** horizontal FOV in degrees -> three's vertical FOV */
  private applyFov(hDeg: number): void {
    const a = this.camera.aspect, hr = (hDeg * Math.PI) / 180;
    this.camera.fov = (2 * Math.atan(Math.tan(hr / 2) / Math.max(a, 1e-3)) * 180) / Math.PI;
    this.camera.updateProjectionMatrix();
  }

  private dummyView(t: Target): AvatarView {
    let v = this.dummies.get(t.id);
    if (!v) { v = buildDummy(); this.scene.add(v.group); this.dummies.set(t.id, v); }
    return v;
  }

  /** camera + targets for this frame. alpha: how far between the last two ticks. */
  update(s: Session, alpha: number, dt: number, lookDx: number, lookDy: number): void {
    const b = s.body, p = s.prev;
    const x = p.x + (b.x - p.x) * alpha, y = p.y + (b.y - p.y) * alpha, z = p.z + (b.z - p.z) * alpha;
    this.camera.position.set(x, y + s.eyeHeight, z);
    this.camera.rotation.set(s.pitch, s.yaw, 0);
    // field of view: the scope zooms, with a short ease
    const target = s.scopeFov > 0 ? s.scopeFov : this.hFov * (s.weapon.kind === "sniper" ? 1 : 1);
    this.fovNow += (target - this.fovNow) * Math.min(1, dt * 14);
    this.applyFov(this.fovNow);

    const speed = Math.hypot(b.vx, b.vz);
    this.view.update(dt, s.slot - 1, speed, b.onGround, speed > 6 && s.zoom === 0, s.reloadProgress, s.switching ? 0.4 : 0, s.scopeFov > 0, lookDx, lookDy, b.crouch);
    this.fx.update(dt);

    for (const t of s.targets) {
      const v = this.dummyView(t);
      v.group.visible = t.visible && (t.alive || t.sinceDeath < 1.2);
      v.group.position.set(t.x, t.y, t.z);
      v.group.rotation.y = t.yaw;
      poseAvatar(v, t.sinceHit, t.alive, t.sinceDeath, t.hp / 100);
      v.bar.quaternion.copy(v.group.quaternion).invert().multiply(this.camera.quaternion); // the bar always faces the camera
    }
  }

  /** screen position (px) of a world point, or null behind the camera */
  project(p: { x: number; y: number; z: number }): { x: number; y: number } | null {
    this.tmpV.set(p.x, p.y, p.z).project(this.camera);
    if (this.tmpV.z > 1) return null;
    return { x: (this.tmpV.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-this.tmpV.y * 0.5 + 0.5) * this.canvas.clientHeight };
  }

  draw(): void { this.renderer.render(this.scene, this.camera); }
}
