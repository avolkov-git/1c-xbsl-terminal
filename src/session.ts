import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";

export type SessionState = "starting" | "running" | "exited" | "error";
export async function helperPath(root: string) {
  const key = `${process.platform}-${process.arch}`;
  const expected = `bin/${key}/terminal-pty${process.platform === "win32" ? ".exe" : ""}`;
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "bin/runtime.json"), "utf8"),
  );
  const entry = manifest.files?.[key];
  if (manifest.protocol !== 1 || entry?.file !== expected)
    throw new Error("В пакете нет PTY для этой ОС и архитектуры сервера.");
  const file = path.join(root, expected);
  const stat = await fs.lstat(file);
  if (
    (await fs.realpath(file)) !== path.join(await fs.realpath(root), expected)
  )
    throw new Error("PTY не должен быть ссылкой за пределы пакета.");
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size !== entry.size ||
    stat.size > 16 * 1024 * 1024
  )
    throw new Error("PTY повреждён. Перенесите полный пакет плагина.");
  const bytes = await fs.readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
    throw new Error(
      "Контрольная сумма PTY не совпала. Замените пакет плагина.",
    );
  if (process.platform !== "win32" && !(stat.mode & 0o100))
    await fs.chmod(file, 0o755);
  return file;
}
export class Session extends EventEmitter {
  readonly id = randomUUID();
  state: SessionState = "starting";
  pid: number | null = null;
  code: number | null = null;
  error = "";
  private child?: ChildProcessWithoutNullStreams;
  private line = "";
  private closed = false;
  private receivedExit = false;
  private timer?: NodeJS.Timeout;
  private pending = 0;
  private acknowledged = 0;
  private attached = false;
  private buffer: string[] = [];
  private bufferedBytes = 0;
  private truncated = false;
  constructor(
    readonly name: string,
    readonly cwd: string,
  ) {
    super();
  }
  snapshot() {
    return {
      id: this.id,
      name: this.name,
      cwd: this.cwd,
      state: this.state,
      pid: this.pid,
      code: this.code,
      error: this.error,
    };
  }
  async start(root: string, shell: { file: string; args: string[] }) {
    try {
      const helper = await helperPath(root);
      if (this.closed) return;
      this.child = spawn(helper, [], {
        stdio: "pipe",
        windowsHide: true,
        cwd: this.cwd,
        env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
      });
      this.child.stdout.setEncoding("utf8");
      this.child.stdout.on("data", (data: string) => this.read(data));
      // Errors go to the UI, never log a transcript or inherited environment.
      this.child.stderr.resume();
      this.child.on("error", (e) =>
        this.fail(`Не удалось запустить PTY: ${e.message}`),
      );
      this.child.stdin.on("error", () => {
        if (!this.closed && !this.receivedExit)
          this.fail("Потеряно соединение с Bash. Откройте новую сессию.");
      });
      this.child.on("close", (code) => {
        clearTimeout(this.timer);
        if (!this.receivedExit && !this.closed)
          this.fail(`PTY завершился до ответа (код ${code ?? "неизвестен"}).`);
      });
      this.timer = setTimeout(
        () =>
          this.fail(
            "Bash не ответил при запуске. Проверьте путь и права серверного процесса.",
          ),
        10000,
      );
      this.timer.unref();
      this.send({
        type: "start",
        shell: shell.file,
        args: shell.args,
        cwd: this.cwd,
        cols: 80,
        rows: 24,
      });
    } catch (e) {
      this.fail(
        e instanceof Error ? e.message : "Не удалось открыть терминал.",
      );
    }
  }
  private read(data: string) {
    if (this.closed) return;
    this.line += data;
    if (this.line.length > 512 * 1024) {
      this.fail("PTY прислал слишком большой ответ.");
      return;
    }
    let at: number;
    while (!this.closed && (at = this.line.indexOf("\n")) >= 0) {
      const raw = this.line.slice(0, at);
      this.line = this.line.slice(at + 1);
      try {
        const m = JSON.parse(raw);
        if (
          m.type === "ready" &&
          Number.isSafeInteger(m.pid) &&
          m.pid > 0 &&
          this.state === "starting"
        ) {
          clearTimeout(this.timer);
          this.pid = m.pid;
          this.state = "running";
          this.emit("state");
        } else if (
          m.type === "data" &&
          typeof m.data === "string" &&
          m.data.length <= 32768 &&
          /^[A-Za-z0-9+/]*={0,2}$/.test(m.data)
        )
          this.output(m.data);
        else if (m.type === "exit" && Number.isInteger(m.code)) {
          clearTimeout(this.timer);
          this.receivedExit = true;
          this.state = "exited";
          this.code = m.code;
          this.emit("state");
        } else if (m.type === "error" && typeof m.message === "string")
          this.fail(`Не удалось запустить Bash: ${m.message.slice(0, 1000)}`);
        else this.fail("Неизвестный ответ PTY. Проверьте сборку плагина.");
      } catch {
        this.fail("Повреждён ответ PTY. Сессия остановлена.");
      }
    }
  }
  private output(data: string) {
    this.buffer.push(data);
    this.bufferedBytes += data.length;
    while (this.bufferedBytes > 1024 * 1024) {
      this.bufferedBytes -= this.buffer.shift()!.length;
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
      this.emit("notice", "Часть вывода скрытой сессии не сохранилась.");
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
  ack(offset: number) {
    if (
      !Number.isSafeInteger(offset) ||
      offset < this.acknowledged ||
      offset > this.pending
    )
      return;
    this.acknowledged = offset;
    if (this.pending - offset < 128 * 1024) this.child?.stdout.resume();
  }
  input(data: string) {
    if (
      this.closed ||
      this.state !== "running" ||
      Buffer.byteLength(data, "utf8") > 32768
    )
      return;
    if ((this.child?.stdin.writableLength ?? 0) > 256 * 1024) {
      this.emit(
        "notice",
        "Ввод не отправлен: очередь заполнена. Повторите после завершения команды.",
      );
      return;
    }
    this.send({ type: "input", data: Buffer.from(data).toString("base64") });
  }
  resize(cols: number, rows: number) {
    if (
      Number.isInteger(cols) &&
      cols >= 2 &&
      cols <= 1000 &&
      Number.isInteger(rows) &&
      rows >= 1 &&
      rows <= 500
    )
      this.send({ type: "resize", cols, rows });
  }
  private send(m: unknown) {
    if (
      this.child &&
      !this.child.stdin.destroyed &&
      !this.child.stdin.writableEnded
    )
      this.child.stdin.write(JSON.stringify(m) + "\n");
  }
  private fail(message: string) {
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
}
