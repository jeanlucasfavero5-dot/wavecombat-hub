// Short-lived effects: tracers, sparks and bullet holes. All pooled; nothing allocates while playing.
import * as THREE from "three";

interface Tracer { mesh: THREE.Mesh; life: number }
interface Spark { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number }

export class Fx {
  private tracers: Tracer[] = [];
  private sparks: Spark[] = [];
  private holes: THREE.Mesh[] = [];
  private holeNext = 0;
  private tracerNext = 0;
  private sparkNext = 0;
  private tmp = new THREE.Vector3();
  private up = new THREE.Vector3(0, 0, 1);

  constructor(private scene: THREE.Scene) {
    const tm = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const tg = new THREE.BoxGeometry(0.012, 0.012, 1);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(tg, tm.clone()); m.visible = false; scene.add(m); this.tracers.push({ mesh: m, life: 0 }); }
    const sg = new THREE.BoxGeometry(0.025, 0.025, 0.025);
    for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0xffd27a })); m.visible = false; scene.add(m); this.sparks.push({ mesh: m, vx: 0, vy: 0, vz: 0, life: 0 }); }
    const hg = new THREE.CircleGeometry(0.05, 10), hm = new THREE.MeshBasicMaterial({ color: 0x15130f, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(hg, hm); m.visible = false; scene.add(m); this.holes.push(m); }
  }

  tracer(from: THREE.Vector3, to: { x: number; y: number; z: number }): void {
    const t = this.tracers[this.tracerNext++ % this.tracers.length];
    const len = Math.max(0.1, from.distanceTo(this.tmp.set(to.x, to.y, to.z)));
    t.mesh.position.copy(from).add(this.tmp).multiplyScalar(0.5);
    t.mesh.lookAt(this.tmp.set(to.x, to.y, to.z));
    t.mesh.scale.set(1, 1, len);
    t.mesh.visible = true; t.life = 0.07;
    (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
  }

  impact(p: { x: number; y: number; z: number }, n: { x: number; y: number; z: number }, onTarget: boolean): void {
    const count = onTarget ? 5 : 7;
    for (let i = 0; i < count; i++) {
      const s = this.sparks[this.sparkNext++ % this.sparks.length];
      s.mesh.position.set(p.x, p.y, p.z);
      const sp = 1.5 + Math.random() * 3;
      s.vx = n.x * sp + (Math.random() - 0.5) * 2.5; s.vy = n.y * sp + Math.random() * 1.5; s.vz = n.z * sp + (Math.random() - 0.5) * 2.5;
      s.life = 0.25 + Math.random() * 0.2;
      (s.mesh.material as THREE.MeshBasicMaterial).color.setHex(onTarget ? 0xff6a4a : 0xffd27a);
      s.mesh.visible = true;
    }
    if (!onTarget) {
      const h = this.holes[this.holeNext++ % this.holes.length];
      h.position.set(p.x + n.x * 0.012, p.y + n.y * 0.012, p.z + n.z * 0.012);
      h.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
      h.visible = true;
    }
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (!t.mesh.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false; else (t.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.9, t.life * 14);
    }
    for (const s of this.sparks) {
      if (!s.mesh.visible) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      s.vy -= 12 * dt;
      s.mesh.position.x += s.vx * dt; s.mesh.position.y += s.vy * dt; s.mesh.position.z += s.vz * dt;
    }
  }
}
