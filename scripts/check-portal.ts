import path from "node:path";
import assert from "node:assert/strict";
async function main() {
  const [backend, archive] = process.argv.slice(2);
  if (!backend || !archive)
    throw Error(
      "Usage: tsx scripts/check-portal.ts /path/to/xbsl-io/backend /path/to/archive.zip",
    );
  // Read-only reuse of the portal authoring validator; no HTTP, DB or publication.
  const { parsePluginManifestFromZip } = require(
    path.resolve(backend, "src/publications/plugin-manifest-parser.ts"),
  );
  const result = await parsePluginManifestFromZip(path.resolve(archive), [
    "universal",
  ]);
  console.log(
    JSON.stringify(
      {
        findings: result.findings,
        identity: result.manifest
          ? {
              publisher: result.manifest.publisher,
              name: result.manifest.name,
              version: result.manifest.version,
            }
          : null,
        marketplace: result.manifest?.marketplace,
      },
      null,
      2,
    ),
  );
  assert.ok(result.manifest, "Archive must have a manifest");
  assert.ok(
    !result.findings.some((f: any) => f.severity === "error"),
    "Portal validator rejected archive",
  );
  assert.equal(result.manifest.marketplace?.packageCompleteness, "verified");
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
