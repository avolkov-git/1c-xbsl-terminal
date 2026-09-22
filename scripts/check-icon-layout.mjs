// Read-only replay of selected methods from the local Element frontend bundle.
// This is a host-source regression probe, not an Element browser runtime test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const root = process.argv[2];
if (!root)
  throw new Error(
    "Usage: node scripts/check-icon-layout.mjs <Element package>",
  );
const source = await fs.readFile(
  path.join(root, "ide/theia/products/browser-app/lib/frontend/bundle.js"),
  "utf8",
);
const methods = [];
function extract(start, next) {
  const offset = source.indexOf(start);
  assert.ok(offset >= 0, `Missing source marker: ${start}`);
  assert.equal(
    source.indexOf(start, offset + 1),
    -1,
    `Ambiguous marker: ${start}`,
  );
  const end = source.indexOf(next, offset + start.length);
  assert.ok(
    end > offset && end - offset < 10000,
    `Missing method boundary: ${next}`,
  );
  const text = source.slice(offset, end);
  methods.push({
    name: start,
    offset,
    sha256: createHash("sha256").update(text).digest("hex"),
  });
  return text;
}
const disposable = { dispose() {}, push() {} };
class DisposableCollection {
  push() {}
}
const registryMethods = vm.runInNewContext(
  `({${extract("registerViewContainer(e,t){", "async toggleViewContainer(e){")},
  ${extract("async prepareViewContainer(e,i){", "registerWidgetPartEvents(e,t){")}})`,
  {
    m: { DisposableCollection },
    l: { PluginSharedStyle: { toExternalIconUrl: (url) => url } },
    console,
  },
);
const containerMethods = vm.runInNewContext(
  `(class {${extract("setTitleOptions(e){", "updateToolbarItems(e){")}
  ${extract("findOriginalPart(){", "findPartForAnchor(e){")}
  ${extract("doStoreState(){", "registerPart(e){")}}).prototype`,
  {
    v: { isEmpty: (value) => Object.keys(value).length === 0 },
    a: { PINNED_CLASS: "pinned", waitForRevealed: async () => {} },
    A: { HEADER_HEIGHT: 22 },
    s: { some: (iter, predicate) => Array.from(iter).some(predicate) },
  },
);

function registry(order) {
  const value = Object.assign(Object.create(registryMethods), {
    nextViewContainerId: 0,
    viewContainers: new Map(),
    rules: new Map(),
    doRegisterViewContainer(id, location, options) {
      this.viewContainers.set(id, { location, options });
    },
    // Existing views are already present in the container; no new parts to add.
    getContainerViews: () => [],
  });
  value.style = {
    insertRule: (selector, rule) => value.rules.set(selector, rule()),
  };
  for (const id of order)
    value.registerViewContainer(id === "xbslTerminal" ? "bottom" : "left", {
      id,
      title: id,
      iconUrl: `/${id}.svg`,
    });
  return value;
}

const containerId = "workbench.view.extension.xbslMarketplace";
function container() {
  const value = Object.assign(Object.create(containerMethods), {
    id: containerId,
    parts: [],
    title: { className: "" },
    titleOptions: {},
    toDisposeOnUpdateTitle: disposable,
    toDispose: disposable,
    orientation: "vertical",
    getParts() {
      return this.parts;
    },
    updateToolbarItems() {},
    refreshMenu() {},
    updateSplitterVisibility() {},
    addWidget(
      wrapped,
      options,
      originalContainerId = this.id,
      originalContainerTitle = this.titleOptions,
    ) {
      this.parts.push({
        wrapped,
        partId: wrapped.id,
        originalContainerId,
        originalContainerTitle,
        isHidden: false,
        collapsed: false,
        showTitle() {},
        hideTitle() {},
        onTitleChanged() {},
        setHidden(hidden) {
          this.isHidden = hidden;
        },
      });
      this.updateTitle();
    },
  });
  value.containerLayout = {
    iter: () => value.parts.values(),
    getAvailableSize: () => 400,
    getPartSize: () => 200,
    insertWidget(index, part) {
      value.parts.splice(value.parts.indexOf(part), 1);
      value.parts.splice(index, 0, part);
    },
    setPartSizes() {},
  };
  return value;
}
const options = (registry) => registry.viewContainers.get(containerId).options;
function iconRule(registry, container) {
  return registry.rules.get(
    `.${container.title.iconClass.replaceAll(" ", ".")}`,
  );
}
function fresh(registry) {
  const value = container();
  value.setTitleOptions(options(registry));
  for (const id of ["catalog", "installed"])
    value.addWidget({ id, title: { label: id } });
  return value;
}
async function restore(state, registry) {
  const value = container();
  value.restoreState(JSON.parse(JSON.stringify(state)));
  await registry.prepareViewContainer(containerId, value);
  return value;
}

// Synthetic registration order: this probe does not claim the server used it.
const initial = registry(["codex", "xbslMarketplace", "forms"]);
const state = fresh(initial).doStoreState();
assert.match(
  iconRule(initial, await restore(state, initial)),
  /xbslMarketplace\.svg/,
);

const appended = registry([
  "codex",
  "xbslMarketplace",
  "forms",
  "xbslTerminal",
]);
assert.match(
  iconRule(appended, await restore(state, appended)),
  /xbslMarketplace\.svg/,
);

const changed = registry(["xbslTerminal", "codex", "xbslMarketplace", "forms"]);
const stale = await restore(state, changed);
assert.notEqual(stale.title.iconClass, options(changed).iconClass);
assert.match(iconRule(changed, stale), /codex\.svg/);

// A second ordinary reload keeps the stale originalContainerTitle.
const reloaded = await restore(stale.doStoreState(), changed);
assert.match(iconRule(changed, reloaded), /codex\.svg/);

// Recreating the container AND its parts removes the stale title state.
assert.match(iconRule(changed, fresh(changed)), /xbslMarketplace\.svg/);

console.log(
  JSON.stringify(
    {
      kind: "isolated-host-method-replay",
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      scenariosPassed: 5,
      expectedIconClass: options(changed).iconClass,
      restoredIconClass: stale.title.iconClass,
      expectedIcon: "xbslMarketplace.svg",
      restoredIcon: "codex.svg",
      liveElementTested: false,
      methods,
    },
    null,
    2,
  ),
);
