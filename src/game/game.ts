// The game: wires input, the session (rules), the 3D stage, the HUD, sound and the menus together, and runs the loop.
import * as THREE from "three";
import { Input, type InputFrame } from "../core/input.ts";
import { Sound } from "../core/audio.ts";
import { loadSettings, saveSettings, type Settings } from "../core/settings.ts";
import { buildDeposito } from "../sim/map.ts";
import { Session } from "./session.ts";
import { Stage } from "../render/stage.ts";
import { Hud } from "../ui/hud.ts";
import { Menus } from "../ui/menus.ts";
import { CSS } from "../ui/style.ts";

const STEP = 1 / 60;
const MOUSE_RAD = 0.0022;
type Mode = "menu" | "playing" | "paused";

const IDLE: InputFrame = { fwd: 0, strafe: 0, jump: false, sprint: false, crouch: false, fire: false, firePressed: false, scopePressed: false, reloadPressed: false, lastWeaponPressed: false, slot: 0, wheel: 0, lookDx: 0, lookDy: 0 };

export class Game {
  readonly settings: Settings = loadSettings();
  readonly sound = new Sound();
  readonly input: Input;
  session: Session;
  readonly stage: Stage;
  readonly hud = new Hud();
  readonly menus: Menus;
  mode: Mode = "menu";
  private acc = 0;
  private last = performance.now();
  private pend: InputFrame | null = null;
  private orbit = 0;
  private muzzle = new THREE.Vector3();
  private lookDx = 0;
  private lookDy = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    this.sound.volume = this.settings.volume;
    this.input = new Input(canvas);
    const map = buildDeposito();
    this.session = new Session(map);
    this.stage = new Stage(canvas, map, this.settings.shadows);
    this.stage.hFov = this.settings.fov;
    this.hud.setCrosshairColor(this.settings.crosshair);
    this.menus = new Menus(this.settings, {
      startTraining: () => this.startTraining(),
      resume: () => this.resume(),
      quitToMenu: () => this.quitToMenu(),
      settingsChanged: (s) => this.applySettings(s),
      click: () => this.sound.ui(),
    });
    this.wire();
    this.menus.show("menu");
    this.input.onLockChange = (locked) => {
      if (!locked && this.mode === "playing") this.pauseGame();
    };
    // clicking the canvas of a paused game also resumes
    canvas.addEventListener("click", () => { if (this.mode === "paused" && !this.menus.settingsEl.classList.contains("on")) this.resume(); });
    requestAnimationFrame((t) => this.frame(t));
  }

  private applySettings(s: Settings): void {
    saveSettings(s);
    this.sound.setVolume(s.volume);
    this.stage.hFov = s.fov;
    this.stage.setShadows(s.shadows);
    this.hud.setCrosshairColor(s.crosshair);
  }

  private wire(): void {
    const s = this.session, ev = s.ev, st = this.stage, snd = this.sound, hud = this.hud;
    let lastImpactSound = 0;
    ev.shot = (i) => {
      snd.shot(i.weapon.kind);
      st.view.fire(i.weapon.kind === "sniper" || i.weapon.kind === "shotgun" ? 1.4 : 0.8);
      hud.kickCrosshair(i.weapon.recoilPitch);
      st.view.muzzleWorld(this.muzzle);
      for (const e of i.ends) st.fx.tracer(this.muzzle, e);
    };
    ev.impact = (p, n, onTarget) => {
      st.fx.impact(p, n, onTarget);
      const now = performance.now();
      if (now - lastImpactSound > 40) { lastImpactSound = now; if (!onTarget) snd.impact(); }
    };
    ev.hit = (i) => {
      snd.hit(i.part === "head");
      if (i.killed) snd.kill();
      hud.hit(i.part === "head", i.killed);
      const sp = st.project(i.point);
      if (sp) hud.popup(sp.x, sp.y, `${i.dmg}`, i.part === "head");
      if (i.killed) hud.feedLine(`Você ▸ Alvo ${i.target.id}${i.part === "head" ? "  ·  tiro na cabeça" : ""}`, i.part === "head");
    };
    ev.empty = () => snd.empty();
    ev.reloadStart = (w) => { if (w.perShellReload) snd.shell(); else snd.reload(); };
    ev.reloadEnd = () => {};
    ev.switchTo = () => snd.swap();
    ev.step = (sprint) => snd.step(sprint);
    ev.land = (hard) => snd.land(hard);
    ev.swing = () => { st.view.swingKnife(); snd.shot("knife"); };
    ev.scope = () => snd.scope();
  }

  private async startTraining(): Promise<void> {
    this.sound.resume();
    this.resetSession();
    this.mode = "playing";
    this.menus.show("none");
    this.hud.show(true);
    this.stage.view.hidden = false;
    await this.input.lock();
    this.guardLock();
  }

  /** if the browser refused the pointer lock, show the pause screen (click to continue) instead of a frozen game */
  private guardLock(): void {
    setTimeout(() => { if (this.mode === "playing" && !this.input.active) this.pauseGame(); }, 700);
  }

  private resetSession(): void {
    this.session = new Session(this.session.map);
    this.wire();
  }

  private pauseGame(): void {
    this.mode = "paused";
    this.hud.show(true);
    this.menus.show("pause");
  }

  private async resume(): Promise<void> {
    this.sound.resume();
    this.menus.show("none");
    this.mode = "playing";
    await this.input.lock();
    this.guardLock();
  }

  private quitToMenu(): void {
    this.input.unlock();
    this.mode = "menu";
    this.hud.show(false);
    this.menus.show("menu");
  }

  private frame(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const s = this.session;

    if (this.mode === "playing" && this.input.active) {
      const f = this.input.consume();
      // mouse look, every frame (not per tick): scaled down while scoped
      const zoomScale = s.scopeFov > 0 ? s.scopeFov / this.settings.fov : 1;
      const k = MOUSE_RAD * this.settings.sensitivity * zoomScale;
      s.look(f.lookDx * k, f.lookDy * k * (this.settings.invertY ? -1 : 1));
      this.lookDx = f.lookDx; this.lookDy = f.lookDy;
      // merge into the pending input so an edge (a click) is never lost when no tick runs this frame
      const p = this.pend;
      this.pend = p ? { ...f, firePressed: p.firePressed || f.firePressed, scopePressed: p.scopePressed || f.scopePressed, reloadPressed: p.reloadPressed || f.reloadPressed, lastWeaponPressed: p.lastWeaponPressed || f.lastWeaponPressed, slot: f.slot || p.slot, wheel: f.wheel || p.wheel } : f;
      this.acc += dt;
      while (this.acc >= STEP) {
        const inp = this.pend ?? { ...this.lastFrame(f), firePressed: false, scopePressed: false, reloadPressed: false, lastWeaponPressed: false, slot: 0, wheel: 0 };
        s.tick(STEP, inp);
        this.pend = null;
        this.acc -= STEP;
      }
      this.stage.update(s, this.acc / STEP, dt, this.lookDx, this.lookDy);
      this.hud.update(s, dt, this.settings.fov, this.canvas.clientHeight);
    } else if (this.mode === "paused") {
      this.stage.update(s, 1, dt, 0, 0);
      this.hud.update(s, dt, this.settings.fov, this.canvas.clientHeight);
    } else {
      // menu: targets keep moving and the camera flies around the yard
      s.tick(Math.min(dt, STEP * 2), IDLE);
      this.orbit += dt * 0.12;
      this.stage.update(s, 1, dt, 0, 0);
      const r = 30;
      this.stage.camera.position.set(Math.sin(this.orbit) * r, 13, Math.cos(this.orbit) * r);
      this.stage.camera.lookAt(0, 1.5, 0);
      this.stage.view.root.visible = false;
    }
    this.stage.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  private lastF: InputFrame = IDLE;
  private lastFrame(f: InputFrame): InputFrame { this.lastF = f; return f; }
}
