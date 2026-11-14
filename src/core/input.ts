// Keyboard, mouse and pointer lock. The game reads one InputFrame per rendered frame.

export interface InputFrame {
  fwd: number; strafe: number;
  jump: boolean; sprint: boolean; crouch: boolean;
  fire: boolean; firePressed: boolean;
  scopePressed: boolean; reloadPressed: boolean; lastWeaponPressed: boolean;
  /** weapon slot 1..n picked this frame, or 0 */
  slot: number;
  /** +1 next, -1 previous */
  wheel: number;
  lookDx: number; lookDy: number;
}

export class Input {
  private keys = new Set<string>();
  private pressedKeys = new Set<string>();
  private left = false;
  private right = false;
  private leftEdge = false;
  private rightEdge = false;
  private wheelAcc = 0;
  private dx = 0;
  private dy = 0;
  /** pointer lock is held (the game is being played) */
  locked = false;
  /** tests and touch: act as if the pointer were locked */
  forceActive = false;
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private canvas: HTMLElement) {
    addEventListener("keydown", (e) => {
      if (!this.active) return;
      if (e.code === "Tab" || e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
      if (!e.repeat) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => { this.keys.clear(); this.left = this.right = false; });
    addEventListener("mousedown", (e) => {
      if (!this.active) return;
      if (e.button === 0) { this.left = true; this.leftEdge = true; }
      if (e.button === 2) { this.right = true; this.rightEdge = true; }
    });
    addEventListener("mouseup", (e) => { if (e.button === 0) this.left = false; if (e.button === 2) this.right = false; });
    addEventListener("contextmenu", (e) => { if (this.active) e.preventDefault(); });
    addEventListener("wheel", (e) => { if (this.active) this.wheelAcc += Math.sign(e.deltaY); }, { passive: true });
    addEventListener("mousemove", (e) => { if (this.active) { this.dx += e.movementX; this.dy += e.movementY; } });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys.clear(); this.left = this.right = false; }
      this.onLockChange(this.locked);
    });
  }

  get active(): boolean { return this.locked || this.forceActive; }

  async lock(): Promise<void> {
    try { await (this.canvas as HTMLElement & { requestPointerLock: (o?: unknown) => Promise<void> | void }).requestPointerLock({ unadjustedMovement: true }); }
    catch { try { this.canvas.requestPointerLock(); } catch { /* the page can still be played with forceActive */ } }
  }
  unlock(): void { if (document.pointerLockElement) document.exitPointerLock(); }

  /** test hook: set a key without an event */
  setKey(code: string, down: boolean): void { if (down) { this.keys.add(code); this.pressedKeys.add(code); } else this.keys.delete(code); }
  setMouse(button: "left" | "right", down: boolean): void { if (button === "left") { this.left = down; if (down) this.leftEdge = true; } else { this.right = down; if (down) this.rightEdge = true; } }

  consume(): InputFrame {
    const k = (c: string) => this.keys.has(c);
    let slot = 0;
    for (let i = 1; i <= 9; i++) if (this.pressedKeys.has(`Digit${i}`)) slot = i;
    const f: InputFrame = {
      fwd: (k("KeyW") || k("ArrowUp") ? 1 : 0) - (k("KeyS") || k("ArrowDown") ? 1 : 0),
      strafe: (k("KeyD") || k("ArrowRight") ? 1 : 0) - (k("KeyA") || k("ArrowLeft") ? 1 : 0),
      jump: k("Space"),
      sprint: k("ShiftLeft") || k("ShiftRight"),
      crouch: k("ControlLeft") || k("KeyC"),
      fire: this.left,
      firePressed: this.leftEdge,
      scopePressed: this.rightEdge,
      reloadPressed: this.pressedKeys.has("KeyR"),
      lastWeaponPressed: this.pressedKeys.has("KeyQ"),
      slot,
      wheel: Math.sign(this.wheelAcc),
      lookDx: this.dx, lookDy: this.dy,
    };
    this.pressedKeys.clear();
    this.leftEdge = this.rightEdge = false;
    this.wheelAcc = 0; this.dx = this.dy = 0;
    return f;
  }
}
