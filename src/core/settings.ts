// Player settings, kept in localStorage (when the page allows it).
export interface Settings {
  sensitivity: number;
  fov: number;
  volume: number;
  shadows: boolean;
  crosshair: string;
  invertY: boolean;
}

const KEY = "action-elite.settings.v1";
const DEFAULTS: Settings = { sensitivity: 1, fov: 90, volume: 0.7, shadows: true, crosshair: "#7dff9a", invertY: false };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* storage blocked: defaults */ }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
