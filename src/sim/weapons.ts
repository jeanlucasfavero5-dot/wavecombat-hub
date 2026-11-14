// Action Elite weapons: original designs and numbers. Distances are meters, angles degrees, times seconds.

export type WeaponKind = "knife" | "pistol" | "smg" | "rifle" | "shotgun" | "sniper";

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  /** key 1..6 */
  slot: number;
  auto: boolean;
  /** damage per pellet to the body */
  damage: number;
  headMult: number;
  legMult: number;
  pellets: number;
  rpm: number;
  mag: number;
  reserve: number;
  /** total reload time (a shotgun loads shell by shell: this is per shell) */
  reloadTime: number;
  perShellReload: boolean;
  /** cone of the shot, degrees, standing still and aiming */
  spread: number;
  /** extra cone while moving (scaled by speed) and in the air */
  spreadMove: number;
  spreadAir: number;
  /** view kick per shot: pitch up, yaw random +-, degrees */
  recoilPitch: number;
  recoilYaw: number;
  range: number;
  /** damage multiplier at max range (linear from range*0.5) */
  falloff: number;
  speedMult: number;
  /** scope field of view per zoom level (degrees); empty = no scope */
  zoom: number[];
  /** drawing: [length, height] of the model, accent color */
  look: { len: number; color: number; accent: number };
}

export const WEAPONS: WeaponDef[] = [
  { id: "machete", name: "Machete", kind: "knife", slot: 1, auto: false, damage: 45, headMult: 1.5, legMult: 0.8, pellets: 1, rpm: 110, mag: 0, reserve: 0, reloadTime: 0, perShellReload: false,
    spread: 0, spreadMove: 0, spreadAir: 0, recoilPitch: 0, recoilYaw: 0, range: 2.0, falloff: 1, speedMult: 1.1, zoom: [], look: { len: 0.45, color: 0x9aa4ad, accent: 0x2b2f33 } },
  { id: "viper", name: "Viper P9", kind: "pistol", slot: 2, auto: false, damage: 24, headMult: 2.5, legMult: 0.8, pellets: 1, rpm: 380, mag: 12, reserve: 60, reloadTime: 1.3, perShellReload: false,
    spread: 0.35, spreadMove: 1.6, spreadAir: 3.5, recoilPitch: 1.5, recoilYaw: 0.5, range: 60, falloff: 0.6, speedMult: 1.0, zoom: [], look: { len: 0.32, color: 0x3a4048, accent: 0xd0a030 } },
  { id: "spitfire", name: "Spitfire S35", kind: "smg", slot: 3, auto: true, damage: 17, headMult: 2.0, legMult: 0.8, pellets: 1, rpm: 800, mag: 35, reserve: 140, reloadTime: 2.0, perShellReload: false,
    spread: 0.9, spreadMove: 1.8, spreadAir: 4.0, recoilPitch: 0.85, recoilYaw: 0.5, range: 45, falloff: 0.55, speedMult: 0.97, zoom: [], look: { len: 0.55, color: 0x2e3338, accent: 0x6fb7ff } },
  { id: "raptor", name: "Raptor AR", kind: "rifle", slot: 4, auto: true, damage: 26, headMult: 2.2, legMult: 0.8, pellets: 1, rpm: 620, mag: 30, reserve: 120, reloadTime: 2.3, perShellReload: false,
    spread: 0.45, spreadMove: 2.0, spreadAir: 4.5, recoilPitch: 1.25, recoilYaw: 0.6, range: 90, falloff: 0.65, speedMult: 0.92, zoom: [], look: { len: 0.8, color: 0x3b4a3a, accent: 0xff7a2a } },
  { id: "hammer", name: "Hammer 12", kind: "shotgun", slot: 5, auto: false, damage: 10, headMult: 1.6, legMult: 0.8, pellets: 9, rpm: 75, mag: 6, reserve: 36, reloadTime: 0.55, perShellReload: true,
    spread: 4.2, spreadMove: 1.5, spreadAir: 2.5, recoilPitch: 5.5, recoilYaw: 1.0, range: 28, falloff: 0.25, speedMult: 0.92, zoom: [], look: { len: 0.85, color: 0x4a3524, accent: 0xb8b8b8 } },
  { id: "longbow", name: "Longbow X", kind: "sniper", slot: 6, auto: false, damage: 100, headMult: 2.5, legMult: 0.75, pellets: 1, rpm: 48, mag: 5, reserve: 25, reloadTime: 3.0, perShellReload: false,
    spread: 0.0, spreadMove: 5.0, spreadAir: 8.0, recoilPitch: 4.0, recoilYaw: 0.5, range: 200, falloff: 0.9, speedMult: 0.85, zoom: [30, 12], look: { len: 1.0, color: 0x22262b, accent: 0x77e0a0 } },
];

export const weaponById = (id: string): WeaponDef => WEAPONS.find((w) => w.id === id) ?? WEAPONS[1];
export const SLOT_COUNT = WEAPONS.length;
