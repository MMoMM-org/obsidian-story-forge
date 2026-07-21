/**
 * Compile-time guard: ensures the Obsidian mock's public API surface is a
 * subset of the REAL Obsidian API.
 *
 * SCOPE: Key names only.  Signatures are not checked (vi.fn() erases them).
 * A mock member with a matching key name but a different signature is fine here
 * — the test compile catches call-site mismatches.  What this guard prevents is
 * a FICTIONAL key (one that doesn't exist on the real type at all) silently
 * passing through both mock and tests while crashing in the live plugin.
 *
 * HOW IT WORKS
 * This file is compiled in isolation by tsconfig.mock.json, which:
 *   - does NOT alias "obsidian" to the mock (paths: {})
 *   - does NOT include obsidian-augment.d.ts (no test/** glob)
 * So `import type ... from "obsidian"` resolves to the real node_modules types.
 * The mock shape comes from the generated bodyless declaration files emitted
 * by `typecheck:mock` step 1 into .typecheck-mock-tmp/ — no bodies, no globals.
 *
 * OBJECT-LITERAL GUARDS (vault, metadataCache)
 * The original bug (iterateAllFiles) lived in App.metadataCache, which is an
 * object literal in the mock, not a class instance.  We extract its type and
 * check it against the real MetadataCache the same way.
 *
 * ALLOWLIST
 * Members that exist on the mock but NOT on the real type are allowlisted with
 * a justification comment.  Only genuinely intentional test helpers belong here.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import type {
	App,
	Vault,
	MetadataCache,
	Workspace,
	WorkspaceLeaf,
	Component,
	Plugin,
	Modal,
	Notice,
	Setting,
	PluginSettingTab,
	ButtonComponent,
	ToggleComponent,
	TextComponent,
	DropdownComponent,
	ItemView,
	MarkdownView,
	Editor,
	TFile,
	TFolder,
	Events,
	Menu,
	MenuItem,
} from "obsidian";

// Import the bodyless mock shape emitted by step 1 of typecheck:mock.
// This path is relative to this file's location (test/__mocks__/obsidian.guard.ts).
// The .typecheck-mock-tmp/ dir is gitignored and created at check time.
import type {
	App as MockApp,
	Workspace as MockWorkspace,
	WorkspaceLeaf as MockWorkspaceLeaf,
	Component as MockComponent,
	Plugin as MockPlugin,
	Modal as MockModal,
	Notice as MockNotice,
	Setting as MockSetting,
	PluginSettingTab as MockPluginSettingTab,
	ButtonComponent as MockButtonComponent,
	ToggleComponent as MockToggleComponent,
	TextComponent as MockTextComponent,
	DropdownComponent as MockDropdownComponent,
	ItemView as MockItemView,
	MarkdownView as MockMarkdownView,
	Editor as MockEditor,
	TFile as MockTFile,
	TFolder as MockTFolder,
	Events as MockEvents,
	Menu as MockMenu,
	MenuItem as MockMenuItem,
} from "../../.typecheck-mock-tmp/test/__mocks__/obsidian";

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

/**
 * Collect all public (non-`_`-prefixed) key names of T.
 * We exclude `_`-prefixed members because the mock deliberately adds
 * test-only helpers such as `_trigger`, `_runCleanup`, `_eventRegistrations`,
 * `_deferLayoutReady`, `_layoutReadyCbs`, `_flushLayoutReady`, `_unload`,
 * `_cleanupFns` — these are test scaffolding and must not appear on the real type.
 *
 * Note: `undefined` is also excluded.  When a mock class uses polymorphic
 * `this` in a vi.fn() generic (e.g. `Mock<() => this>`), TypeScript can
 * produce `undefined` as a spurious member of the indexed-access distribution.
 * This does not correspond to any real key and must be stripped before the
 * Exclude comparison or the guard produces a false `{ FICTIONAL: undefined }`.
 */
type PublicKeys<T> = {
	[K in keyof T]: K extends `_${string}` ? never : K;
}[keyof T] & (string | symbol);

/**
 * Keys that are on Mock but not on Real (after excluding `_`-prefixed keys).
 * If this is `never`, the mock has no fictional public members.
 */
type FictionalKeys<Mock, Real> = Exclude<PublicKeys<Mock>, keyof Real>;

/**
 * Assertion: evaluates to `true` when the mock has no fictional public keys,
 * or to `{ FICTIONAL: <list-of-fictional-keys> }` when it does.
 * The variable assignment `const _: Assertion<...> = true` then fails to
 * compile when fictional keys exist, naming them in the error.
 */
type AssertNoFiction<Mock, Real> = FictionalKeys<Mock, Real> extends never
	? true
	: { FICTIONAL: FictionalKeys<Mock, Real> };

// ---------------------------------------------------------------------------
// Per-type allowlists
//
// Allowlisted keys are Omit-ted from the mock before the check so the guard
// does not require them to exist on the real type.  Each entry must have a
// justification comment.
// ---------------------------------------------------------------------------

/**
 * Notice allowlist:
 *   message  — the constructor stores the raw message string for test assertions
 *               (`Notice._instances[0].message`). Real Notice stores it in the
 *               DOM element `messageEl`; there is no plain string field.
 *   timeout  — the optional duration is stored for test assertions.  Real Notice
 *               accepts it as a constructor argument but does not expose it as a
 *               public field.
 */
type MockNoticeAllowlisted = Omit<MockNotice, "message" | "timeout">;

/**
 * WorkspaceLeaf allowlist:
 *   app  — added to the mock so that ItemView (which calls super(leaf)) can
 *           access `this.leaf.app` in tests.  The real WorkspaceLeaf does not
 *           expose `app` directly (the real runtime sets it on View, not Leaf).
 */
type MockWorkspaceLeafAllowlisted = Omit<MockWorkspaceLeaf, "app">;

/**
 * PluginSettingTab allowlist:
 *   plugin  — mock stores the Plugin reference as a public field for test
 *              access. The real PluginSettingTab accepts it in the constructor
 *              but does not declare it as a public property in the type
 *              declarations (it is typed as an internal constructor parameter).
 */
type MockPluginSettingTabAllowlisted = Omit<MockPluginSettingTab, "plugin">;

/**
 * ItemView allowlist:
 *   onOpen  — the mock declares these as public so test subclasses can override
 *   onClose   them without TypeScript access-modifier complaints. The real
 *              Obsidian declares onOpen/onClose as `protected` on `View` (which
 *              ItemView inherits), so they do not appear in `keyof ItemView`.
 *              They are the same real lifecycle hooks — not fictional — just
 *              elevated to public in the mock for testability.
 */
type MockItemViewAllowlisted = Omit<MockItemView, "onOpen" | "onClose">;

// ---------------------------------------------------------------------------
// Class-shape guards
// ---------------------------------------------------------------------------

const _componentOk: AssertNoFiction<MockComponent, Component> = true;
const _workspaceOk: AssertNoFiction<MockWorkspace, Workspace> = true;
const _workspaceLeafOk: AssertNoFiction<MockWorkspaceLeafAllowlisted, WorkspaceLeaf> = true;
const _pluginOk: AssertNoFiction<MockPlugin, Plugin> = true;

/**
 * Structural return-type pin for Plugin.prototype.registerBasesView.
 *
 * AssertNoFiction only checks key names, not signatures.  This additional pin
 * asserts that the REAL Plugin (from node_modules/obsidian) declares
 * registerBasesView as a method whose return type is assignable to boolean.
 *
 * If obsidian.d.ts renames or removes registerBasesView, or changes its return
 * type away from boolean, this conditional type evaluates to `never` and the
 * assignment below fails typecheck:mock — forcing the mock to be updated, which
 * in turn breaks the canary pin in basesApiCanary.test.ts (typecheck:test).
 */
type _RealPluginHasRegisterBasesView =
	Plugin extends { registerBasesView: (...args: never[]) => boolean } ? true : never;
const _registerBasesViewOnRealPlugin: _RealPluginHasRegisterBasesView = true;
void _registerBasesViewOnRealPlugin;
const _modalOk: AssertNoFiction<MockModal, Modal> = true;
const _noticeOk: AssertNoFiction<MockNoticeAllowlisted, Notice> = true;
const _settingOk: AssertNoFiction<MockSetting, Setting> = true;
const _pluginSettingTabOk: AssertNoFiction<MockPluginSettingTabAllowlisted, PluginSettingTab> = true;
const _buttonComponentOk: AssertNoFiction<MockButtonComponent, ButtonComponent> = true;
const _toggleComponentOk: AssertNoFiction<MockToggleComponent, ToggleComponent> = true;
const _textComponentOk: AssertNoFiction<MockTextComponent, TextComponent> = true;
const _dropdownComponentOk: AssertNoFiction<MockDropdownComponent, DropdownComponent> = true;
const _itemViewOk: AssertNoFiction<MockItemViewAllowlisted, ItemView> = true;
const _markdownViewOk: AssertNoFiction<MockMarkdownView, MarkdownView> = true;
const _editorOk: AssertNoFiction<MockEditor, Editor> = true;
const _tfileOk: AssertNoFiction<MockTFile, TFile> = true;
const _tfolderOk: AssertNoFiction<MockTFolder, TFolder> = true;
const _eventsOk: AssertNoFiction<MockEvents, Events> = true;
const _menuOk: AssertNoFiction<MockMenu, Menu> = true;
const _menuItemOk: AssertNoFiction<MockMenuItem, MenuItem> = true;

// ---------------------------------------------------------------------------
// Object-literal shape guards (vault, metadataCache)
//
// App.vault and App.metadataCache in the mock are object literals, not class
// instances.  We extract their types and check them against the real Vault and
// MetadataCache.  This is exactly where the original bug lived:
// iterateAllFiles was on the mock's metadataCache literal but does not exist
// on the real MetadataCache.
// ---------------------------------------------------------------------------

type MockVault = MockApp["vault"];
type MockMetadataCache = MockApp["metadataCache"];

// App class top-level keys (vault, fileManager, workspace, metadataCache) must
// all be present on the real App so a fictional top-level App property (e.g.
// a made-up `app.doThing()`) would be caught.
const _appOk: AssertNoFiction<MockApp, App> = true;

/**
 * MetadataCache allowlist:
 *   (none) — all public mock keys must be real.
 *   The _eventRegistrations and _trigger members are `_`-prefixed and excluded
 *   by PublicKeys above.
 */
const _vaultOk: AssertNoFiction<MockVault, Vault> = true;
const _metadataCacheOk: AssertNoFiction<MockMetadataCache, MetadataCache> = true;
