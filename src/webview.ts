import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const svg = (body: string) =>
  `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">${body}</svg>`;
export function html(root: string) {
  const nonce = randomBytes(24).toString("base64");
  const script = fs
    .readFileSync(path.join(root, "dist/terminal.js"), "utf8")
    .replace(/<\/script/gi, "<\\/script");
  const css = fs
    .readFileSync(path.join(root, "dist/terminal.css"), "utf8")
    .replace(/<\/style/gi, "<\\/style");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; font-src 'none'; img-src data:; connect-src 'none';"><style>${css}</style></head><body>
 <!-- THESIS: Bash beside code in the IDE bottom panel.
 OWN-WORLD: VS Code host theme tokens, compact controls, monospace terminal.
 STORY: Open a server session, run commands, switch or close sessions.
 FIRST VIEWPORT: A 36px toolbar, flexible terminal, and a 24px workspace footer; the empty state offers Open Bash.
 FORM: Native IDE panel; pinned reference from the owner, seed key user-vscode-terminal.
 FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->
 <header class="toolbar"><div class="session-controls"><label class="session-picker"><span class="sr-only">Сессия Bash</span><select id="sessions" aria-label="Сессия Bash"><option value="">Нет сессий</option></select></label>
 <button id="rename" title="Переименовать сессию" aria-label="Переименовать сессию" disabled>${svg('<path d="m3 10 8-8 3 3-8 8-4 1zM9 4l3 3"/>')}</button>
 </div><span id="status" role="status">Сервер</span><div class="actions">
 <button id="clear" title="Очистить экран" aria-label="Очистить экран" disabled>${svg('<path d="m3 11 7-8 3 3-7 8H3l-1-1zM7 7l3 3M8 14h6"/>')}</button>
 <button id="close" title="Закрыть сессию" aria-label="Закрыть сессию" disabled>${svg('<path d="M3 4h10M6 2h4M4 4l1 10h6l1-10M7 6v6M9 6v6"/>')}</button>
 <button id="configure" title="Путь к Bash" aria-label="Путь к Bash">${svg('<circle cx="8" cy="8" r="3"/><path d="M8 1v3m0 8v3M1 8h3m8 0h3M3 3l2 2m6 6 2 2M3 13l2-2m6-6 2-2"/>')}</button>
 </div></header>
 <div id="notice" role="alert" hidden></div>
 <main id="terminals" aria-label="Терминал Bash"><div id="empty"><div class="terminal-mark">${svg('<path d="m3 4 4 4-4 4m6 0h5"/>')}</div><h1>Bash в вашей IDE</h1><p>Выполняйте команды в каталоге проекта на сервере.</p><button id="start" class="primary">Открыть Bash</button></div></main>
 <footer><span id="location">Команды выполняются на сервере Элемента</span></footer>
 <script nonce="${nonce}">${script}</script></body></html>`;
}
