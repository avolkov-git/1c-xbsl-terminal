"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));

// src/session.ts
var import_promises = __toESM(require("node:fs/promises"));
var import_node_path = __toESM(require("node:path"));
var import_node_crypto = require("node:crypto");
var import_node_child_process = require("node:child_process");
var import_node_events = require("node:events");
async function helperPath(root) {
  const key = `${process.platform}-${process.arch}`;
  const expected = `bin/${key}/terminal-pty${process.platform === "win32" ? ".exe" : ""}`;
  const manifest = JSON.parse(
    await import_promises.default.readFile(import_node_path.default.join(root, "bin/runtime.json"), "utf8")
  );
  const entry = manifest.files?.[key];
  if (manifest.protocol !== 1 || entry?.file !== expected)
    throw new Error("\u0412 \u043F\u0430\u043A\u0435\u0442\u0435 \u043D\u0435\u0442 PTY \u0434\u043B\u044F \u044D\u0442\u043E\u0439 \u041E\u0421 \u0438 \u0430\u0440\u0445\u0438\u0442\u0435\u043A\u0442\u0443\u0440\u044B \u0441\u0435\u0440\u0432\u0435\u0440\u0430.");
  const file = import_node_path.default.join(root, expected);
  const stat = await import_promises.default.lstat(file);
  if (await import_promises.default.realpath(file) !== import_node_path.default.join(await import_promises.default.realpath(root), expected))
    throw new Error("PTY \u043D\u0435 \u0434\u043E\u043B\u0436\u0435\u043D \u0431\u044B\u0442\u044C \u0441\u0441\u044B\u043B\u043A\u043E\u0439 \u0437\u0430 \u043F\u0440\u0435\u0434\u0435\u043B\u044B \u043F\u0430\u043A\u0435\u0442\u0430.");
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== entry.size || stat.size > 16 * 1024 * 1024)
    throw new Error("PTY \u043F\u043E\u0432\u0440\u0435\u0436\u0434\u0451\u043D. \u041F\u0435\u0440\u0435\u043D\u0435\u0441\u0438\u0442\u0435 \u043F\u043E\u043B\u043D\u044B\u0439 \u043F\u0430\u043A\u0435\u0442 \u043F\u043B\u0430\u0433\u0438\u043D\u0430.");
  const bytes = await import_promises.default.readFile(file);
  if ((0, import_node_crypto.createHash)("sha256").update(bytes).digest("hex") !== entry.sha256)
    throw new Error(
      "\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C\u043D\u0430\u044F \u0441\u0443\u043C\u043C\u0430 PTY \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B\u0430. \u0417\u0430\u043C\u0435\u043D\u0438\u0442\u0435 \u043F\u0430\u043A\u0435\u0442 \u043F\u043B\u0430\u0433\u0438\u043D\u0430."
    );
  if (process.platform !== "win32" && !(stat.mode & 64))
    await import_promises.default.chmod(file, 493);
  return file;
}
var Session = class extends import_node_events.EventEmitter {
  constructor(name, cwd) {
    super();
    this.name = name;
    this.cwd = cwd;
  }
  id = (0, import_node_crypto.randomUUID)();
  state = "starting";
  pid = null;
  code = null;
  error = "";
  child;
  line = "";
  closed = false;
  receivedExit = false;
  timer;
  pending = 0;
  acknowledged = 0;
  attached = false;
  buffer = [];
  bufferedBytes = 0;
  truncated = false;
  snapshot() {
    return {
      id: this.id,
      name: this.name,
      cwd: this.cwd,
      state: this.state,
      pid: this.pid,
      code: this.code,
      error: this.error
    };
  }
  async start(root, shell) {
    try {
      const helper = await helperPath(root);
      if (this.closed) return;
      this.child = (0, import_node_child_process.spawn)(helper, [], {
        stdio: "pipe",
        windowsHide: true,
        cwd: this.cwd,
        env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" }
      });
      this.child.stdout.setEncoding("utf8");
      this.child.stdout.on("data", (data) => this.read(data));
      this.child.stderr.resume();
      this.child.on(
        "error",
        (e) => this.fail(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C PTY: ${e.message}`)
      );
      this.child.stdin.on("error", () => {
        if (!this.closed && !this.receivedExit)
          this.fail("\u041F\u043E\u0442\u0435\u0440\u044F\u043D\u043E \u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u0441 Bash. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043D\u043E\u0432\u0443\u044E \u0441\u0435\u0441\u0441\u0438\u044E.");
      });
      this.child.on("close", (code) => {
        clearTimeout(this.timer);
        if (!this.receivedExit && !this.closed)
          this.fail(`PTY \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B\u0441\u044F \u0434\u043E \u043E\u0442\u0432\u0435\u0442\u0430 (\u043A\u043E\u0434 ${code ?? "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u0435\u043D"}).`);
      });
      this.timer = setTimeout(
        () => this.fail(
          "Bash \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B \u043F\u0440\u0438 \u0437\u0430\u043F\u0443\u0441\u043A\u0435. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u0443\u0442\u044C \u0438 \u043F\u0440\u0430\u0432\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u0430."
        ),
        1e4
      );
      this.timer.unref();
      this.send({
        type: "start",
        shell: shell.file,
        args: shell.args,
        cwd: this.cwd,
        cols: 80,
        rows: 24
      });
    } catch (e) {
      this.fail(
        e instanceof Error ? e.message : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B."
      );
    }
  }
  read(data) {
    if (this.closed) return;
    this.line += data;
    if (this.line.length > 512 * 1024) {
      this.fail("PTY \u043F\u0440\u0438\u0441\u043B\u0430\u043B \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0431\u043E\u043B\u044C\u0448\u043E\u0439 \u043E\u0442\u0432\u0435\u0442.");
      return;
    }
    let at;
    while (!this.closed && (at = this.line.indexOf("\n")) >= 0) {
      const raw = this.line.slice(0, at);
      this.line = this.line.slice(at + 1);
      try {
        const m = JSON.parse(raw);
        if (m.type === "ready" && Number.isSafeInteger(m.pid) && m.pid > 0 && this.state === "starting") {
          clearTimeout(this.timer);
          this.pid = m.pid;
          this.state = "running";
          this.emit("state");
        } else if (m.type === "data" && typeof m.data === "string" && m.data.length <= 32768 && /^[A-Za-z0-9+/]*={0,2}$/.test(m.data))
          this.output(m.data);
        else if (m.type === "exit" && Number.isInteger(m.code)) {
          clearTimeout(this.timer);
          this.receivedExit = true;
          this.state = "exited";
          this.code = m.code;
          this.emit("state");
        } else if (m.type === "error" && typeof m.message === "string")
          this.fail(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C Bash: ${m.message.slice(0, 1e3)}`);
        else this.fail("\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u044B\u0439 \u043E\u0442\u0432\u0435\u0442 PTY. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0441\u0431\u043E\u0440\u043A\u0443 \u043F\u043B\u0430\u0433\u0438\u043D\u0430.");
      } catch {
        this.fail("\u041F\u043E\u0432\u0440\u0435\u0436\u0434\u0451\u043D \u043E\u0442\u0432\u0435\u0442 PTY. \u0421\u0435\u0441\u0441\u0438\u044F \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0430.");
      }
    }
  }
  output(data) {
    this.buffer.push(data);
    this.bufferedBytes += data.length;
    while (this.bufferedBytes > 1024 * 1024) {
      this.bufferedBytes -= this.buffer.shift().length;
      this.truncated = true;
    }
    if (this.attached) {
      this.pending += data.length;
      this.emit("data", { id: this.id, data, offset: this.pending });
      if (this.pending - this.acknowledged >= 256 * 1024)
        this.child?.stdout.pause();
    }
  }
  attach() {
    this.attached = true;
    this.pending = 0;
    this.acknowledged = 0;
    if (this.truncated)
      this.emit("notice", "\u0427\u0430\u0441\u0442\u044C \u0432\u044B\u0432\u043E\u0434\u0430 \u0441\u043A\u0440\u044B\u0442\u043E\u0439 \u0441\u0435\u0441\u0441\u0438\u0438 \u043D\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u043B\u0430\u0441\u044C.");
    for (const data of this.buffer) {
      this.pending += data.length;
      this.emit("data", { id: this.id, data, offset: this.pending });
    }
    if (this.pending - this.acknowledged >= 256 * 1024)
      this.child?.stdout.pause();
    else this.child?.stdout.resume();
  }
  detach() {
    this.attached = false;
    this.pending = 0;
    this.acknowledged = 0;
    this.child?.stdout.resume();
  }
  ack(offset) {
    if (!Number.isSafeInteger(offset) || offset < this.acknowledged || offset > this.pending)
      return;
    this.acknowledged = offset;
    if (this.pending - offset < 128 * 1024) this.child?.stdout.resume();
  }
  input(data) {
    if (this.closed || this.state !== "running" || Buffer.byteLength(data, "utf8") > 32768)
      return;
    if ((this.child?.stdin.writableLength ?? 0) > 256 * 1024) {
      this.emit(
        "notice",
        "\u0412\u0432\u043E\u0434 \u043D\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D: \u043E\u0447\u0435\u0440\u0435\u0434\u044C \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u0430. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435 \u043F\u043E\u0441\u043B\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u044B."
      );
      return;
    }
    this.send({ type: "input", data: Buffer.from(data).toString("base64") });
  }
  resize(cols, rows) {
    if (Number.isInteger(cols) && cols >= 2 && cols <= 1e3 && Number.isInteger(rows) && rows >= 1 && rows <= 500)
      this.send({ type: "resize", cols, rows });
  }
  send(m) {
    if (this.child && !this.child.stdin.destroyed && !this.child.stdin.writableEnded)
      this.child.stdin.write(JSON.stringify(m) + "\n");
  }
  fail(message) {
    if (this.closed) return;
    this.error = message;
    this.state = "error";
    this.emit("state");
    this.close();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.child?.stdout.resume();
    this.send({ type: "close" });
    this.child?.stdin.end();
    const child = this.child;
    if (child) {
      const timer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGTERM");
      }, 1500);
      timer.unref();
      child.once("close", () => clearTimeout(timer));
    }
  }
};

// src/shell.ts
var import_promises2 = __toESM(require("node:fs/promises"));
var import_node_fs = require("node:fs");
var import_node_path2 = __toESM(require("node:path"));
var import_node_os = __toESM(require("node:os"));
function bashCandidates(platform, env) {
  const p = platform === "win32" ? import_node_path2.default.win32 : import_node_path2.default.posix;
  const value = (key) => Object.entries(env).find(
    ([k]) => k.toLowerCase() === key.toLowerCase()
  )?.[1];
  const search = (value("PATH") ?? "").split(platform === "win32" ? ";" : ":").map((s) => s.replace(/^"|"$/g, ""));
  const system = platform === "win32" ? [
    value("ProgramW6432"),
    value("ProgramFiles"),
    value("ProgramFiles(x86)")
  ].filter((v) => !!v).flatMap((v) => [
    p.join(v, "Git", "bin", "bash.exe"),
    p.join(v, "Git", "usr", "bin", "bash.exe")
  ]) : [
    "/bin/bash",
    "/usr/bin/bash",
    "/usr/local/bin/bash",
    "/opt/homebrew/bin/bash"
  ];
  const candidates = [
    ...system,
    ...search.filter((s) => p.isAbsolute(s)).map((s) => p.join(s, platform === "win32" ? "bash.exe" : "bash"))
  ];
  return [...new Set(candidates)].filter(
    (s) => !/[\r\n\0]/.test(s) && !(platform === "win32" && /\\(?:System32|WindowsApps)\\bash\.exe$/i.test(s))
  );
}
async function resolveBash(configured = "", platform = process.platform, env = process.env) {
  if (!["linux", "darwin", "win32"].includes(platform))
    throw new Error("\u042D\u0442\u0430 \u043E\u043F\u0435\u0440\u0430\u0446\u0438\u043E\u043D\u043D\u0430\u044F \u0441\u0438\u0441\u0442\u0435\u043C\u0430 \u043F\u043E\u043A\u0430 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F.");
  if (configured && (!import_node_path2.default.isAbsolute(configured) || /[\r\n\0]/.test(configured)))
    throw new Error("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0430\u0431\u0441\u043E\u043B\u044E\u0442\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A Bash \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435.");
  for (const candidate of configured ? [configured] : bashCandidates(platform, env)) {
    try {
      const real = await import_promises2.default.realpath(candidate);
      const st = await import_promises2.default.stat(real);
      if (!st.isFile()) continue;
      if (platform !== "win32") await import_promises2.default.access(real, import_node_fs.constants.X_OK);
      return {
        file: real,
        args: platform === "win32" ? ["--login", "-i"] : ["-i"]
      };
    } catch {
    }
  }
  throw new Error(
    platform === "win32" ? "Bash \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435. \u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0435 Git for Windows \u0438 \u0432\u044B\u0431\u0435\u0440\u0438\u0442\u0435 bin/bash.exe \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0435 \u043F\u043B\u0430\u0433\u0438\u043D\u0430." : "Bash \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435. \u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u0443\u0442\u044C \u043A \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u043E\u043C\u0443 Bash."
  );
}
async function workingDirectory(candidate) {
  const directory = await import_promises2.default.realpath(candidate ?? import_node_os.default.homedir());
  if (!(await import_promises2.default.stat(directory)).isDirectory())
    throw new Error("\u0420\u0430\u0431\u043E\u0447\u0438\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D.");
  return directory;
}

// src/webview.ts
var import_node_crypto2 = require("node:crypto");
var import_node_fs2 = __toESM(require("node:fs"));
var import_node_path3 = __toESM(require("node:path"));
var svg = (body) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">${body}</svg>`;
function html(root) {
  const nonce = (0, import_node_crypto2.randomBytes)(24).toString("base64");
  const script = import_node_fs2.default.readFileSync(import_node_path3.default.join(root, "dist/terminal.js"), "utf8").replace(/<\/script/gi, "<\\/script");
  const css = import_node_fs2.default.readFileSync(import_node_path3.default.join(root, "dist/terminal.css"), "utf8").replace(/<\/style/gi, "<\\/style");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; font-src 'none'; img-src data:; connect-src 'none';"><style>${css}</style></head><body>
 <!-- THESIS: Bash beside code in the IDE bottom panel.
 OWN-WORLD: VS Code host theme tokens, compact controls, monospace terminal.
 STORY: Open a server session, run commands, switch or close sessions.
 FIRST VIEWPORT: A 36px toolbar, flexible terminal, and a 24px workspace footer; the empty state offers Open Bash.
 FORM: Native IDE panel; pinned reference from the owner, seed key user-vscode-terminal.
 FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->
 <header class="toolbar"><div class="session-controls"><label class="session-picker"><span class="sr-only">\u0421\u0435\u0441\u0441\u0438\u044F Bash</span><select id="sessions" aria-label="\u0421\u0435\u0441\u0441\u0438\u044F Bash"><option value="">\u041D\u0435\u0442 \u0441\u0435\u0441\u0441\u0438\u0439</option></select></label>
 <button id="rename" title="\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C \u0441\u0435\u0441\u0441\u0438\u044E" aria-label="\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C \u0441\u0435\u0441\u0441\u0438\u044E" disabled>${svg('<path d="m3 10 8-8 3 3-8 8-4 1zM9 4l3 3"/>')}</button>
 </div><span id="status" role="status">\u0421\u0435\u0440\u0432\u0435\u0440</span><div class="actions">
 <button id="clear" title="\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u044D\u043A\u0440\u0430\u043D" aria-label="\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u044D\u043A\u0440\u0430\u043D" disabled>${svg('<path d="m3 11 7-8 3 3-7 8H3l-1-1zM7 7l3 3M8 14h6"/>')}</button>
 <button id="close" title="\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0441\u0435\u0441\u0441\u0438\u044E" aria-label="\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0441\u0435\u0441\u0441\u0438\u044E" disabled>${svg('<path d="M3 4h10M6 2h4M4 4l1 10h6l1-10M7 6v6M9 6v6"/>')}</button>
 <button id="configure" title="\u041F\u0443\u0442\u044C \u043A Bash" aria-label="\u041F\u0443\u0442\u044C \u043A Bash">${svg('<circle cx="8" cy="8" r="3"/><path d="M8 1v3m0 8v3M1 8h3m8 0h3M3 3l2 2m6 6 2 2M3 13l2-2m6-6 2-2"/>')}</button>
 </div></header>
 <div id="notice" role="alert" hidden></div>
 <main id="terminals" aria-label="\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B Bash"><div id="empty"><div class="terminal-mark">${svg('<path d="m3 4 4 4-4 4m6 0h5"/>')}</div><h1>Bash \u0432 \u0432\u0430\u0448\u0435\u0439 IDE</h1><p>\u0412\u044B\u043F\u043E\u043B\u043D\u044F\u0439\u0442\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B \u0432 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435.</p><button id="start" class="primary">\u041E\u0442\u043A\u0440\u044B\u0442\u044C Bash</button></div></main>
 <footer><span id="location">\u041A\u043E\u043C\u0430\u043D\u0434\u044B \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u044E\u0442\u0441\u044F \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435 \u042D\u043B\u0435\u043C\u0435\u043D\u0442\u0430</span></footer>
 <script nonce="${nonce}">${script}</script></body></html>`;
}

// src/extension.ts
function sessionNameError(value) {
  if (!value.trim()) return "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0441\u0435\u0441\u0441\u0438\u0438.";
  if (value.trim().length > 80)
    return "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043D\u0435 \u0434\u043B\u0438\u043D\u043D\u0435\u0435 80 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432.";
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value))
    return "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u043E\u0434\u043D\u043E\u0439 \u0441\u0442\u0440\u043E\u043A\u043E\u0439 \u0431\u0435\u0437 \u0443\u043F\u0440\u0430\u0432\u043B\u044F\u044E\u0449\u0438\u0445 \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432.";
  return void 0;
}
var TerminalView = class {
  constructor(root) {
    this.root = root;
  }
  view;
  sessions = /* @__PURE__ */ new Map();
  serial = 0;
  disposed = false;
  creating = 0;
  ready = false;
  renaming = false;
  resolveWebviewView(view) {
    this.view = view;
    this.ready = false;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = html(this.root);
    const receiver = view.webview.onDidReceiveMessage((m) => {
      if (this.view === view) this.message(m);
    });
    view.onDidDispose(() => {
      receiver.dispose();
      if (this.view === view) {
        this.view = void 0;
        this.ready = false;
        this.stopAll();
      }
    });
  }
  post(m) {
    if (this.ready && this.view) void this.view.webview.postMessage(m);
  }
  state() {
    this.post({
      type: "state",
      sessions: [...this.sessions.values()].map((s) => s.snapshot())
    });
  }
  message(m) {
    if (!m || typeof m !== "object" || Array.isArray(m) || typeof m.type !== "string")
      return;
    if (m.type === "ready") {
      for (const s of this.sessions.values()) s.detach();
      this.ready = true;
      this.state();
      for (const s of this.sessions.values()) s.attach();
      return;
    }
    if (!this.ready) return;
    if (m.type === "new") {
      void this.create();
      return;
    }
    if (m.type === "configure") {
      void this.configure();
      return;
    }
    if (typeof m.id !== "string") return;
    const session = this.sessions.get(m.id);
    if (!session) return;
    if (m.type === "rename") {
      void this.rename(session);
      return;
    }
    if (m.type === "input" && typeof m.data === "string" && m.data.length <= 32768)
      session.input(m.data);
    if (m.type === "resize") session.resize(m.cols, m.rows);
    if (m.type === "ack") session.ack(m.offset);
    if (m.type === "close") {
      session.close();
      this.sessions.delete(m.id);
      this.state();
    }
  }
  async rename(session) {
    if (this.renaming) return;
    this.renaming = true;
    try {
      const value = await vscode.window.showInputBox({
        title: "\u041F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C \u0441\u0435\u0441\u0441\u0438\u044E",
        prompt: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0432 \u0441\u043F\u0438\u0441\u043A\u0435 \u0442\u0435\u0440\u043C\u0438\u043D\u0430\u043B\u043E\u0432",
        value: session.name,
        validateInput: sessionNameError
      });
      if (value === void 0 || this.disposed || this.sessions.get(session.id) !== session)
        return;
      const error = sessionNameError(value);
      if (error) {
        await vscode.window.showErrorMessage(error);
        return;
      }
      session.name = value.trim();
      this.state();
    } catch (e) {
      await vscode.window.showErrorMessage(
        e instanceof Error ? e.message : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u0442\u044C \u0441\u0435\u0441\u0441\u0438\u044E."
      );
    } finally {
      this.renaming = false;
    }
  }
  async create() {
    if (this.disposed) return;
    if (this.sessions.size + this.creating >= 8) {
      this.post({
        type: "notice",
        message: "\u041E\u0442\u043A\u0440\u044B\u0442\u043E 8 \u0441\u0435\u0441\u0441\u0438\u0439. \u0417\u0430\u043A\u0440\u043E\u0439\u0442\u0435 \u043D\u0435\u043D\u0443\u0436\u043D\u0443\u044E, \u0447\u0442\u043E\u0431\u044B \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043D\u043E\u0432\u0443\u044E."
      });
      return;
    }
    this.creating++;
    const view = this.view;
    try {
      const config = vscode.workspace.getConfiguration("xbslTerminal").inspect("bashPath");
      const shell = await resolveBash(config?.globalValue ?? "");
      const folders = vscode.workspace.workspaceFolders ?? [];
      let folder = vscode.window.activeTextEditor ? vscode.workspace.getWorkspaceFolder(
        vscode.window.activeTextEditor.document.uri
      ) : void 0;
      if (!folder && folders.length > 1) {
        const chosen = await vscode.window.showQuickPick(
          folders.map((f) => ({
            label: f.name,
            description: f.uri.fsPath,
            folder: f
          })),
          { placeHolder: "\u0420\u0430\u0431\u043E\u0447\u0438\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u043D\u043E\u0432\u043E\u0439 \u0441\u0435\u0441\u0441\u0438\u0438" }
        );
        if (!chosen) return;
        folder = chosen.folder;
      }
      folder ??= folders[0];
      if (folder && folder.uri.scheme !== "file")
        throw new Error(
          "\u042D\u0442\u043E\u0442 workspace \u043D\u0435 \u043F\u0440\u0435\u0434\u043E\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043A\u0430\u0442\u0430\u043B\u043E\u0433 \u0441\u0435\u0440\u0432\u0435\u0440\u043D\u043E\u043C\u0443 host."
        );
      const cwd = await workingDirectory(folder?.uri.fsPath);
      if (this.disposed || view && this.view !== view) return;
      const session = new Session(`bash ${++this.serial}`, cwd);
      this.sessions.set(session.id, session);
      session.on("state", () => this.state());
      session.on("data", (m) => this.post({ type: "data", ...m }));
      session.on("notice", (message) => this.post({ type: "notice", message }));
      this.state();
      if (this.ready) session.attach();
      await session.start(this.root, shell);
    } catch (e) {
      const message = e instanceof Error ? e.message : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0441\u0435\u0441\u0441\u0438\u044E.";
      if (this.ready) this.post({ type: "notice", message });
      else await vscode.window.showErrorMessage(message);
    } finally {
      this.creating--;
    }
  }
  async configure() {
    const current = vscode.workspace.getConfiguration("xbslTerminal").inspect("bashPath")?.globalValue ?? "";
    const value = await vscode.window.showInputBox({
      title: "Bash \u043D\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435",
      prompt: "\u0410\u0431\u0441\u043E\u043B\u044E\u0442\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u043A bash \u0438\u043B\u0438 bash.exe. \u041F\u0443\u0441\u0442\u043E\u0435 \u043F\u043E\u043B\u0435 \u0432\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043F\u043E\u0438\u0441\u043A.",
      value: current,
      ignoreFocusOut: true
    });
    if (value === void 0) return;
    try {
      if (value) await resolveBash(value);
      await vscode.workspace.getConfiguration("xbslTerminal").update("bashPath", value, vscode.ConfigurationTarget.Global);
      this.post({
        type: "notice",
        message: "\u041F\u0443\u0442\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043D\u043E\u0432\u0443\u044E \u0441\u0435\u0441\u0441\u0438\u044E."
      });
    } catch (e) {
      await vscode.window.showErrorMessage(
        e instanceof Error ? e.message : "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043F\u0443\u0442\u044C."
      );
    }
  }
  stopAll() {
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
  }
  dispose() {
    this.disposed = true;
    this.stopAll();
  }
};
function activate(context) {
  const provider = new TerminalView(context.extensionPath);
  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider(
      "xbslTerminal.console",
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.commands.registerCommand("xbslTerminal.new", async () => {
      try {
        await vscode.commands.executeCommand("xbslTerminal.console.focus");
      } catch {
        await vscode.window.showErrorMessage(
          "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043D\u0438\u0436\u043D\u044E\u044E \u043F\u0430\u043D\u0435\u043B\u044C. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \xAB\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B\xBB \u0447\u0435\u0440\u0435\u0437 \u043C\u0435\u043D\u044E \u043F\u0430\u043D\u0435\u043B\u0435\u0439 IDE."
        );
        return;
      }
      await provider.create();
    }),
    vscode.commands.registerCommand(
      "xbslTerminal.configure",
      () => provider.configure()
    )
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
