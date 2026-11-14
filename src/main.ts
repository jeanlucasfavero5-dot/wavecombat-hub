import { Game } from "./game/game.ts";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const game = new Game(canvas);
// handles for the automated tests (and for the console)
(window as unknown as { __ae: unknown }).__ae = { game };
