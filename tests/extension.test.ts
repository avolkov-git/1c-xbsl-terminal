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

test("rename preserves the selected Bash process, handles cancel and a closed session", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "xbsl-rename-test-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const host = hostHarness(root, cwd);
  t.after(() => host.dispose());
  host.mount();
  host.send({ type: "ready" });
  await host.commands.get("xbslTerminal.new")!();
  await host.commands.get("xbslTerminal.new")!();
  const states = () =>
    host.messages.filter((m) => m.type === "state").at(-1).sessions;
  await waitFor(
    () =>
      states().length === 2 &&
      states().every((s: any) => s.state === "running"),
    "two running sessions",
  );
  const [first, second] = states();
  host.configure("  Логи сервера  ");
  host.send({ type: "rename", id: second.id });
  await waitFor(() => states()[1].name === "Логи сервера", "renamed session");
  assert.equal(host.inputRequests.at(-1)?.value, second.name);
  assert.deepEqual(states()[0], first);
  assert.deepEqual(states()[1], { ...second, name: "Логи сервера" });
  process.kill(second.pid, 0);
  let output = "";
  host.onPost((m) => {
    if (m.type === "data" && m.id === second.id) {
      output += Buffer.from(m.data, "base64").toString("utf8");
      host.send({ type: "ack", id: m.id, offset: m.offset });
    }
  });
  host.send({
    type: "input",
    id: second.id,
    data: "printf 'RENAME%s\\n' _OK\n",
  });
  await waitFor(
    () => output.includes("RENAME_OK"),
    "same Bash accepts input after rename",
  );
  host.send({ type: "ready" });
  assert.equal(states()[1].name, "Логи сервера");

  for (const value of [
    undefined,
    "  ",
    "x".repeat(81),
    "logs\nexit",
    "logs\u001b[31m",
  ]) {
    const count = host.inputRequests.length;
    host.configure(value);
    host.send({ type: "rename", id: second.id });
    await waitFor(
      () => host.inputRequests.length === count + 1,
      "rename input",
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(states()[1].name, "Логи сервера");
  }
  assert.equal(host.errors.length, 4);
  const count = host.inputRequests.length;
  host.send({ type: "rename", id: "unknown" });
  assert.equal(host.inputRequests.length, count);

  let resolveInput!: (value: string | undefined) => void;
  host.api.window.showInputBox = () =>
    new Promise((resolve) => {
      resolveInput = resolve;
    });
  host.send({ type: "rename", id: first.id });
  host.send({ type: "close", id: first.id });
  resolveInput("Already closed");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(states().length, 1);
  assert.equal(states()[0].id, second.id);
  assert.equal(states()[0].name, "Логи сервера");
});
