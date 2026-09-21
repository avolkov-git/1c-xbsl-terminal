import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
declare function acquireVsCodeApi(): { postMessage(m: unknown): void };
const api = acquireVsCodeApi();
const select = document.querySelector<HTMLSelectElement>("#sessions")!;
const empty = document.querySelector<HTMLElement>("#empty")!;
const root = document.querySelector<HTMLElement>("#terminals")!;
const status = document.querySelector<HTMLElement>("#status")!;
const location = document.querySelector<HTMLElement>("#location")!;
const notice = document.querySelector<HTMLElement>("#notice")!;
const sessions = new Map<
  string,
  { terminal: Terminal; fit: FitAddon; element: HTMLDivElement; state: any }
>();
let active = "";
let noticeSession: string | undefined;
function theme(): ITheme {
  const style = getComputedStyle(document.body);
  const color = (name: string, fallback: string) =>
    style.getPropertyValue(`--vscode-${name}`).trim() || fallback;
  const light = document.body.classList.contains("vscode-light");
  return {
    background: color(
      "terminal-background",
      color("panel-background", light ? "#ffffff" : "#1e1e1e"),
    ),
    foreground: color(
      "terminal-foreground",
      color("foreground", light ? "#333333" : "#cccccc"),
    ),
    cursor: color("terminalCursor-foreground", light ? "#333333" : "#ffffff"),
    selectionBackground: color("terminal-selectionBackground", "#264f78"),
    ...Object.fromEntries(
      [
        "black",
        "red",
        "green",
        "yellow",
        "blue",
        "magenta",
        "cyan",
        "white",
        "brightBlack",
        "brightRed",
        "brightGreen",
        "brightYellow",
        "brightBlue",
        "brightMagenta",
        "brightCyan",
        "brightWhite",
      ].map((key, i) => [
        key,
        color(
          "terminal-ansi" + key[0].toUpperCase() + key.slice(1),
          [
            "#000000",
            "#cd3131",
            "#0dbc79",
            "#e5e510",
            "#2472c8",
            "#bc3fbc",
            "#11a8cd",
            "#e5e5e5",
            "#666666",
            "#f14c4c",
            "#23d18b",
            "#f5f543",
            "#3b8eea",
            "#d670d6",
            "#29b8db",
            "#e5e5e5",
          ][i],
        ),
      ]),
    ),
  };
}
function resize() {
  const s = sessions.get(active);
  if (!s) return;
  s.fit.fit();
  api.postMessage({
    type: "resize",
    id: active,
    cols: s.terminal.cols,
    rows: s.terminal.rows,
  });
}
function choose(id: string, focus = true) {
  if (noticeSession && noticeSession !== id) {
    notice.hidden = true;
    notice.textContent = "";
    noticeSession = undefined;
  }
  active = id;
  select.value = id;
  for (const [key, s] of sessions) s.element.hidden = key !== id;
  const s = sessions.get(id);
  empty.hidden = !!s;
  for (const name of ["clear", "close"])
    document.querySelector<HTMLButtonElement>("#" + name)!.disabled = !s;
  if (s) {
    const labels: Record<string, string> = {
      starting: "Запуск…",
      running: "Bash · сервер",
      exited: `Завершён · ${s.state.code ?? "—"}`,
      error: "Ошибка",
    };
    status.textContent = labels[s.state.state] ?? "Сервер";
    location.textContent = s.state.cwd;
    location.title = s.state.cwd;
    resize();
    if (focus) s.terminal.focus();
    if (s.state.error) showNotice(s.state.error, id);
  } else {
    status.textContent = "Сервер";
    location.textContent = "Команды выполняются на сервере Элемента";
  }
}
function showNotice(text: string, sessionId?: string) {
  noticeSession = sessionId;
  notice.textContent = text;
  notice.hidden = false;
  resize();
}
window.addEventListener("message", (e) => {
  const m = e.data;
  if (!m || typeof m !== "object") return;
  if (m.type === "state" && Array.isArray(m.sessions)) {
    const ids = new Set(m.sessions.map((s: any) => s.id));
    for (const [id, s] of sessions)
      if (!ids.has(id)) {
        s.terminal.dispose();
        s.element.remove();
        sessions.delete(id);
      }
    let newest = "";
    for (const state of m.sessions) {
      let s = sessions.get(state.id);
      if (!s) {
        const element = document.createElement("div");
        element.className = "terminal-surface";
        element.hidden = true;
        root.append(element);
        const terminal = new Terminal({
          cursorBlink: true,
          scrollback: 2000,
          theme: theme(),
          fontFamily:
            getComputedStyle(document.body)
              .getPropertyValue("--vscode-editor-font-family")
              .trim() || 'Consolas, "Liberation Mono", monospace',
          fontSize: 13,
          minimumContrastRatio: 4.5,
          screenReaderMode: true,
          allowProposedApi: false,
        });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(element);
        terminal.onData((data) => {
          for (let n = 0; n < data.length; ) {
            let end = Math.min(n + 8192, data.length);
            const last = data.charCodeAt(end - 1);
            if (end < data.length && last >= 0xd800 && last <= 0xdbff) end--;
            api.postMessage({
              type: "input",
              id: state.id,
              data: data.slice(n, end),
            });
            n = end;
          }
        });

        s = { element, terminal, fit, state };
        sessions.set(state.id, s);
        newest = state.id;
      }
      s.state = state;
    }
    select.replaceChildren(
      ...m.sessions.map((s: any) => {
        const o = document.createElement("option");
        o.value = s.id;
        o.textContent =
          s.name +
          (s.state === "exited"
            ? " · завершён"
            : s.state === "error"
              ? " · ошибка"
              : "");
        return o;
      }),
    );
    if (!sessions.size) {
      const o = document.createElement("option");
      o.textContent = "Нет сессий";
      o.value = "";
      select.append(o);
    }
    choose(
      newest ||
        (sessions.has(active) ? active : ([...sessions.keys()][0] ?? "")),
      !!newest,
    );
  } else if (
    m.type === "data" &&
    typeof m.id === "string" &&
    typeof m.data === "string"
  ) {
    const s = sessions.get(m.id);
    if (!s) return;
    const bytes = Uint8Array.from(atob(m.data), (c) => c.charCodeAt(0));
    s.terminal.write(bytes, () =>
      api.postMessage({ type: "ack", id: m.id, offset: m.offset }),
    );
  } else if (m.type === "notice" && typeof m.message === "string")
    showNotice(m.message);
});
select.addEventListener("change", () => choose(select.value));
for (const name of ["new", "start"])
  document.querySelector("#" + name)!.addEventListener("click", () => {
    notice.hidden = true;
    api.postMessage({ type: "new" });
  });
document
  .querySelector("#close")!
  .addEventListener("click", () =>
    api.postMessage({ type: "close", id: active }),
  );
document.querySelector("#clear")!.addEventListener("click", () => {
  sessions.get(active)?.terminal.clear();
  sessions.get(active)?.terminal.focus();
});
document
  .querySelector("#configure")!
  .addEventListener("click", () => api.postMessage({ type: "configure" }));
new ResizeObserver(resize).observe(root);
new MutationObserver(() => {
  for (const s of sessions.values()) s.terminal.options.theme = theme();
}).observe(document.body, {
  attributes: true,
  attributeFilter: ["class", "style"],
});
api.postMessage({ type: "ready" });
