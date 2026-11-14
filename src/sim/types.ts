// Pure simulation types: no three.js, no DOM. The same code runs in the browser (offline) and on the server (online).

export type MatKind = "floor" | "wall" | "crate" | "container-red" | "container-blue" | "container-green" | "concrete" | "metal" | "grate";

/** axis-aligned solid, in meters. y is up. */
export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; mat: MatKind }

export interface Vec3 { x: number; y: number; z: number }

/** the moving body of a player: feet position, velocity, and how crouched it is */
export interface Body {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  onGround: boolean;
  /** 0 standing .. 1 crouched (smoothed) */
  crouch: number;
}

/** one tick of input */
export interface MoveCmd {
  /** -1..1 (1 = forward) */
  fwd: number;
  /** -1..1 (1 = right) */
  strafe: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
  yaw: number;
  /** weapon weight: 1 = full speed */
  speedMult: number;
}

export interface SpawnPoint { x: number; y: number; z: number; yaw: number; team: number }

export interface MapDef {
  id: string;
  name: string;
  solids: Box[];
  /** x/z half size of the playable square (the walls are just outside) */
  half: number;
  spawns: SpawnPoint[];
  /** free spots for training targets */
  targetSpots: Vec3[];
}
