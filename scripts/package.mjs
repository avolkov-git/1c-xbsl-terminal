import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";
import assert from "node:assert/strict";
const manifest = JSON.parse(await fs.readFile("package.json", "utf8"));
const name = `${manifest.name}-${manifest.version}`,
  directory = path.resolve("release", name);
await fs.mkdir("release", { recursive: true });
await fs.rm(directory, { recursive: true, force: true });
await fs.mkdir(directory);
for (const item of [
  "dist",
  "bin",
  "resources",
  "docs",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.txt",
])
  await fs.cp(item, path.join(directory, item), { recursive: true });
const { scripts, devDependencies, ...releaseManifest } = manifest;
await fs.writeFile(
  path.join(directory, "package.json"),
  JSON.stringify(releaseManifest, null, 2) + "\n",
);
const entries = [];
async function walk(dir) {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    assert.ok(!item.isSymbolicLink(), "No symlinks");
    if (item.isDirectory()) await walk(full);
    else {
      assert.ok(item.isFile(), "Only ordinary files");
      entries.push(path.relative(directory, full).split(path.sep).join("/"));
    }
  }
}
await walk(directory);
entries.sort();
const sums = [];
const bytesByPath = new Map();
for (const file of entries) {
  assert.ok(!file.endsWith(".node"), "No native Node ABI");
  const bytes = await fs.readFile(path.join(directory, file));
  assert.ok(bytes.length > 0, `Empty file ${file}`);
  assert.ok(
    !/^(?:\uFEFF)?version https?:\/\/(?:git-lfs|hawser)\.github\.com\//.test(
      bytes.subarray(0, 1024).toString(),
    ),
    `LFS pointer ${file}`,
  );
  bytesByPath.set(file, bytes);
  sums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${file}`);
}
for (const file of [
  ...manifest.xbsl.package.requiredFiles,
  manifest.main.replace(/^\.\//, ""),
])
  assert.ok(bytesByPath.has(file), `Missing ${file}`);
const runtime = JSON.parse(bytesByPath.get("bin/runtime.json").toString());
assert.equal(runtime.protocol, 1);
assert.equal(Object.keys(runtime.files).length, 6);
for (const entry of Object.values(runtime.files)) {
  const bytes = bytesByPath.get(entry.file);
  assert.equal(bytes?.length, entry.size);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
}
await fs.writeFile(path.join(directory, "SHA256SUMS"), sums.join("\n") + "\n");
entries.push("SHA256SUMS");
const zip = new ZipFile(),
  archive = path.resolve("release", `${name}-universal.zip`);
const saved = pipeline(zip.outputStream, createWriteStream(archive));
for (const file of entries) {
  const executable = /^bin\/[^/]+\/terminal-pty(?:\.exe)?$/.test(file);
  zip.addFile(path.join(directory, file), `${name}/${file}`, {
    mtime: new Date("2026-01-01T00:00:00Z"),
    mode: executable ? 0o100755 : 0o100644,
  });
}
zip.end();
await saved;
const bytes = await fs.readFile(archive);
const sha = createHash("sha256").update(bytes).digest("hex");
await fs.writeFile(archive + ".sha256", `${sha}  ${path.basename(archive)}\n`);
console.log(
  JSON.stringify(
    {
      directory,
      archive,
      bytes: bytes.length,
      sha256: sha,
      files: entries.length,
    },
    null,
    2,
  ),
);
