import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { hostHarness, waitFor } from "../tests/host-harness";
async function main() {
  const root = path.resolve(__dirname, ".."),
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "xbsl-ui-"));
  const host = hostHarness(root, cwd);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1100, height: 330 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  let delivery = Promise.resolve();
  let requests = 0;
  page.on("request", () => requests++);
  await fs.mkdir(".test-output", { recursive: true });
  try {
    await page.exposeFunction("toHost", (m: unknown) => host.send(m));
    await page.evaluate(
      "window.acquireVsCodeApi = () => ({ postMessage: m => window.toHost(m) });",
    );
    host.onPost((m) => {
      delivery = delivery
        .then(() =>
          page.evaluate(
            (m) =>
              window.dispatchEvent(new MessageEvent("message", { data: m })),
            m,
          ),
        )
        .then(() => {});
    });
    host.mount();
    await page.setContent(host.view.webview.html);
    await delivery;
    const colors = {
      light: {
        foreground: "#333333",
        panel: "#ffffff",
        border: "#dedede",
        description: "#616161",
        dropdown: "#f3f3f3",
        button: "#007acc",
        warning: "#fff4ce",
      },
      dark: {
        foreground: "#cccccc",
        panel: "#1e1e1e",
        border: "#333333",
        description: "#aaaaaa",
        dropdown: "#313131",
        button: "#007acc",
        warning: "#352a05",
      },
    };
    async function theme(mode: "light" | "dark") {
      await page.evaluate(
        ({ mode, c }) => {
          document.body.className = "vscode-" + mode;
          for (const [key, value] of Object.entries({
            foreground: c.foreground,
            "terminal-foreground": c.foreground,
            "panel-background": c.panel,
            "terminal-background": c.panel,
            "panel-border": c.border,
            descriptionForeground: c.description,
            "dropdown-background": c.dropdown,
            "button-background": c.button,
            "inputValidation-warningBackground": c.warning,
            "font-family": "Arial, sans-serif",
          }))
            document.body.style.setProperty("--vscode-" + key, value);
        },
        { mode, c: colors[mode] },
      );
    }
    await theme("light");
    await expect(page.locator("#new")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Переименовать сессию", exact: true }),
    ).toBeDisabled();
    await page.screenshot({ path: ".test-output/empty-light.png" });
    await page
      .getByRole("button", { name: "Открыть Bash", exact: true })
      .click();
    await expect(page.locator("#status")).toHaveText("Bash · сервер");
    await expect(page.locator(".xterm-rows")).toContainText("bash-");
    await page.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type(
      "PS1='\\$ '; clear; printf '\\033[32mBash %s\\033[0m\\n' ready; printf 'Workspace: %s\\n' \"$PWD\"",
    );
    await page.locator(".xterm-helper-textarea").press("Enter");
    await expect(page.locator(".xterm-rows")).toContainText("Bash ready");
    // The + belongs to the native IDE header; invoke its registered command.
    await host.commands.get("xbslTerminal.new")!();
    await expect(page.locator("#sessions option")).toHaveCount(2);
    const ids = await page
      .locator("#sessions option")
      .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
    await page.locator("#sessions").selectOption(ids[0]);
    host.configure("Логи & <server>");
    await page
      .getByRole("button", { name: "Переименовать сессию", exact: true })
      .click();
    await expect(page.locator("#sessions option:checked")).toHaveText(
      "Логи & <server>",
    );
    await expect(page.locator("#sessions")).toHaveAttribute(
      "title",
      "Логи & <server>",
    );
    await expect(page.locator("#sessions")).toHaveValue(ids[0]);
    await page.locator("#sessions").selectOption(ids[1]);
    await page.locator("#sessions").selectOption(ids[0]);
    await expect(page.locator("#sessions option:checked")).toHaveText(
      "Логи & <server>",
    );
    await expect(
      page.locator(".terminal-surface:not([hidden]) .xterm-rows"),
    ).toContainText("Bash ready");
    const broken = path.join(cwd, "broken-bash");
    await fs.writeFile(broken, "#!/nonexistent/xbsl-interpreter\n", {
      mode: 0o755,
    });
    host.configure(broken);
    await page
      .getByRole("button", { name: "Путь к Bash", exact: true })
      .click();
    await waitFor(() => host.global() === broken, "test shell configuration");
    await host.commands.get("xbslTerminal.new")!();
    await expect(page.locator("#status")).toHaveText("Ошибка");
    await expect(page.locator("#notice")).toBeVisible();
    await page.screenshot({ path: ".test-output/session-error.png" });
    const failed = await page.locator("#sessions").inputValue();
    await page.locator("#sessions").selectOption(ids[0]);
    await expect(page.locator("#notice")).toBeHidden();
    await expect(
      page.locator(".terminal-surface:not([hidden]) .xterm-rows"),
    ).toContainText("Bash ready");
    await page.locator("#sessions").selectOption(failed);
    await expect(page.locator("#notice")).toBeVisible();
    await page
      .getByRole("button", { name: "Закрыть сессию", exact: true })
      .click();
    await expect(page.locator("#notice")).toBeHidden();
    host.configure("");
    await page
      .getByRole("button", { name: "Путь к Bash", exact: true })
      .click();
    await waitFor(() => host.global() === "", "restore Bash configuration");
    // A configuration notice is global; selecting a session must not turn it into an old session error.
    await host.commands.get("xbslTerminal.new")!();
    await expect(page.locator("#sessions option")).toHaveCount(3);
    await page
      .getByRole("button", { name: "Закрыть сессию", exact: true })
      .click();
    await page.locator("#sessions").selectOption(ids[0]);
    await expect(page.locator("#notice")).toBeHidden();
    await expect(
      page.locator(".terminal-surface:not([hidden]) .xterm-rows"),
    ).toContainText("Bash ready");
    await page.screenshot({ path: ".test-output/terminal-light.png" });
    await theme("dark");
    await page.screenshot({ path: ".test-output/terminal-dark.png" });
    host.configure("Журнал выполнения команд сервера — " + "я".repeat(40));
    await page
      .getByRole("button", { name: "Переименовать сессию", exact: true })
      .click();
    await expect(page.locator("#sessions option:checked")).toHaveText(
      "Журнал выполнения команд сервера — " + "я".repeat(40),
    );
    for (const width of [1100, 600, 361, 320]) {
      await page.setViewportSize({ width, height: 280 });
      const actions = await page.locator(".actions").boundingBox();
      assert.ok(
        actions && Math.abs(actions.x + actions.width - (width - 8)) < 1,
        "actions anchored to the right",
      );
      const picker = await page.locator(".session-controls").boundingBox();
      assert.ok(
        picker && picker.x + picker.width <= actions.x,
        "session controls do not overlap actions",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
        "long name does not overflow",
      );
    }
    await page.setViewportSize({ width: 320, height: 280 });
    await page.locator("#sessions").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#rename")).toBeFocused();
    await page.screenshot({ path: ".test-output/terminal-narrow.png" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      "no horizontal overflow",
    );
    await page
      .getByRole("button", { name: "Очистить экран", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Закрыть сессию", exact: true })
      .click();
    await expect(page.locator("#sessions option")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Закрыть сессию", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Открыть Bash", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#rename")).toBeDisabled();
    host.configure("/absent/xbsl-bash");
    await page
      .getByRole("button", { name: "Путь к Bash", exact: true })
      .click();
    await waitFor(
      () => host.errors.length === 1,
      "invalid shell configuration",
    );
    await delivery;
    assert.deepEqual(errors, []);
    assert.equal(requests, 0);
    console.log(
      "PASS: real Bash bridge, native-header new command, rename, selection, resize, clear, close, config error; light/dark/320–1100px; long names and keyboard focus; zero network requests or page errors.",
    );
  } catch (e) {
    console.error({
      errors,
      states: host.messages.filter(
        (m) => m.type === "state" || m.type === "notice",
      ),
      hostErrors: host.errors,
    });
    throw e;
  } finally {
    host.dispose();
    await delivery.catch(() => {});
    await browser.close();
    await fs.rm(cwd, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
