// Procedural textures drawn on canvases: the game ships no image files.
import * as THREE from "three";

function tex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const noise = (g: CanvasRenderingContext2D, s: number, amount: number, count = s * 40): void => {
  for (let i = 0; i < count; i++) {
    const v = Math.random();
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${amount * v})` : `rgba(0,0,0,${amount * (1 - v)})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
};

export function makeTextures(): Record<string, THREE.CanvasTexture> {
  const T: Record<string, THREE.CanvasTexture> = {};
  T.floor = tex(256, (g, s) => {
    g.fillStyle = "#6b6e70"; g.fillRect(0, 0, s, s); noise(g, s, 0.18);
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2);
    g.strokeStyle = "rgba(255,255,255,0.07)"; g.lineWidth = 1; g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
  });
  T.wall = tex(256, (g, s) => {
    g.fillStyle = "#8d8a84"; g.fillRect(0, 0, s, s); noise(g, s, 0.15);
    g.fillStyle = "#c7a02b"; g.fillRect(0, s - 34, s, 12); g.fillStyle = "#1c1c1c";
    for (let x = -20; x < s + 20; x += 32) { g.beginPath(); g.moveTo(x, s - 34); g.lineTo(x + 16, s - 34); g.lineTo(x + 4, s - 22); g.lineTo(x - 12, s - 22); g.fill(); }
    g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = 2; g.strokeRect(0, 0, s, s * 0.6);
  });
  T.crate = tex(256, (g, s) => {
    g.fillStyle = "#a9753c"; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) { g.fillStyle = y % 64 ? "#b4813f" : "#9a6a35"; g.fillRect(0, y, s, 30); g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, y + 30, s, 2); }
    noise(g, s, 0.12);
    g.strokeStyle = "#5a3a18"; g.lineWidth = 14; g.strokeRect(7, 7, s - 14, s - 14);
    g.beginPath(); g.moveTo(10, 10); g.lineTo(s - 10, s - 10); g.moveTo(s - 10, 10); g.lineTo(10, s - 10); g.lineWidth = 10; g.stroke();
  });
  const container = (name: string, base: string, dark: string): void => {
    T[name] = tex(256, (g, s) => {
      g.fillStyle = base; g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 16) { g.fillStyle = dark; g.fillRect(x, 0, 6, s); g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(x + 6, 0, 2, s); }
      noise(g, s, 0.2); g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(0, 0, s, 10); g.fillRect(0, s - 10, s, 10);
    });
  };
  container("container-red", "#a8362b", "#8a2a21");
  container("container-blue", "#2d5f9a", "#244d7e");
  container("container-green", "#3d7a46", "#31633a");
  T.concrete = tex(128, (g, s) => { g.fillStyle = "#9a9a96"; g.fillRect(0, 0, s, s); noise(g, s, 0.2); g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2); });
  T.metal = tex(128, (g, s) => { g.fillStyle = "#4d545a"; g.fillRect(0, 0, s, s); noise(g, s, 0.12); g.fillStyle = "rgba(255,255,255,0.1)"; g.fillRect(0, 0, s, 4); });
  T.grate = tex(128, (g, s) => {
    g.fillStyle = "#2b2f33"; g.fillRect(0, 0, s, s); g.strokeStyle = "#5c646b"; g.lineWidth = 3;
    for (let i = 0; i <= s; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
  });
  return T;
}
