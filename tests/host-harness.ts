import Module from "node:module";
import path from "node:path";
import type { InputBoxOptions } from "vscode";

/** Public API test double. This is not an Element runtime. */
export function hostHarness(root: string, cwd: string) {
  const commands = new Map<string, (...args: any[]) => any>();
  const messages: any[] = [];
  const subscriptions: { dispose(): void }[] = [];
  const errors: string[] = [];
  const inputRequests: InputBoxOptions[] = [];
  let provider: any,
    receiver: ((m: any) => void) | undefined,
    disposer: (() => void) | undefined,
    mounted = false;
  let globalValue = "",
    workspaceValue = "/workspace/must-not-be-executed",
    pick: string | undefined;
  let sink: ((m: any) => void) | undefined;
  const folder = {
    name: "test workspace",
    uri: { scheme: "file", fsPath: cwd },
  };
  const view = {
    webview: {
      html: "",
      options: {},
      onDidReceiveMessage(cb: (m: any) => void) {
        receiver = cb;
        return {
          dispose() {
            receiver = undefined;
          },
        };
      },
      postMessage(m: any) {
        messages.push(m);
        sink?.(m);
        return Promise.resolve(true);
      },
    },
    onDidDispose(cb: () => void) {
      disposer = cb;
      return { dispose() {} };
    },
  };
  const config = {
    inspect: () => ({ globalValue, workspaceValue }),
    update: async (_key: string, value: string, target: number) => {
      if (target !== 1) throw Error("Expected Global config");
      globalValue = value;
    },
  };
  const api = {
    ConfigurationTarget: { Global: 1 },
    workspace: {
      workspaceFolders: [folder],
      getWorkspaceFolder: () => folder,
      getConfiguration: () => config,
    },
    window: {
      activeTextEditor: undefined,
      registerWebviewViewProvider(id: string, p: any, options: any) {
        if (
          id !== "xbslTerminal.console" ||
          !options.webviewOptions.retainContextWhenHidden
        )
          throw Error("Invalid view");
        provider = p;
        return { dispose() {} };
      },
      showQuickPick: async (items: any[]) => items[0],
      showInputBox: async (options: InputBoxOptions = {}) => {
        inputRequests.push(options);
        return pick;
      },
      showErrorMessage: async (s: string) => {
        errors.push(s);
      },
    },
    commands: {
      registerCommand(id: string, cb: any) {
        commands.set(id, cb);
        return {
          dispose: () => {
            commands.delete(id);
          },
        };
      },
      executeCommand: async (id: string) => {
        if (id === "xbslTerminal.console.focus") {
          mount();
          return;
        }
        return commands.get(id)?.();
      },
    },
  };
  const loader = Module as any,
    original = loader._load;
  const entry = path.join(root, "dist/extension.js");
  delete require.cache[require.resolve(entry)];
  loader._load = function (request: string, ...args: any[]) {
    return request === "vscode" ? api : original.call(this, request, ...args);
  };
  try {
    require(entry).activate({ extensionPath: root, subscriptions });
  } finally {
    loader._load = original;
  }
  function mount() {
    if (mounted) return;
    mounted = true;
    provider.resolveWebviewView(view);
  }
  return {
    api,
    view,
    messages,
    errors,
    inputRequests,
    commands,
    mount,
    send: (m: any) => receiver?.(m),
    onPost: (fn: (m: any) => void) => {
      sink = fn;
    },
    configure: (value: string | undefined) => {
      pick = value;
    },
    global: () => globalValue,
    closeView: () => {
      disposer?.();
      mounted = false;
    },
    dispose: () => {
      sink = undefined;
      disposer?.();
      for (const d of subscriptions.reverse()) d.dispose();
    },
  };
}
export async function waitFor(
  predicate: () => boolean,
  description: string,
  timeout = 5000,
) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw Error("Timed out: " + description);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
