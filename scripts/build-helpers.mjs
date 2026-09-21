import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const platforms = [
  ["linux", "amd64", "linux-x64"],
  ["linux", "arm64", "linux-arm64"],
  ["windows", "amd64", "win32-x64"],
  ["windows", "arm64", "win32-arm64"],
  ["darwin", "amd64", "darwin-x64"],
  ["darwin", "arm64", "darwin-arm64"],
];
const runtime = { protocol: 1, files: {} };
for (const [GOOS, GOARCH, key] of platforms) {
  const file = `bin/${key}/terminal-pty${GOOS === "windows" ? ".exe" : ""}`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  execFileSync(
    "go",
    [
      "build",
      "-trimpath",
      "-buildvcs=false",
      "-ldflags=-s -w",
      "-o",
      path.resolve(file),
      ".",
    ],
    {
      cwd: "helper",
      env: { ...process.env, GOOS, GOARCH, CGO_ENABLED: "0" },
      stdio: "inherit",
    },
  );
  const bytes = await fs.readFile(file);
  runtime.files[key] = {
    file,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  console.log(`Built ${key}: ${bytes.length} bytes`);
}
await fs.writeFile("bin/runtime.json", JSON.stringify(runtime, null, 2) + "\n");
