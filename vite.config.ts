import { defineConfig, type Plugin } from "vite";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { viteSingleFile } from "vite-plugin-singlefile";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string; gameVersion?: string };
const GAME_VERSION = pkg.gameVersion ?? pkg.version;

/** the version label of the page (__GAME_VERSION__ in index.html and in the code) */
function gameVersion(): Plugin {
  return { name: "ae-version", transformIndexHtml: (html) => html.replaceAll("__GAME_VERSION__", GAME_VERSION) };
}

/** the built page is action-elite.html (one file: code, styles, everything). Dev keeps serving index.html. */
function namedPage(): Plugin {
  let out = "dist";
  return {
    name: "ae-named-page",
    apply: "build",
    enforce: "post",
    configResolved(c) { out = c.build.outDir; },
    closeBundle() {
      const from = join(out, "index.html");
      if (existsSync(from)) renameSync(from, join(out, "action-elite.html"));
    },
  };
}

export default defineConfig({
  define: { __GAME_VERSION__: JSON.stringify(GAME_VERSION) },
  plugins: [gameVersion(), viteSingleFile(), namedPage()],
  publicDir: false,
  server: { host: "0.0.0.0", port: 8000 },
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
});
