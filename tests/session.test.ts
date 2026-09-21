import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { Session, helperPath } from "../src/session";
import { resolveBash, bashCandidates } from "../src/shell";
const root = path.resolve(__dirname, "..");
function until(session: Session, predicate: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      if (predicate()) {
        cleanup();
        resolve();
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out: " + JSON.stringify(session.snapshot())));
    }, 8000);
    const cleanup = () => {
      clearTimeout(timer);
      session.off("state", done);
      session.off("data", done);
    };
    session.on("state", done);
    session.on("data", done);
    done();
  });
}
async function setup(t: import("node:test").TestContext) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "xbsl-terminal-test-"));
  const session = new Session("bash", await fs.realpath(cwd));
  t.after(() => {
    session.close();
  });
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  let output = "";
  session.on("data", (m) => {
    output += Buffer.from(m.data, "base64").toString("utf8");
    session.ack(m.offset);
  });
  session.attach();
  const shell = await resolveBash();
  await session.start(root, {
    file: shell.file,
    args: ["--noprofile", "--norc", "-i"],
  });
  await until(session, () => session.state === "running");
  session.input("PS1='\\[\\e[35m\\]XBSL>\\[\\e[0m\\] '\n");
  await until(session, () => output.includes("\x1b[35mXBSL>\x1b[0m "));
  return {
    session,
    cwd,
    get output() {
      return output;
    },
  };
}
test("real PTY: cwd, UTF-8, ANSI, TTY and resize", async (t) => {
  const c = await setup(t);
  c.session.resize(111, 37);
  c.session.input(
    "printf '\\033[32mREADY:%s\\033[0m\\n' \"$PWD\"; test -t 0 && printf 'TTY:%s\\n' yes; stty size; printf '\\320\\237\\321\\200\\320\\270\\320\\262\\320\\265\\321\\202\\n'\n",
  );
  await until(
    c.session,
    () =>
      c.output.includes("\x1b[32mREADY:") &&
      c.output.includes("TTY:yes") &&
      c.output.includes("37 111") &&
      c.output.includes("Привет"),
  );
  assert.ok(c.output.includes(await fs.realpath(c.cwd)));
});
test("tab completion and command history work through PTY", async (t) => {
  const c = await setup(t);
  await fs.writeFile(
    path.join(c.cwd, "unique-terminal-file"),
    "COMPLETION_OK\n",
  );
  c.session.input("cat unique-term\t\n");
  await until(c.session, () => c.output.includes("COMPLETION_OK"));
  c.session.input("\x1b[A\n");
  await until(c.session, () => c.output.split("COMPLETION_OK").length >= 3);
});
test("Ctrl+C interrupts foreground job; shell survives; exit status retained", async (t) => {
  const c = await setup(t);
  c.session.input("bash -c 'printf \"RUN%s\\n\" NING; exec sleep 30'\n");
  await until(c.session, () => c.output.includes("RUNNING"));
  const before = c.output.length;
  c.session.input("\x03");
  await until(c.session, () =>
    c.output.slice(before).includes("\x1b[35mXBSL>"),
  );
  c.session.input("printf 'AFTER%s\\n' _INTERRUPT\n");
  await until(c.session, () => c.output.includes("AFTER_INTERRUPT"));
  c.session.input("exit 7\n");
  await until(c.session, () => c.session.state === "exited");
  assert.equal(c.session.code, 7);
});
test("close/EOF releases Bash process and repeated close is harmless", async (t) => {
  const c = await setup(t);
  const pid = c.session.pid!;
  const gone = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Bash survived close")),
      4000,
    );
    const poll = setInterval(() => {
      try {
        process.kill(pid, 0);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ESRCH") {
          clearTimeout(timeout);
          clearInterval(poll);
          resolve();
        }
      }
    }, 20);
  });
  c.session.close();
  c.session.close();
  await gone;
});
test("independent sessions retain separate cwd and state", async (t) => {
  const a = await setup(t),
    b = await setup(t);
  a.session.input("cd /; printf 'ONE%s\\n' _DONE\n");
  b.session.input("printf 'TWO:%s\\n' \"$PWD\"\n");
  await Promise.all([
    until(a.session, () => a.output.includes("ONE_DONE")),
    until(b.session, () => b.output.includes("TWO:" + b.session.cwd)),
  ]);
  assert.notEqual(a.session.id, b.session.id);
});
test("missing executable reports an error, never running", async (t) => {
  const c = new Session("bad", os.tmpdir());
  t.after(() => c.close());
  await c.start(root, {
    file: path.join(os.tmpdir(), "absent-xbsl-bash"),
    args: [],
  });
  await until(c, () => c.state === "error" || c.state === "exited");
  assert.equal(c.state, "error");
  assert.ok(c.error);
});
test("helper hash/size protects package integrity", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "xbsl-integrity-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.cp(path.join(root, "bin"), path.join(dir, "bin"), {
    recursive: true,
  });
  const file = await helperPath(dir);
  await fs.appendFile(file, "changed");
  await assert.rejects(helperPath(dir), /PTY повреждён/);
});
test("Bash resolution uses absolute PATH entries, excludes Windows launcher aliases", () => {
  const paths = bashCandidates("win32", {
    ProgramFiles: "C:\\Program Files",
    PATH: ".;C:\\Windows\\System32;C:\\Tools",
  });
  assert.ok(paths.includes("C:\\Program Files\\Git\\bin\\bash.exe"));
  assert.ok(paths.includes("C:\\Tools\\bash.exe"));
  assert.ok(!paths.some((p) => /System32|^bash/.test(p)));
  assert.ok(
    !bashCandidates("linux", { PATH: ".::relative:/opt/bin" }).includes("bash"),
  );
});
test("invalid explicit Bash path does not run a fallback", async () => {
  await assert.rejects(resolveBash("bash --login"), /абсолютный/);
  await assert.rejects(resolveBash("/nonexistent/xbsl-bash"), /не найден/);
});
test("helper stdin EOF closes session when Node disappears", async () => {
  const executable = await helperPath(root),
    shell = await resolveBash();
  const child = spawn(executable, [], { stdio: "pipe" });
  let output = "";
  child.stdout.on("data", (b) => {
    output += b;
  });
  child.stdin.write(
    JSON.stringify({
      type: "start",
      shell: shell.file,
      args: ["--noprofile", "--norc", "-i"],
      cwd: os.tmpdir(),
      cols: 80,
      rows: 24,
    }) + "\n",
  );
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("no ready"));
    }, 3000);
    child.stdout.on("data", () => {
      if (output.includes('"ready"')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  const closed = once(child, "close");
  child.stdin.end();
  await closed;
  assert.ok(output.includes('"exit"'));
});
test("oversized UTF-8 input and invalid resize cannot terminate Bash", async (t) => {
  const c = await setup(t);
  c.session.input("😀".repeat(10000));
  c.session.resize(NaN, 30);
  c.session.resize(80, 0);
  c.session.input("printf 'LIMIT%s\\n' _OK\n");
  await until(c.session, () => c.output.includes("LIMIT_OK"));
  assert.equal(c.session.state, "running");
});
test("flow control recovers after blocked renderer and replay", async (t) => {
  const c = await setup(t);
  c.session.removeAllListeners("data");
  let offset = 0,
    total = 0,
    tail = "";
  let ack = false;
  c.session.on("data", (m) => {
    offset = m.offset;
    total += m.data.length;
    tail = (tail + Buffer.from(m.data, "base64").toString()).slice(-20000);
    if (ack) c.session.ack(m.offset);
  });
  c.session.input("printf '%01000000d\\n' 0; printf 'FLOW%s\\n' _DONE\n");
  await until(c.session, () => offset >= 256 * 1024);
  c.session.ack(offset + 99999999);
  assert.ok(total < 1024 * 1024, "paused output stays bounded");
  ack = true;
  c.session.ack(offset);
  await until(c.session, () => tail.includes("FLOW_DONE"));
  assert.ok(total > 1000000);
  c.session.detach();
  c.session.attach();
  c.session.input("printf 'REPLAY%s\\n' _OK\n");
  await until(c.session, () => tail.includes("REPLAY_OK"));
});
