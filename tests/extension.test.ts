import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hostHarness, waitFor } from "./host-harness";
const root = path.resolve(__dirname, "..");
test("public API: bottom view, no auto-start, bridge, reload, config, disposal", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "xbsl-host-test-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const host = hostHarness(root, cwd);
  t.after(() => host.dispose());
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8"),
  );
  assert.equal(
    manifest.contributes.viewsContainers.panel[0].id,
    "xbslTerminal",
  );
  host.mount();
  host.send({ type: "ready" });
  assert.deepEqual(host.messages.at(-1).sessions, []);
  assert.match(host.view.webview.html, /connect-src 'none'/);
  assert.match(host.view.webview.html, /nonce-/);
  for (const m of [
    null,
    [],
    {},
    { type: 7 },
    { type: "input", id: "unknown", data: "exit\n" },
  ])
    host.send(m);
  await host.commands.get("xbslTerminal.new")!();
  await waitFor(
    () =>
      host.messages.some(
        (m) => m.type === "state" && m.sessions[0]?.state === "running",
      ),
    "running session",
  );
  let state = host.messages.filter((m) => m.type === "state").at(-1)
    .sessions[0];
  const id = state.id,
    pid = state.pid;
  assert.equal(state.cwd, await fs.realpath(cwd));
  let text = "";
  host.onPost((m) => {
    if (m.type === "data") {
      text += Buffer.from(m.data, "base64").toString("utf8");
      host.send({ type: "ack", id, offset: m.offset });
    }
  });
  host.send({ type: "input", id, data: "printf 'BRIDGE%s\\n' _OK\n" });
  await waitFor(() => text.includes("BRIDGE_OK"), "interactive bridge");
  text = "";
  host.send({ type: "ready" });
  assert.ok(text.includes("BRIDGE_OK"));
  host.configure(undefined);
  await host.commands.get("xbslTerminal.configure")!();
  assert.equal(host.global(), "");
  host.configure("relative --bad");
  await host.commands.get("xbslTerminal.configure")!();
  assert.equal(host.global(), "");
  assert.ok(host.errors.length);
  host.closeView();
  await waitFor(() => {
    try {
      process.kill(pid, 0);
      return false;
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === "ESRCH";
    }
  }, "Bash stopped on view disposal");
  host.mount();
  host.send({ type: "ready" });
  assert.deepEqual(host.messages.at(-1).sessions, []);
});
