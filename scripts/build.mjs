import { build } from "esbuild";
import fs from "node:fs/promises";
await fs.mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  target: "node18.17",
  format: "cjs",
  external: ["vscode"],
  outfile: "dist/extension.js",
  sourcemap: true,
  legalComments: "external",
});
await build({
  entryPoints: ["ui/terminal.ts"],
  bundle: true,
  platform: "browser",
  target: "es2020",
  format: "iife",
  outfile: "dist/terminal.js",
  minify: true,
  legalComments: "external",
});
await fs.writeFile(
  "dist/terminal.css",
  (await fs.readFile("node_modules/@xterm/xterm/css/xterm.css", "utf8")) +
    "\n" +
    (await fs.readFile("ui/terminal.css", "utf8")),
);
