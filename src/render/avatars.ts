// Low-poly people built from boxes: the training dummy (and, later, players and bots in team colors).
import * as THREE from "three";

export interface AvatarView {
  group: THREE.Group;
  parts: THREE.Mesh[];
  mats: THREE.MeshStandardMaterial[];
  bar: THREE.Group;
  barFill: THREE.Mesh;
}

const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/** a person: head, torso, arms, legs. `color` is the vest / team color. The model faces -Z (like the camera). */
export function buildPerson(color: number, skin = 0xd9b08c, withBar = true): AvatarView {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.9 });
  const vest = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23272c, roughness: 0.9 });
  const parts: THREE.Mesh[] = [];
  const add = (m: THREE.Mesh) => { g.add(m); parts.push(m); };
  add(box(0.2, 0.78, 0.22, cloth, -0.13, 0.39, 0));        // legs
  add(box(0.2, 0.78, 0.22, cloth, 0.13, 0.39, 0));
  add(box(0.26, 0.1, 0.34, dark, -0.13, 0.05, -0.04));     // boots
  add(box(0.26, 0.1, 0.34, dark, 0.13, 0.05, -0.04));
  add(box(0.58, 0.66, 0.3, vest, 0, 1.12, 0));             // torso
  add(box(0.17, 0.62, 0.17, cloth, -0.38, 1.1, 0));        // arms
  add(box(0.17, 0.62, 0.17, cloth, 0.38, 1.1, 0));
  add(box(0.14, 0.14, 0.14, skinM, -0.38, 0.74, 0));       // hands
  add(box(0.14, 0.14, 0.14, skinM, 0.38, 0.74, 0));
  add(box(0.3, 0.32, 0.3, skinM, 0, 1.64, 0));             // head
  add(box(0.34, 0.12, 0.34, dark, 0, 1.78, 0));            // cap
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7, depthTest: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.06), new THREE.MeshBasicMaterial({ color: 0x4cff6a, depthTest: false }));
  fill.position.z = 0.001;
  bg.renderOrder = 10; fill.renderOrder = 11;
  bar.add(bg, fill);
  bar.position.y = 2.15;
  bar.visible = withBar;
  g.add(bar);
  return { group: g, parts, mats: [cloth, vest, skinM, dark], bar, barFill: fill };
}

/** the training dummy: orange vest with a white chest ring and a bullseye on the head */
export function buildDummy(): AvatarView {
  const v = buildPerson(0xe8741c, 0xf2f2f2);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.16, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  ring.position.set(0, 1.18, -0.153);
  v.group.add(ring);
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshBasicMaterial({ color: 0xcc2222, side: THREE.DoubleSide }));
  eye.position.set(0, 1.66, -0.153);
  v.group.add(eye);
  return v;
}

/** hit flash and the fall when killed */
export function poseAvatar(v: AvatarView, sinceHit: number, alive: boolean, sinceDeath: number, hpFrac: number): void {
  const flash = Math.max(0, 1 - sinceHit / 0.12);
  for (const m of v.mats) m.emissive.setRGB(flash * 0.9, flash * 0.25, flash * 0.1);
  if (alive) { v.group.rotation.x = 0; v.group.position.y += 0; }
  else { v.group.rotation.x = -Math.min(1, sinceDeath / 0.35) * (Math.PI / 2); }
  v.bar.visible = alive;
  v.barFill.scale.x = Math.max(0.001, hpFrac);
  v.barFill.position.x = -(0.76 * (1 - Math.max(0.001, hpFrac))) / 2;
  (v.barFill.material as THREE.MeshBasicMaterial).color.setHex(hpFrac > 0.5 ? 0x4cff6a : hpFrac > 0.25 ? 0xffd24a : 0xff4a4a);
}
