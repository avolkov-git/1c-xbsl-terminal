import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
const sections = [];
for (const name of ["@xterm/xterm", "@xterm/addon-fit"]) {
  const base = path.join("node_modules", name),
    pkg = JSON.parse(
      await fs.readFile(path.join(base, "package.json"), "utf8"),
    );
  sections.push(
    `${name} ${pkg.version}\n${await fs.readFile(path.join(base, "LICENSE"), "utf8")}`,
  );
}
const modules = execFileSync(
  "go",
  ["list", "-m", "-f", "{{.Path}}\t{{.Version}}\t{{.Dir}}", "all"],
  { cwd: "helper", encoding: "utf8" },
)
  .trim()
  .split("\n");
for (const line of modules) {
  const [name, version, dir] = line.split("\t");
  if (version)
    sections.push(
      `${name} ${version}\n${await fs.readFile(path.join(dir, "LICENSE"), "utf8")}`,
    );
}
const goroot = execFileSync("go", ["env", "GOROOT"], {
    encoding: "utf8",
  }).trim(),
  version = execFileSync("go", ["version"], { encoding: "utf8" }).trim();
sections.push(
  `${version}\nGo standard library and runtime\n${await fs
    .readFile(path.join(goroot, "LICENSE"), "utf8")
    .catch((e) => {
      if (e.code !== "ENOENT") throw e;
      return fs.readFile(path.join(goroot, "..", "LICENSE"), "utf8");
    })}\n${await fs.readFile(path.join(goroot, "PATENTS"), "utf8")}`,
);
await fs.writeFile(
  "THIRD_PARTY_NOTICES.txt",
  "Bundled runtime components\n\n" +
    sections.join("\n\n" + "=".repeat(72) + "\n\n"),
);
console.log(
  "Runtime notices generated for xterm, addon-fit, PTY modules and Go.",
);
