// The in-game overlay: crosshair, hit marker, health, ammo, weapon slots, stats, kill feed, damage numbers and the sniper scope.
import { WEAPONS } from "../sim/weapons.ts";
import type { Session } from "../game/session.ts";

export class Hud {
  readonly root: HTMLElement;
  private cross: HTMLElement;
  private hitm: HTMLElement;
  private hpNum: HTMLElement;
  private hpBar: HTMLElement;
  private name: HTMLElement;
  private ammo: HTMLElement;
  private rl: HTMLElement;
  private rlBar: HTMLElement;
  private slots: HTMLElement[] = [];
  private stats: HTMLElement;
  private feed: HTMLElement;
  private scope: HTMLElement;
  private msg: HTMLElement;
  private fps: HTMLElement;
  private hitTimer = 0;
  private kick = 0;
  private lastKey = "";
  private frames = 0; private fpsT = 0;

  constructor() {
    const r = this.root = document.createElement("div");
    r.id = "ae-hud"; r.className = "ae-layer";
    r.innerHTML = `
      <div id="ae-scope"><i class="h"></i><i class="v"></i></div>
      <div id="ae-cross"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></div>
      <div id="ae-hitm"><i></i><i></i><i></i><i></i></div>
      <div class="ae-stats"></div>
      <div class="ae-feed"></div>
      <div class="ae-msg"></div>
      <div class="ae-hp"><div class="num">100<small>HP</small></div><div class="bar"><i style="width:100%"></i></div></div>
      <div class="ae-ammo"><div class="ae-slots"></div><div class="name"></div><div class="n"></div><div class="rl"><i></i></div></div>
      <div class="ae-fps"></div>`;
    document.body.appendChild(r);
    const q = <T extends HTMLElement>(s: string) => r.querySelector<T>(s)!;
    this.cross = q("#ae-cross"); this.hitm = q("#ae-hitm"); this.hpNum = q(".ae-hp .num"); this.hpBar = q(".ae-hp .bar i");
    this.name = q(".ae-ammo .name"); this.ammo = q(".ae-ammo .n"); this.rl = q(".ae-ammo .rl"); this.rlBar = q(".ae-ammo .rl i");
    this.stats = q(".ae-stats"); this.feed = q(".ae-feed"); this.scope = q("#ae-scope"); this.msg = q(".ae-msg"); this.fps = q(".ae-fps");
    const sl = q(".ae-slots");
    for (const w of WEAPONS) { const s = document.createElement("span"); s.textContent = `${w.slot}`; s.title = w.name; sl.appendChild(s); this.slots.push(s); }
  }

  show(on: boolean): void { this.root.classList.toggle("on", on); }
  setCrosshairColor(c: string): void { this.cross.style.setProperty("--ch", c); }

  hit(head: boolean, killed: boolean): void {
    this.hitm.className = "on" + (killed ? " kill" : head ? " head" : "");
    this.hitTimer = 0.12;
  }

  /** a number that floats up from where the shot landed */
  popup(x: number, y: number, text: string, head: boolean): void {
    const d = document.createElement("div");
    d.className = "ae-pop" + (head ? " head" : "");
    d.textContent = text; d.style.left = `${x}px`; d.style.top = `${y}px`;
    this.root.appendChild(d);
    setTimeout(() => d.remove(), 720);
  }

  feedLine(text: string, head: boolean): void {
    const d = document.createElement("div");
    d.className = head ? "head" : ""; d.textContent = text;
    this.feed.appendChild(d);
    while (this.feed.children.length > 5) this.feed.firstChild?.remove();
    setTimeout(() => d.remove(), 4000);
  }

  message(t: string): void { this.msg.textContent = t; }
  kickCrosshair(deg: number): void { this.kick = Math.min(24, this.kick + deg * 3); }

  update(s: Session, dt: number, hFov: number, viewportH: number): void {
    if (this.hitTimer > 0) { this.hitTimer -= dt; if (this.hitTimer <= 0) this.hitm.className = ""; }
    this.kick = Math.max(0, this.kick - dt * 60);
    const w = s.weapon, st = s.state;
    // crosshair gap follows the real cone: pixels = tan(spread) * distance-to-screen
    const pxPerRad = (viewportH / 2) / Math.tan((hFov * Math.PI) / 360 / Math.max(1, 1));
    const gap = 5 + Math.min(60, Math.tan((s.spreadNow * Math.PI) / 180) * pxPerRad * 0.45 + this.kick);
    const els = this.cross.children;
    (els[0] as HTMLElement).style.top = `${-gap - 9}px`; (els[1] as HTMLElement).style.top = `${gap}px`;
    (els[2] as HTMLElement).style.left = `${-gap - 9}px`; (els[3] as HTMLElement).style.left = `${gap}px`;
    this.cross.style.display = s.scopeFov > 0 || w.kind === "knife" ? "none" : "block";
    this.scope.style.display = s.scopeFov > 0 ? "block" : "none";

    const key = `${s.slot}|${st.mag}|${st.reserve}|${Math.round(s.hp)}|${s.stats.kills}|${s.stats.shots}|${s.stats.hits}|${s.stats.headshots}|${s.stats.streak}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.hpNum.innerHTML = `${Math.round(s.hp)}<small>HP</small>`;
      this.hpBar.style.width = `${Math.max(0, s.hp)}%`;
      this.name.textContent = w.name;
      this.ammo.innerHTML = w.mag ? `${st.mag}<small>/ ${st.reserve}</small>` : `<small>—</small>`;
      this.slots.forEach((e, i) => e.classList.toggle("on", i === s.slot - 1));
      const acc = s.stats.shots ? Math.round((s.stats.hits / s.stats.shots) * 100) : 0;
      this.stats.innerHTML = `<div><b>Abates</b>${s.stats.kills}</div><div><b>Sequência</b>${s.stats.streak} <span style="opacity:.6">(melhor ${s.stats.bestStreak})</span></div><div><b>Precisão</b>${acc}%</div><div><b>Tiros na cabeça</b>${s.stats.headshots}</div><div><b>Dano total</b>${s.stats.damage}</div>`;
    }
    const rl = s.reloading;
    this.rl.style.display = rl ? "block" : "none";
    if (rl) this.rlBar.style.width = `${Math.round(s.reloadProgress * 100)}%`;
    this.msg.textContent = rl ? "Recarregando…" : w.mag && st.mag === 0 && st.reserve === 0 ? "Sem munição" : "";

    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 0.5) { this.fps.textContent = `${Math.round(this.frames / this.fpsT)} fps`; this.frames = 0; this.fpsT = 0; }
  }
}
