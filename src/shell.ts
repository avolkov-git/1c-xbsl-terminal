import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import os from "node:os";

export function bashCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  const p = platform === "win32" ? path.win32 : path.posix;
  const value = (key: string) =>
    Object.entries(env).find(
      ([k]) => k.toLowerCase() === key.toLowerCase(),
    )?.[1];
  const search = (value("PATH") ?? "")
    .split(platform === "win32" ? ";" : ":")
    .map((s) => s.replace(/^"|"$/g, ""));
  const system =
    platform === "win32"
      ? [
          value("ProgramW6432"),
          value("ProgramFiles"),
          value("ProgramFiles(x86)"),
        ]
          .filter((v): v is string => !!v)
          .flatMap((v) => [
            p.join(v, "Git", "bin", "bash.exe"),
            p.join(v, "Git", "usr", "bin", "bash.exe"),
          ])
      : [
          "/bin/bash",
          "/usr/bin/bash",
          "/usr/local/bin/bash",
          "/opt/homebrew/bin/bash",
        ];
  const candidates = [
    ...system,
    ...search
      .filter((s) => p.isAbsolute(s))
      .map((s) => p.join(s, platform === "win32" ? "bash.exe" : "bash")),
  ];
  return [...new Set(candidates)].filter(
    (s) =>
      !/[\r\n\0]/.test(s) &&
      !(
        platform === "win32" &&
        /\\(?:System32|WindowsApps)\\bash\.exe$/i.test(s)
      ),
  );
}
export async function resolveBash(
  configured = "",
  platform: NodeJS.Platform = process.platform,
  env = process.env,
) {
  if (!["linux", "darwin", "win32"].includes(platform))
    throw new Error("Эта операционная система пока не поддерживается.");
  if (
    configured &&
    (!path.isAbsolute(configured) || /[\r\n\0]/.test(configured))
  )
    throw new Error("Укажите абсолютный путь к Bash на сервере.");
  for (const candidate of configured
    ? [configured]
    : bashCandidates(platform, env)) {
    try {
      const real = await fs.realpath(candidate);
      const st = await fs.stat(real);
      if (!st.isFile()) continue;
      if (platform !== "win32") await fs.access(real, constants.X_OK);
      return {
        file: real,
        args: platform === "win32" ? ["--login", "-i"] : ["-i"],
      };
    } catch {
      /* Try the next known Bash location; never install or invoke a probe command. */
    }
  }
  throw new Error(
    platform === "win32"
      ? "Bash не найден на сервере. Установите Git for Windows и выберите bin/bash.exe в настройке плагина."
      : "Bash не найден на сервере. Укажите путь к установленному Bash.",
  );
}
export async function workingDirectory(candidate?: string) {
  const directory = await fs.realpath(candidate ?? os.homedir());
  if (!(await fs.stat(directory)).isDirectory())
    throw new Error("Рабочий каталог недоступен.");
  return directory;
}
