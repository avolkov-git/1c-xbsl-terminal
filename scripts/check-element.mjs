import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const root = process.argv[2];
if (!root)
  throw new Error(
    "Usage: npm run check:element -- /path/to/server-package-with-ide-9.2.4-6",
  );
const app = path.join(root, "ide/theia/products/browser-app");
const [init, contributions, api, main, pkg] = await Promise.all(
  [
    "lib/backend/plugin-vscode-init.js",
    "lib/backend/357.js",
    "lib/backend/138.js",
    "lib/backend/main.js",
    "package.json",
  ].map((file) => fs.readFile(path.join(app, file), "utf8")),
);
assert.match(init, /1\.97\.2/);
assert.match(
  contributions,
  /"activitybar"===\w\?"left":"panel"===\w\?"bottom"/,
);
assert.ok(api.includes("registerWebviewViewProvider"));
assert.ok(api.includes("showInputBox"));
assert.ok(api.includes("getConfiguration"));
assert.ok(main.includes("Terminal processes are prohibited"));
const manifest = JSON.parse(await fs.readFile("package.json", "utf8")),
  host = JSON.parse(pkg);
assert.equal(manifest.engines.vscode, "^1.97.0");
assert.equal(host.dependencies["@theia/core"], "1.59.110");
console.log(
  JSON.stringify(
    {
      kind: "static-source-check-only",
      vscodeDefault: "1.97.2",
      theia: host.dependencies["@theia/core"],
      idePackage: host.version,
      placement: "panel -> bottom",
      nativeTerminalRestrictionPresent: true,
      pluginRuntimeTested: false,
    },
    null,
    2,
  ),
);
