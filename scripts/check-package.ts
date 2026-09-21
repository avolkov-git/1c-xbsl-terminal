import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { hostHarness, waitFor } from "../tests/host-harness";
async function main() {
  const root = path.resolve(
    process.argv[2] ?? "release/1c-xbsl-terminal-0.1.0",
  );
  const entry = await fs.readFile(path.join(root, "dist/extension.js"), "utf8");
  for (const m of entry.matchAll(/require\("([^"]+)"\)/g))
    assert.ok(
      m[1] === "vscode" || m[1].startsWith("node:"),
      "Unbundled runtime dependency: " + m[1],
    );
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "xbsl-package-"));
  const host = hostHarness(root, cwd);
  try {
    host.mount();
    host.send({ type: "ready" });
    await host.commands.get("xbslTerminal.new")!();
    await waitFor(
      () =>
        host.messages.some(
          (m) => m.type === "state" && m.sessions[0]?.state === "running",
        ),
      "packaged Bash ready",
    );
    const state = host.messages.filter((m) => m.type === "state").at(-1)
      .sessions[0];
    assert.ok(state.pid > 0);
    host.closeView();
    await waitFor(() => {
      try {
        process.kill(state.pid, 0);
        return false;
      } catch (e) {
        return (e as NodeJS.ErrnoException).code === "ESRCH";
      }
    }, "packaged Bash stopped");
    console.log(
      "PASS: packaged extension boots and closes real Bash; no unbundled runtime imports.",
    );
  } finally {
    host.dispose();
    await fs.rm(cwd, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
