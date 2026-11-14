// Title screen, pause screen and settings.
import type { Settings } from "../core/settings.ts";

export interface MenuActions {
  startTraining(): void;
  resume(): void;
  quitToMenu(): void;
  settingsChanged(s: Settings): void;
  click(): void;
}

declare const __GAME_VERSION__: string;

export class Menus {
  readonly menu: HTMLElement;
  readonly pause: HTMLElement;
  readonly settingsEl: HTMLElement;
  private ver: HTMLElement;

  constructor(private settings: Settings, private act: MenuActions) {
    this.menu = this.layer("ae-menu", `
      <div class="ae-card">
        <div>
          <div class="ae-logo">Action<b>Elite</b></div>
          <div class="ae-sub">Parte 1 · Base do jogo · Treino offline</div>
          <div class="ae-btns">
            <button class="ae-btn primary" data-a="train">Treino offline<small>Campo de tiro com alvos móveis. Todas as armas liberadas.</small></button>
            <button class="ae-btn" disabled>Modos offline<small>Bots, Deathmatch, Missão Bomba… (parte 2)</small></button>
            <button class="ae-btn" disabled>Jogar online<small>Salas e partidas contra jogadores reais (parte 3)</small></button>
            <button class="ae-btn" data-a="settings">Configurações</button>
          </div>
        </div>
        <div class="ae-keys">
          <h3>Controles</h3>
          <div><kbd>W A S D</kbd>mover</div><div><kbd>Mouse</kbd>mirar</div><div><kbd>Botão esq.</kbd>atirar</div><div><kbd>Botão dir.</kbd>mira da Longbow</div>
          <div><kbd>Shift</kbd>correr</div><div><kbd>Espaço</kbd>pular</div><div><kbd>Ctrl / C</kbd>agachar</div>
          <div><kbd>R</kbd>recarregar</div><div><kbd>1 – 6 / Roda</kbd>trocar de arma</div><div><kbd>Q</kbd>arma anterior</div><div><kbd>Esc</kbd>pausar</div>
        </div>
      </div>`);
    this.pause = this.layer("ae-pause", `
      <div class="ae-card">
        <div class="ae-logo" style="font-size:30px">Pausado</div>
        <div class="ae-btns">
          <button class="ae-btn primary" data-a="resume">Continuar</button>
          <button class="ae-btn" data-a="settings">Configurações</button>
          <button class="ae-btn" data-a="quit">Sair para o menu</button>
        </div>
      </div>`);
    this.settingsEl = this.layer("ae-settings", `
      <div class="ae-card">
        <div class="ae-logo" style="font-size:26px">Configurações</div>
        <div class="ae-row"><span>Sensibilidade</span><input type="range" data-k="sensitivity" min="0.2" max="3" step="0.05"><output></output></div>
        <div class="ae-row"><span>Campo de visão</span><input type="range" data-k="fov" min="70" max="110" step="1"><output></output></div>
        <div class="ae-row"><span>Volume</span><input type="range" data-k="volume" min="0" max="1" step="0.05"><output></output></div>
        <div class="ae-row"><span>Mira</span><select data-k="crosshair"><option value="#7dff9a">Verde</option><option value="#ffffff">Branca</option><option value="#ffd24a">Amarela</option><option value="#ff5a5a">Vermelha</option><option value="#5ac8ff">Azul</option></select></div>
        <div class="ae-row"><span>Opções</span><label class="sw"><input type="checkbox" data-k="shadows"> Sombras</label></div>
        <div class="ae-row"><span></span><label class="sw"><input type="checkbox" data-k="invertY"> Inverter eixo Y do mouse</label></div>
        <div class="ae-btns"><button class="ae-btn primary" data-a="back">Voltar</button></div>
      </div>`);
    this.ver = document.createElement("div");
    this.ver.className = "ae-ver"; this.ver.textContent = `ACTION ELITE · v${__GAME_VERSION__}`;
    document.body.appendChild(this.ver);

    for (const root of [this.menu, this.pause, this.settingsEl]) {
      root.addEventListener("click", (e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>("[data-a]")?.dataset.a;
        if (!a) return;
        act.click();
        if (a === "train") act.startTraining();
        else if (a === "resume") act.resume();
        else if (a === "quit") act.quitToMenu();
        else if (a === "settings") this.settingsEl.classList.add("on");
        else if (a === "back") this.settingsEl.classList.remove("on");
      });
    }
    this.settingsEl.addEventListener("input", (e) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      const k = el.dataset.k as keyof Settings | undefined;
      if (!k) return;
      const s = this.settings as unknown as Record<string, unknown>;
      if (el instanceof HTMLInputElement && el.type === "checkbox") s[k] = el.checked;
      else if (el instanceof HTMLInputElement) s[k] = parseFloat(el.value);
      else s[k] = el.value;
      this.refresh();
      act.settingsChanged(this.settings);
    });
    this.refresh();
  }

  private layer(id: string, html: string): HTMLElement {
    const d = document.createElement("div");
    d.id = id; d.className = "ae-layer"; d.innerHTML = html;
    document.body.appendChild(d);
    return d;
  }

  refresh(): void {
    const s = this.settings as unknown as Record<string, unknown>;
    this.settingsEl.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-k]").forEach((el) => {
      const v = s[el.dataset.k as string];
      if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = !!v;
      else el.value = String(v);
      const out = el.parentElement?.querySelector("output");
      if (out) out.textContent = el.dataset.k === "volume" ? `${Math.round(Number(v) * 100)}%` : String(v);
    });
  }

  show(which: "menu" | "pause" | "none"): void {
    this.menu.classList.toggle("on", which === "menu");
    this.pause.classList.toggle("on", which === "pause");
    if (which === "none") this.settingsEl.classList.remove("on");
  }
}
