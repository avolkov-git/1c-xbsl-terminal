import * as vscode from "vscode";
import { Session } from "./session";
import { resolveBash, workingDirectory } from "./shell";
import { html } from "./webview";

function sessionNameError(value: string) {
  if (!value.trim()) return "Введите название сессии.";
  if (value.trim().length > 80)
    return "Название должно быть не длиннее 80 символов.";
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value))
    return "Название должно быть одной строкой без управляющих символов.";
  return undefined;
}

class TerminalView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private sessions = new Map<string, Session>();
  private serial = 0;
  private disposed = false;
  private creating = 0;
  private ready = false;
  private renaming = false;
  constructor(private readonly root: string) {}
  resolveWebviewView(view: vscode.WebviewView) {
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
        this.view = undefined;
        this.ready = false;
        this.stopAll();
      }
    });
  }
  private post(m: unknown) {
    if (this.ready && this.view) void this.view.webview.postMessage(m);
  }
  private state() {
    this.post({
      type: "state",
      sessions: [...this.sessions.values()].map((s) => s.snapshot()),
    });
  }
  private message(m: any) {
    if (
      !m ||
      typeof m !== "object" ||
      Array.isArray(m) ||
      typeof m.type !== "string"
    )
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
    if (
      m.type === "input" &&
      typeof m.data === "string" &&
      m.data.length <= 32768
    )
      session.input(m.data);
    if (m.type === "resize") session.resize(m.cols, m.rows);
    if (m.type === "ack") session.ack(m.offset);
    if (m.type === "close") {
      session.close();
      this.sessions.delete(m.id);
      this.state();
    }
  }
  private async rename(session: Session) {
    if (this.renaming) return;
    this.renaming = true;
    try {
      const value = await vscode.window.showInputBox({
        title: "Переименовать сессию",
        prompt: "Название в списке терминалов",
        value: session.name,
        validateInput: sessionNameError,
      });
      if (
        value === undefined ||
        this.disposed ||
        this.sessions.get(session.id) !== session
      )
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
        e instanceof Error ? e.message : "Не удалось переименовать сессию.",
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
        message: "Открыто 8 сессий. Закройте ненужную, чтобы добавить новую.",
      });
      return;
    }
    this.creating++;
    const view = this.view;
    try {
      const config = vscode.workspace
        .getConfiguration("xbslTerminal")
        .inspect<string>("bashPath");
      const shell = await resolveBash(config?.globalValue ?? "");
      const folders = vscode.workspace.workspaceFolders ?? [];
      let folder = vscode.window.activeTextEditor
        ? vscode.workspace.getWorkspaceFolder(
            vscode.window.activeTextEditor.document.uri,
          )
        : undefined;
      if (!folder && folders.length > 1) {
        const chosen = await vscode.window.showQuickPick(
          folders.map((f) => ({
            label: f.name,
            description: f.uri.fsPath,
            folder: f,
          })),
          { placeHolder: "Рабочий каталог новой сессии" },
        );
        if (!chosen) return;
        folder = chosen.folder;
      }
      folder ??= folders[0];
      if (folder && folder.uri.scheme !== "file")
        throw new Error(
          "Этот workspace не предоставляет локальный каталог серверному host.",
        );
      const cwd = await workingDirectory(folder?.uri.fsPath);
      if (this.disposed || (view && this.view !== view)) return;
      const session = new Session(`bash ${++this.serial}`, cwd);
      this.sessions.set(session.id, session);
      session.on("state", () => this.state());
      session.on("data", (m) => this.post({ type: "data", ...m }));
      session.on("notice", (message) => this.post({ type: "notice", message }));
      this.state();
      if (this.ready) session.attach();
      await session.start(this.root, shell);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Не удалось создать сессию.";
      if (this.ready) this.post({ type: "notice", message });
      else await vscode.window.showErrorMessage(message);
    } finally {
      this.creating--;
    }
  }
  async configure() {
    const current =
      vscode.workspace
        .getConfiguration("xbslTerminal")
        .inspect<string>("bashPath")?.globalValue ?? "";
    const value = await vscode.window.showInputBox({
      title: "Bash на сервере",
      prompt:
        "Абсолютный путь к bash или bash.exe. Пустое поле включает поиск.",
      value: current,
      ignoreFocusOut: true,
    });
    if (value === undefined) return;
    try {
      if (value) await resolveBash(value);
      await vscode.workspace
        .getConfiguration("xbslTerminal")
        .update("bashPath", value, vscode.ConfigurationTarget.Global);
      this.post({
        type: "notice",
        message: "Путь сохранён. Откройте новую сессию.",
      });
    } catch (e) {
      await vscode.window.showErrorMessage(
        e instanceof Error ? e.message : "Не удалось сохранить путь.",
      );
    }
  }
  private stopAll() {
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
  }
  dispose() {
    this.disposed = true;
    this.stopAll();
  }
}
export function activate(context: vscode.ExtensionContext) {
  const provider = new TerminalView(context.extensionPath);
  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider(
      "xbslTerminal.console",
      provider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.commands.registerCommand("xbslTerminal.new", async () => {
      try {
        await vscode.commands.executeCommand("xbslTerminal.console.focus");
      } catch {
        await vscode.window.showErrorMessage(
          "Не удалось открыть нижнюю панель. Откройте «Терминал» через меню панелей IDE.",
        );
        return;
      }
      await provider.create();
    }),
    vscode.commands.registerCommand("xbslTerminal.configure", () =>
      provider.configure(),
    ),
  );
}
export function deactivate() {}
