/**
 * Obsidian API mock for unit testing.
 *
 * Convergent shape from Kado v0.7.x and miyo-tomo-hashi: realistic enough
 * that SettingsTab UI tests, Modal/View tests, and lifecycle/cleanup tests
 * can run without an actual Obsidian runtime. Extend as needed when adding
 * new Obsidian API usage.
 *
 * Key behaviours:
 * - augmentEl(): mounts Obsidian's `createEl/createDiv/createSpan/empty/
 *   addClass/removeClass/toggleClass` helpers onto plain DOM elements.
 * - Setting + UI components (Text/Toggle/Button/Dropdown) attach real DOM
 *   nodes and fire real events, so tests can dispatch clicks and inputs
 *   against `inputEl` / `toggleEl` / `buttonEl` / `selectEl`.
 * - Plugin: tracks register() callbacks; `_runCleanup()` simulates onunload.
 * - Notice: tracks instances via `Notice._instances` (reset with `Notice._reset()`).
 * - ItemView: abstract base class for sidebar panels.
 * - Workspace: full mock with event registration tracking.
 * - debounce: controllable test debounce via vi.useFakeTimers().
 */

import { vi } from "vitest";

// --- Obsidian globals not present in jsdom ---

/**
 * activeDocument / activeWindow — Obsidian's popout-window-aware document and
 * window references. In tests (jsdom) there is only one document/window, so we
 * expose them as globals to match Obsidian's runtime API without requiring
 * @types/obsidian changes.
 *
 * The `declare let` statements mirror the real obsidian.d.ts global declarations
 * so that src/ code referencing activeWindow/activeDocument typechecks under
 * tsconfig.test.json (which aliases "obsidian" → this file).
 */
if (typeof (globalThis as Record<string, unknown>).activeDocument === "undefined") {
	(globalThis as Record<string, unknown>).activeDocument = document;
}
if (typeof (globalThis as Record<string, unknown>).activeWindow === "undefined") {
	(globalThis as Record<string, unknown>).activeWindow = window;
}

// --- Core types ---

/** Matches the real Obsidian PluginManifest interface. */
export type PluginManifest = {
	id: string;
	name: string;
	version: string;
	minAppVersion: string;
	author?: string;
	authorUrl?: string;
	description?: string;
	[k: string]: unknown;
};

/** Matches the real Obsidian IconName type (a string alias). */
export type IconName = string;

export interface TagCache {
	tag: string;
	position?: unknown;
}

/** Matches the real Obsidian Reference interface. */
export interface Reference {
	link: string;
	original: string;
	displayText?: string;
}

/** Matches the real Obsidian FrontmatterLinkCache interface. */
export interface FrontmatterLinkCache extends Reference {
	/** The frontmatter key, e.g. "pov", "characters.0", "location". */
	key: string;
}

export interface CachedMetadata {
	tags?: TagCache[];
	frontmatter?: Record<string, unknown>;
	frontmatterLinks?: FrontmatterLinkCache[];
}

// --- App & Workspace ---

/** Shape of the EventRef a Workspace/metadataCache `on()` call returns. */
interface MockEventRef {
	e: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	fn: (...args: any[]) => any;
	/** The emitter the ref came from — used by cleanup to call its `off`. */
	_emitter?: { off: (ref: MockEventRef) => void };
}

/**
 * `EventRef` — the real module exports this (obsidian.d.ts:2800) as an opaque
 * marker interface that `on()` returns and `registerEvent()` consumes. Any src
 * module that names the type in a signature (e.g. a `registerEvent` seam) fails
 * to compile against the mock without it, so it is exported here as an alias of
 * the concrete shape the mock's emitters actually hand out.
 */
export type EventRef = MockEventRef;

export class Component {
	/**
	 * Cleanup functions accumulated via the register* helpers. Running them
	 * (via _unload / _runCleanup) releases every listener/timer — mirroring the
	 * real Obsidian Component lifecycle, so tests can prove nothing leaks.
	 */
	protected _cleanupFns: Array<() => unknown> = [];

	/**
	 * Registered child components (faithful to real Obsidian Component.addChild).
	 * Exposed as `_children` for test-side inspection of child count / identity.
	 */
	_children: Component[] = [];

	/**
	 * addChild — mirrors real Obsidian Component.addChild<T extends Component>(component: T): T.
	 * Registers `component` as a child: stores it in `_children` and queues a cleanup
	 * so that when THIS component is unloaded, the child is also unloaded (removeChild).
	 * Returns the child (mirrors real API).
	 */
	addChild<T extends Component>(component: T): T {
		this._children.push(component);
		this._cleanupFns.push(() => { this.removeChild(component); });
		return component;
	}

	/**
	 * removeChild — mirrors real Obsidian Component.removeChild<T extends Component>(component: T): T.
	 * Unloads the child component and detaches it from `_children`. Returns the child.
	 */
	removeChild<T extends Component>(component: T): T {
		component._unload();
		const idx = this._children.indexOf(component);
		if (idx !== -1) this._children.splice(idx, 1);
		return component;
	}

	/**
	 * registerDomEvent — tracks registration AND wires the real DOM listener.
	 *
	 * The real Obsidian registerDomEvent attaches the listener AND stores it for
	 * cleanup on unload. The mock does the same: addEventListener is called so
	 * tests can dispatch real DOM events (click, keydown, etc.), and the call is
	 * tracked by vi.fn() so tests can assert it was used. The removeEventListener
	 * is queued as a cleanup so unload genuinely detaches the DOM handler.
	 *
	 * Mirrors the real API's three overloads (Window, Document, HTMLElement) so
	 * modules that register pointer/key listeners on activeWindow compile and run
	 * correctly in tests (CON-4 — pointer move/up need window-level tracking).
	 */
	registerDomEvent: {
		<K extends keyof WindowEventMap>(el: Window, type: K, callback: (this: HTMLElement, ev: WindowEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
		<K extends keyof DocumentEventMap>(el: Document, type: K, callback: (this: HTMLElement, ev: DocumentEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
		<K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
	} = vi.fn(
		(
			el: Window | Document | HTMLElement,
			type: string,
			listener: (ev: Event) => void,
		): void => {
			(el as EventTarget).addEventListener(type, listener as EventListener);
			this._cleanupFns.push(() => {
				(el as EventTarget).removeEventListener(type, listener as EventListener);
			});
		},
	);

	registerInterval = vi.fn((id: number): number => {
		this._cleanupFns.push(() => { clearInterval(id); });
		return id;
	});

	/**
	 * registerEvent — tracks that events are registered through the Obsidian API
	 * AND queues the matching `off` so unload releases the workspace/metadataCache
	 * listener. Returns the EventRef it was passed (mirrors real Obsidian).
	 *
	 * This is what makes leak tests genuine: a listener wired via registerEvent is
	 * released on cleanup, but one wired raw (bypassing registerEvent) is not.
	 */
	registerEvent = vi.fn(
		(eventRef: unknown): unknown => {
			const ref = eventRef as MockEventRef | null;
			if (ref?._emitter) {
				this._cleanupFns.push(() => { ref._emitter!.off(ref); });
			}
			return eventRef;
		},
	);

	/**
	 * register — mirrors the real Obsidian Component.register(cb).
	 * Queues `cb` in _cleanupFns so it runs when the component is unloaded.
	 * This is the same behaviour as Plugin.register (which existed here before
	 * Component.register was promoted); Plugin's override is kept for now so
	 * existing test assertions on Plugin.register still pass.
	 */
	register = vi.fn((fn: () => unknown): void => {
		this._cleanupFns.push(fn);
	});

	/**
	 * load() — mirroring the real Obsidian Component.load().
	 * The real Component.load() calls onload() and sets _loaded=true.
	 * In tests, this is a no-op spy so assertions can verify it was called.
	 */
	load = vi.fn((): void => {});

	/**
	 * unload() — mirror of the real Obsidian Component.unload().
	 * Calls _unload() to run cleanup functions (same as the real implementation).
	 */
	unload = vi.fn((): void => {
		this._unload();
	});

	/** Run and clear every queued cleanup — simulates Obsidian unloading the component. */
	_unload(): void {
		const fns = this._cleanupFns;
		this._cleanupFns = [];
		for (const fn of fns) fn();
	}
}

/**
 * Workspace mock — faithful to the real Obsidian Workspace API shape.
 *
 * Tracks registered event listeners via on() so tests can assert
 * "registered via registerEvent" by inspecting _eventRegistrations.
 * onLayoutReady: calls the callback synchronously in the mock (no layout delay).
 */
export class Workspace {
	/** Registered event name → callbacks (for test assertions). */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	_eventRegistrations: Map<string, Array<(...args: any[]) => any>> = new Map();

	on = vi.fn(
		(
			event: string,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			callback: (...args: any[]) => any,
		): MockEventRef => {
			if (!this._eventRegistrations.has(event)) {
				this._eventRegistrations.set(event, []);
			}
			this._eventRegistrations.get(event)!.push(callback);
			// _emitter back-ref lets Component.registerEvent queue this.off(ref).
			return { e: event, fn: callback, _emitter: this };
		},
	);

	/** Remove a previously-registered callback (called on component unload). */
	off = vi.fn((ref: MockEventRef): void => {
		const list = this._eventRegistrations.get(ref.e);
		if (!list) return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const idx = list.indexOf(ref.fn as (...args: any[]) => any);
		if (idx !== -1) list.splice(idx, 1);
		if (list.length === 0) this._eventRegistrations.delete(ref.e);
	});

	/**
	 * When true, onLayoutReady() STORES callbacks instead of invoking them
	 * synchronously, so a test can assert behaviour before vs. after layout is
	 * ready. Opt-in so existing tests keep the synchronous default. Flush the
	 * stored callbacks with _flushLayoutReady().
	 */
	_deferLayoutReady = false;
	/** Callbacks captured while _deferLayoutReady is true. */
	_layoutReadyCbs: Array<() => void> = [];

	/**
	 * Simulate layout-ready. Default: calls cb immediately (tests don't have a
	 * real layout cycle). If _deferLayoutReady is set, the cb is stored and only
	 * runs when _flushLayoutReady() is called — used to test layout-ready gating.
	 */
	onLayoutReady = vi.fn((cb: () => void): void => {
		if (this._deferLayoutReady) {
			this._layoutReadyCbs.push(cb);
			return;
		}
		cb();
	});

	/** Run and clear any callbacks captured while deferral was enabled. */
	_flushLayoutReady(): void {
		const cbs = this._layoutReadyCbs;
		this._layoutReadyCbs = [];
		for (const cb of cbs) cb();
	}

	getLeavesOfType = vi.fn((_type: string): WorkspaceLeaf[] => []);

	getRightLeaf = vi.fn(
		(_split: boolean): WorkspaceLeaf => new WorkspaceLeaf(),
	);

	revealLeaf = vi.fn(async (_leaf: WorkspaceLeaf): Promise<void> => {});

	getActiveFile = vi.fn((): TFile | null => null);

	detachLeavesOfType = vi.fn((_type: string): void => {});

	getActiveViewOfType = vi.fn(
		<T extends { file?: TFile | null }>(_type: new (...args: unknown[]) => T): T | null => null,
	);

	iterateAllLeaves = vi.fn((_cb: (leaf: WorkspaceLeaf) => void): void => {});

	openLinkText = vi.fn(
		async (
			_linktext: string,
			_sourcePath: string,
			_newLeaf?: boolean,
		): Promise<void> => {},
	);

	getLeaf = vi.fn((_newLeaf?: boolean | string): WorkspaceLeaf => new WorkspaceLeaf());

	/** Trigger a registered event (used in tests to simulate Obsidian events). */
	_trigger(event: string, ...args: unknown[]): void {
		const callbacks = this._eventRegistrations.get(event) ?? [];
		for (const cb of callbacks) cb(...args);
	}
}

/** Minimal interface for the metadataCache methods MockFileManager needs. */
interface MetadataCacheTrigger {
	_trigger: (event: string, ...args: unknown[]) => void;
}

/**
 * MockFileManager — spy-able processFrontMatter backed by a per-path store.
 *
 * ADR-26: Tests can assert the exact fm mutation after a write, and a registered
 * `metadataCache.on("changed")` handler fires after each mutation.
 *
 * processFrontMatter is a vi.fn() so existing tests can use
 * `vi.mocked(app.fileManager.processFrontMatter).mockResolvedValue(undefined)`
 * (which overrides the default impl — the store is not consulted when the spy
 * is overridden, which is intentional and harmless).
 *
 * Helpers (_-prefixed, test-only):
 *   _setFrontmatter(path, obj) — pre-seed a file's frontmatter before a write
 *   _getFrontmatter(path)      — read back the stored frontmatter for assertions
 *
 * Real API shape (obsidian.d.ts:2954):
 *   processFrontMatter(file: TFile, fn: (fm: Record<string,unknown>) => void, options?: unknown): Promise<void>
 */
class MockFileManager {
	/** Per-path frontmatter store. Missing paths initialise to {}. */
	private _store: Map<string, Record<string, unknown>> = new Map();

	/** Back-reference to the owning App's metadataCache (set by App constructor). */
	_metadataCache: MetadataCacheTrigger | null = null;

	processFrontMatter: ReturnType<typeof vi.fn> = vi.fn(
		async (
			file: TFile,
			fn: (fm: Record<string, unknown>) => void,
			_options?: unknown,
		): Promise<void> => {
			// Run the mutator against the stored (or freshly-created) fm object.
			const fm = this._store.get(file.path) ?? {};
			fn(fm);
			this._store.set(file.path, fm);

			// Emit metadataCache "changed" so Phase 3/6 re-render round-trip tests work.
			this._metadataCache?._trigger("changed", file);
		},
	);

	/** Pre-seed a file's frontmatter. Copies the object so mutations are isolated. */
	_setFrontmatter(path: string, obj: Record<string, unknown>): void {
		this._store.set(path, { ...obj });
	}

	/** Read back a file's current frontmatter from the store. Returns {} when absent. */
	_getFrontmatter(path: string): Record<string, unknown> {
		return this._store.get(path) ?? {};
	}
}

export class App {
	vault = {
		getRoot: vi.fn(() => new TFolder()),
		getAbstractFileByPath: vi.fn(),
		getFileByPath: vi.fn(),
		read: vi.fn(),
		cachedRead: vi.fn(),
		create: vi.fn(),
		modify: vi.fn(),
		// process: atomic read-modify-write. The transform callback receives the
		// current file content as a string and must return the new content.
		// Tests stub this via vi.mocked(app.vault.process).mockImplementation(...)
		// when they need realistic behaviour; otherwise it returns undefined.
		process: vi.fn(),
		delete: vi.fn(),
		trash: vi.fn(),
		readBinary: vi.fn(),
		createBinary: vi.fn(),
		modifyBinary: vi.fn(),
		getMarkdownFiles: vi.fn(() => [] as TFile[]),
		getFiles: vi.fn(() => [] as TFile[]),
		getAllLoadedFiles: vi.fn(() => [] as (TFile | TFolder)[]),
		getResourcePath: vi.fn((file: TFile): string => `app://vault/${file.path}`),
		adapter: {
			read: vi.fn(),
			write: vi.fn(),
			exists: vi.fn(),
			mkdir: vi.fn(async (_normalizedPath: string) => {}),
			stat: vi.fn(async () => null),
			rename: vi.fn(),
			remove: vi.fn(),
		},
		configDir: ".obsidian",
	};
	fileManager: MockFileManager = new MockFileManager();
	workspace: Workspace = new Workspace();
	metadataCache = {
		getFileCache: vi.fn((_file: TFile): CachedMetadata | null => null),
		getFirstLinkpathDest: vi.fn(
			(_linkpath: string, _sourcePath: string): TFile | null => null,
		),
		/**
		 * resolvedLinks — mirrors the real MetadataCache.resolvedLinks shape
		 * (obsidian.d.ts:4438): `{ srcPath: { destPath: count } }`.
		 *
		 * Tests set this directly:
		 *   app.metadataCache.resolvedLinks = { "src.md": { "dest.md": 1 } };
		 * or mutate per-entry:
		 *   app.metadataCache.resolvedLinks["src.md"] = { "dest.md": 2 };
		 */
		resolvedLinks: {} as Record<string, Record<string, number>>,
		/** Live registrations (event → callbacks). Cleared by off() on unload. */
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		_eventRegistrations: new Map<string, Array<(...args: any[]) => any>>(),
		on: vi.fn(function(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this: { _eventRegistrations: Map<string, Array<(...args: any[]) => any>>; off: (ref: MockEventRef) => void },
			event: string,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			callback: (...args: any[]) => any,
		): MockEventRef {
			if (!this._eventRegistrations.has(event)) {
				this._eventRegistrations.set(event, []);
			}
			this._eventRegistrations.get(event)!.push(callback);
			return { e: event, fn: callback, _emitter: this };
		}),
		/** Remove a previously-registered callback (called on component unload). */
		off: vi.fn(function(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this: { _eventRegistrations: Map<string, Array<(...args: any[]) => any>> },
			ref: MockEventRef,
		): void {
			const list = this._eventRegistrations.get(ref.e);
			if (!list) return;
			const idx = list.indexOf(ref.fn);
			if (idx !== -1) list.splice(idx, 1);
			if (list.length === 0) this._eventRegistrations.delete(ref.e);
		}),
		/** Trigger metadataCache event — fires only LIVE registrations. */
		_trigger: function(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this: { _eventRegistrations: Map<string, Array<(...args: any[]) => any>> },
			event: string,
			...args: unknown[]
		): void {
			const callbacks = this._eventRegistrations.get(event) ?? [];
			for (const cb of callbacks) cb(...args);
		},
	};

	constructor() {
		// Wire the fileManager's _metadataCache back-reference so processFrontMatter
		// can emit "changed" events via the metadataCache._trigger mechanism (ADR-26).
		this.fileManager._metadataCache = this.metadataCache;
	}
}

// --- Plugin ---

/**
 * Structural subset of the real Obsidian Command: `id` and `name` are required,
 * `callback` optional — matching addCommand's accepted/returned shape.
 */
export interface MockCommand {
	id: string;
	name: string;
	callback?: () => void;
}

export class Plugin extends Component {
	app: App;
	manifest: PluginManifest = { id: "story-forge", name: "Story Forge", version: "0.0.0", minAppVersion: "1.5.7" };

	constructor(app?: App) {
		super();
		this.app = app ?? new App();
	}

	/**
	 * Internal command registry keyed by the FULL prefixed id (mirrors how real
	 * Obsidian stores commands). Tests can inspect it to assert the id round-trip.
	 */
	_commands = new Map<string, MockCommand>();

	loadData = vi.fn(async () => ({}));
	saveData = vi.fn(async (_data?: unknown) => {});
	addRibbonIcon = vi.fn(
		(_icon: string, _title: string, _cb: (e: MouseEvent) => unknown): HTMLElement =>
			document.createElement("div"),
	);
	addStatusBarItem = vi.fn(() => ({ setText: vi.fn() }));
	/**
	 * addCommand — mirrors real Obsidian: the passed id is internally prefixed
	 * with `${manifest.id}:`. Returns the stored command object carrying the FULL
	 * prefixed id, so any code that (wrongly) trusts the return value round-trips
	 * the SAME prefixed id — while correct code reconstructs it deterministically.
	 */
	addCommand = vi.fn(
		(spec: MockCommand): MockCommand => {
			const fullId = `${this.manifest.id}:${spec.id}`;
			const cmd = { ...spec, id: fullId };
			this._commands.set(fullId, cmd);
			return cmd;
		},
	);
	/**
	 * removeCommand — mirrors real Obsidian: the passed id is auto-prefixed with
	 * `${manifest.id}:` (exactly like addCommand). So the caller must pass the
	 * LOCAL id; passing an already-prefixed id double-prefixes and deletes nothing
	 * (the real-world bug this models — a plain delete-by-arg mock hid it).
	 */
	removeCommand = vi.fn((commandId: string): void => {
		this._commands.delete(`${this.manifest.id}:${commandId}`);
	});
	addSettingTab = vi.fn();
	registerView = vi.fn((_type: string, _factory: (leaf: WorkspaceLeaf) => unknown): void => {});
	/**
	 * registerBasesView — type-only declaration mirroring obsidian.d.ts:5009.
	 *
	 * Declared (not implemented) so the real method name and return type are
	 * visible to TypeScript without injecting a runtime function on every
	 * Plugin instance.  Tests that need the method wire it via `(plugin as any)
	 * .registerBasesView = vi.fn(...)`.  Tests that assert absence need no
	 * changes — `typeof plugin.registerBasesView` is `undefined` at runtime
	 * because `declare` emits no JavaScript.
	 */
	declare registerBasesView: (viewId: string, registration: BasesViewRegistration) => boolean;
	register = vi.fn((fn: () => unknown) => {
		this._cleanupFns.push(fn);
	});

	/**
	 * Simulate Obsidian calling all registered cleanup functions (for testing
	 * onunload). Runs register() callbacks AND any register*Event cleanups —
	 * mirrors the real Plugin/Component unload releasing every listener.
	 */
	_runCleanup(): void {
		this._unload();
	}
}

// --- UI Components ---

export class Modal {
	app: App;
	contentEl: HTMLElement;
	constructor(app: App) {
		this.app = app;
		this.contentEl = augmentEl(document.createElement("div"));
	}
	open = vi.fn(() => {
		// Mirror real Obsidian: mount contentEl into document.body so tests can
		// query the DOM to find buttons / text content.
		document.body.appendChild(this.contentEl);
		this.onOpen();
	});
	close = vi.fn(() => {
		this.onClose();
		// Remove contentEl from body on close (mirrors real Obsidian teardown).
		if (this.contentEl.parentNode) {
			this.contentEl.parentNode.removeChild(this.contentEl);
		}
	});
	onOpen(): void {}
	onClose(): void {}
}

export class Notice {
	static _instances: Notice[] = [];
	constructor(
		public message: string,
		public timeout?: number,
	) {
		Notice._instances.push(this);
	}
	static _reset(): void {
		Notice._instances.length = 0;
	}
}

export class Setting {
	settingEl = document.createElement("div");
	nameEl = document.createElement("div");
	descEl = augmentEl(document.createElement("div"));
	private _containerEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this._containerEl = containerEl;
		this.settingEl.appendChild(this.nameEl);
		this.settingEl.appendChild(this.descEl);
		this._containerEl.appendChild(this.settingEl);
	}

	setName = vi.fn((name: string) => {
		this.nameEl.textContent = name;
		this.settingEl.setAttribute("data-setting-name", name);
		return this;
	});
	setDesc = vi.fn((desc: string) => {
		this.descEl.textContent = desc;
		return this;
	});
	setHeading = vi.fn(() => {
		this.settingEl.classList.add("setting-heading");
		return this;
	});
	addText = vi.fn((cb: (text: TextComponent) => void) => {
		const text = new TextComponent();
		this.settingEl.appendChild(text.inputEl);
		cb(text);
		return this;
	});
	addToggle = vi.fn((cb: (toggle: ToggleComponent) => void) => {
		const toggle = new ToggleComponent();
		this.settingEl.appendChild(toggle.toggleEl);
		cb(toggle);
		return this;
	});
	addDropdown = vi.fn((cb: (dropdown: DropdownComponent) => void) => {
		const dropdown = new DropdownComponent();
		this.settingEl.appendChild(dropdown.selectEl);
		cb(dropdown);
		return this;
	});
	addButton = vi.fn((cb: (button: ButtonComponent) => void) => {
		const button = new ButtonComponent();
		this.settingEl.appendChild(button.buttonEl);
		cb(button);
		return this;
	});
}

// Extend HTMLElement with Obsidian-specific DOM helpers used by setting tabs.
// Exported so component tests (e.g. HeaderSection) can build augmented
// containers without instantiating a full PluginSettingTab.
export function augmentEl(el: HTMLElement): HTMLElement {
	const any = el as unknown as Record<string, unknown>;

	any["createEl"] = (
		childTag: string,
		opts?: {
			text?: string;
			cls?: string;
			type?: string;
			placeholder?: string;
			value?: string;
			href?: string;
			attr?: Record<string, string>;
			title?: string;
		},
	): HTMLElement => {
		const child = augmentEl(document.createElement(childTag));
		if (opts?.text) child.textContent = opts.text;
		if (opts?.cls) child.className = opts.cls;
		if (opts?.type) (child as HTMLInputElement).type = opts.type;
		if (opts?.placeholder)
			(child as HTMLInputElement).placeholder = opts.placeholder;
		if (opts?.value) (child as HTMLInputElement).value = opts.value;
		if (opts?.href) (child as HTMLAnchorElement).href = opts.href;
		if (opts?.title) child.title = opts.title;
		if (opts?.attr) {
			for (const [k, v] of Object.entries(opts.attr)) child.setAttribute(k, v);
		}
		el.appendChild(child);
		return child;
	};

	any["createDiv"] = (opts?: { cls?: string; text?: string }): HTMLElement => {
		const div = augmentEl(document.createElement("div"));
		if (opts?.cls) div.className = opts.cls;
		if (opts?.text) div.textContent = opts.text;
		el.appendChild(div);
		return div;
	};

	any["createSpan"] = (opts?: { cls?: string; text?: string }): HTMLElement => {
		const span = augmentEl(document.createElement("span"));
		if (opts?.cls) span.className = opts.cls;
		if (opts?.text) span.textContent = opts.text;
		el.appendChild(span);
		return span;
	};

	any["appendText"] = (text: string): void => {
		el.appendChild(document.createTextNode(text));
	};

	any["empty"] = (): void => {
		while (el.firstChild) el.removeChild(el.firstChild);
	};

	any["addClass"] = (...classes: string[]): void => {
		el.classList.add(...classes);
	};

	any["removeClass"] = (...classes: string[]): void => {
		el.classList.remove(...classes);
	};

	any["toggleClass"] = (cls: string, force?: boolean): void => {
		el.classList.toggle(cls, force);
	};

	return el;
}

function makeObsidianEl(tag = "div"): HTMLElement {
	return augmentEl(document.createElement(tag));
}

export class PluginSettingTab {
	app: App;
	plugin: Plugin;
	containerEl = makeObsidianEl("div");
	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
	}
	display() {}
	hide() {}
}

// --- UI Primitives ---

/**
 * TextComponent — exposes `inputEl` so tests can set value and fire events
 * directly. Bound via `addText(cb => cb.onChange(...))` in production code.
 */
export class TextComponent {
	inputEl: HTMLInputElement;
	_onChange?: (value: string) => void;

	constructor() {
		this.inputEl = document.createElement("input");
		this.inputEl.type = "text";
	}

	setValue = vi.fn((v: string) => {
		this.inputEl.value = v;
		return this;
	});
	setPlaceholder = vi.fn((p: string) => {
		this.inputEl.placeholder = p;
		return this;
	});
	onChange = vi.fn((cb: (value: string) => void) => {
		this._onChange = cb;
		this.inputEl.addEventListener("input", () => cb(this.inputEl.value));
		return this;
	});
}

/**
 * ToggleComponent — exposes `toggleEl` so tests can click to flip state.
 *
 * Mirrors the real Obsidian `new ToggleComponent(containerEl)`: the constructor
 * appends `toggleEl` into the passed container so code that builds a toggle
 * directly (not via `Setting.addToggle`) renders a switch tests can find. The
 * arg is optional to keep the existing `Setting.addToggle` path (which passes
 * none and appends the toggleEl itself) working unchanged.
 */
export class ToggleComponent {
	toggleEl: HTMLElement;
	_value = false;
	_onChange?: (value: boolean) => void;

	constructor(containerEl?: HTMLElement) {
		this.toggleEl = document.createElement("div");
		this.toggleEl.setAttribute("role", "switch");
		this.toggleEl.addEventListener("click", () => {
			this._value = !this._value;
			this.toggleEl.setAttribute("aria-checked", String(this._value));
			this._onChange?.(this._value);
		});
		if (containerEl) containerEl.appendChild(this.toggleEl);
	}

	setValue = vi.fn((v: boolean) => {
		this._value = v;
		this.toggleEl.setAttribute("aria-checked", String(v));
		return this;
	});
	onChange = vi.fn((cb: (value: boolean) => void) => {
		this._onChange = cb;
		return this;
	});
}

/** ButtonComponent — exposes `buttonEl` so tests can dispatch real clicks. */
export class ButtonComponent {
	buttonEl: HTMLButtonElement;
	_onClick?: () => void;

	constructor() {
		this.buttonEl = document.createElement("button");
		this.buttonEl.addEventListener("click", () => this._onClick?.());
	}

	setButtonText = vi.fn((text: string) => {
		this.buttonEl.textContent = text;
		return this;
	});
	setCta = vi.fn(() => {
		this.buttonEl.classList.add("mod-cta");
		return this;
	});
	setWarning = vi.fn(() => {
		this.buttonEl.classList.add("mod-warning");
		return this;
	});
	setIcon = vi.fn(() => this);
	setTooltip = vi.fn((text: string) => {
		this.buttonEl.setAttribute("aria-label", text);
		return this;
	});
	onClick = vi.fn((cb: () => void) => {
		this._onClick = cb;
		return this;
	});
}

/**
 * DropdownComponent — exposes `selectEl` (an HTMLSelectElement) so tests can
 * set the value and dispatch a change event.
 */
export class DropdownComponent {
	selectEl: HTMLSelectElement;
	_onChange?: (value: string) => void;

	constructor() {
		this.selectEl = document.createElement("select");
		this.selectEl.addEventListener("change", () => {
			this._onChange?.(this.selectEl.value);
		});
	}

	addOption = vi.fn((value: string, display: string) => {
		const opt = document.createElement("option");
		opt.value = value;
		opt.textContent = display;
		this.selectEl.appendChild(opt);
		return this;
	});
	setValue = vi.fn((v: string) => {
		this.selectEl.value = v;
		return this;
	});
	onChange = vi.fn((cb: (value: string) => void) => {
		this._onChange = cb;
		return this;
	});
}

// --- Menu ---

/** Position accepted by Menu.showAtPosition (mirrors real MenuPositionDef). */
export interface MenuPositionDef {
	x: number;
	y: number;
	width?: number;
	overlap?: boolean;
	left?: boolean;
}

/**
 * MenuItem — faithful to the real Obsidian MenuItem API.
 *
 * All setters are chainable (`this`) and record their value so tests can read
 * back the item's title / icon / disabled state and invoke its onClick handler.
 * Recorded state is exposed on `_`-prefixed fields (test scaffolding, mirroring
 * the file's convention for test-only inspection surface).
 */
export class MenuItem {
	/** Recorded title (last setTitle value). */
	_title: string | DocumentFragment | null = null;
	/** Recorded icon (last setIcon value; null clears it). */
	_icon: IconName | null = null;
	/** Recorded disabled flag. */
	_disabled = false;
	/** Recorded onClick handler, invocable by tests. */
	_onClick?: (evt: MouseEvent | KeyboardEvent) => unknown;

	setTitle = vi.fn((title: string | DocumentFragment): this => {
		this._title = title;
		return this;
	});
	setIcon = vi.fn((icon: IconName | null): this => {
		this._icon = icon;
		return this;
	});
	setDisabled = vi.fn((disabled: boolean): this => {
		this._disabled = disabled;
		return this;
	});
	onClick = vi.fn((cb: (evt: MouseEvent | KeyboardEvent) => unknown): this => {
		this._onClick = cb;
		return this;
	});
}

/** A recorded item entry — flattens MenuItem state for order-inspection. */
export interface MenuItemEntry {
	kind: "item";
	item: MenuItem;
	/** The recorded title (string form; DocumentFragment left as-is). */
	title: string | DocumentFragment | null;
	icon: IconName | null;
	disabled: boolean;
	/** The recorded onClick handler (undefined until onClick() is called). */
	onClickFn?: (evt: MouseEvent | KeyboardEvent) => unknown;
}

/** A recorded separator entry. */
export interface MenuSeparatorEntry {
	kind: "separator";
}

/** Ordered menu entry — item or separator, in insertion order. */
export type MenuEntry = MenuItemEntry | MenuSeparatorEntry;

/**
 * Menu — faithful to the real Obsidian Menu API (constructor + addItem /
 * addSeparator / showAtMouseEvent / showAtPosition, all chainable).
 *
 * Records items and separators in insertion order on `_entries` so tests can
 * assert item/separator ordering. `_items` is a convenience view over the item
 * entries only. `_shown` flips true once the menu is shown.
 *
 * Extends Component to mirror the real `class Menu extends Component`.
 */
export class Menu extends Component {
	/** Ordered entries (items + separators) in insertion order. */
	_entries: MenuEntry[] = [];
	/** Whether the menu has been shown (showAtMouseEvent / showAtPosition). */
	_shown = false;

	/** Convenience view: only the item entries, in order. */
	get _items(): MenuItemEntry[] {
		return this._entries.filter(
			(e): e is MenuItemEntry => e.kind === "item",
		);
	}

	addItem = vi.fn((cb: (item: MenuItem) => unknown): this => {
		const item = new MenuItem();
		cb(item);
		// Snapshot the recorded state AFTER the callback ran (the item is fully
		// configured by then) so each entry reflects the item's final values.
		this._entries.push({
			kind: "item",
			item,
			title: item._title,
			icon: item._icon,
			disabled: item._disabled,
			onClickFn: item._onClick,
		});
		return this;
	});

	addSeparator = vi.fn((): this => {
		this._entries.push({ kind: "separator" });
		return this;
	});

	/**
	 * showAtMouseEvent / showAtPosition — real Obsidian prototype methods (not
	 * instance arrows) so tests can `vi.spyOn(Menu.prototype, "showAtMouseEvent")`
	 * and read the captured menu from `showSpy.mock.instances`.
	 */
	showAtMouseEvent(_evt: MouseEvent): this {
		this._shown = true;
		return this;
	}

	showAtPosition(_position: MenuPositionDef, _doc?: Document): this {
		this._shown = true;
		return this;
	}
}

// --- Views ---

/**
 * WorkspaceLeaf mock — faithful to the real Obsidian WorkspaceLeaf shape.
 *
 * Tracks setViewState calls so tests can assert the view type was set.
 * The `view` field shape matches ItemView/MarkdownView.
 *
 * `app` is stored on the leaf so that ItemView (which calls super(leaf)) can
 * access it via this.leaf.app — matching real Obsidian's View.app getter.
 */
export class WorkspaceLeaf {
	/** App context — set by tests so ItemView.app resolves correctly. */
	app: App = new App();

	view: {
		getViewType: ReturnType<typeof vi.fn>;
		file: TFile | null;
	} = {
		getViewType: vi.fn(() => "markdown"),
		file: null,
	};

	/**
	 * setViewState — updates view.getViewType to return the new type.
	 * Returns a resolved Promise to match the real API.
	 */
	setViewState = vi.fn(
		// Mirrors the real ViewState shape: `state` (per-view state) + `pinned` in
		// addition to type/active, so callers passing an initial view state typecheck.
		async (state: {
			type: string;
			active?: boolean;
			pinned?: boolean;
			state?: Record<string, unknown>;
		}): Promise<void> => {
			this.view.getViewType = vi.fn(() => state.type);
		},
	);

	/** detach — removes the leaf (no-op in mock). */
	detach = vi.fn((): void => {});

	/** openFile — opens a TFile in this leaf (no-op in mock). */
	openFile = vi.fn(async (_file: TFile, _openState?: unknown): Promise<void> => {});
}

/**
 * ItemView — abstract base class for sidebar panels.
 *
 * Constructor shape mirrors real Obsidian: new ItemView(leaf) — `app` is
 * accessed via `leaf.app` (set by the real Obsidian View base class).
 *
 * `containerEl` follows the real Obsidian 2-child convention:
 *   containerEl.children[0] = header area
 *   containerEl.children[1] = contentEl (the writable area)
 *
 * Lifecycle:
 *   onOpen()  — called when the view is first opened; override in subclass.
 *   onClose() — called when the view is closed; override in subclass.
 *
 * registerEvent / registerDomEvent / registerInterval delegate to Component
 * so they're tracked for cleanup assertions.
 */
export class ItemView extends Component {
	leaf: WorkspaceLeaf;
	app: App;

	/** The outer container (header + content). */
	containerEl: HTMLElement;
	/** The content area where subclasses render. */
	contentEl: HTMLElement;

	constructor(leaf: WorkspaceLeaf) {
		super();
		this.leaf = leaf;
		// Mirror real Obsidian: app comes from leaf.app (set by the plugin runtime)
		this.app = leaf.app;

		// Build containerEl with two children (header + content)
		this.containerEl = makeObsidianEl("div");
		const headerEl = makeObsidianEl("div");
		this.contentEl = makeObsidianEl("div");
		this.containerEl.appendChild(headerEl);
		this.containerEl.appendChild(this.contentEl);
	}

	// --- Abstract methods — subclasses MUST override ---
	getViewType(): string {
		return "";
	}
	getDisplayText(): string {
		return "";
	}
	getIcon(): string {
		return "";
	}

	// --- Lifecycle ---
	async onOpen(): Promise<void> {}
	async onClose(): Promise<void> {}
}

export class MarkdownView {
	editor = {
		replaceSelection: vi.fn(),
		getValue: vi.fn(() => ""),
		setValue: vi.fn(),
		getSelection: vi.fn(() => ""),
	};
	file: TFile | null = null;
	data = "";
	getViewData = vi.fn((): string => this.data);
	save = vi.fn(async (): Promise<void> => {});
}

export class Editor {
	replaceSelection = vi.fn();
	getValue = vi.fn(() => "");
	setValue = vi.fn();
	getSelection = vi.fn(() => "");
}

// --- File System ---

export class TFile {
	path = "test.md";
	name = "test.md";
	basename = "test";
	extension = "md";
	vault = {};
	parent: TFolder | null = null;
	stat = { ctime: 1000, mtime: 2000, size: 100 };
}

export class TFolder {
	path = "test-folder";
	name = "test-folder";
	children: (TFile | TFolder)[] = [];
}

// --- Events ---

export class Events {
	on = vi.fn();
	off = vi.fn();
	trigger = vi.fn();
}

// ---------------------------------------------------------------------------
// Bases API stubs (T1.1 — firewall + feature-detect + fence)
//
// Minimal faithful mirror of obsidian.d.ts 1.13.1 (BasesViewRegistration,
// BasesConfigFile, BasesView, BasesViewConfig, BasesViewFactory,
// QueryController, MarkdownRenderer).
//
// RULES:
//  - Shape must match the real obsidian.d.ts exactly — no invented members.
//  - Abstract classes with protected constructors stay as stubs (they can't
//    be instantiated in tests anyway — the Bases runtime owns their lifecycle).
//  - MarkdownRenderer.render is a static vi.fn() spy so tests can assert calls.
//
// These stubs are exported so src/bases/ modules compile under tsconfig.test.json
// (which aliases "obsidian" → this file).
// ---------------------------------------------------------------------------

/** Mirrors BasesConfigFile from obsidian.d.ts (since 1.10.0). */
export interface BasesConfigFile {
	filters?: unknown;
	properties?: Record<string, Record<string, unknown>>;
	formulas?: Record<string, string>;
	summaries?: Record<string, string>;
	views?: BasesConfigFileView[];
}

/** Mirrors BasesConfigFileView from obsidian.d.ts (since 1.10.0). */
export interface BasesConfigFileView {
	type: string;
	name: string;
	filters?: unknown;
	groupBy?: Record<string, unknown>;
}

/**
 * Mirrors BasesPropertyId from obsidian.d.ts (since 1.10.0).
 * A branded property identifier: `${BasesPropertyType}.${string}`.
 * In the mock we use a simpler `string` alias so test code can use plain strings.
 */
export type BasesPropertyId = string;

/**
 * Minimal stub for QueryController (extends Component; opaque — no public members in
 * obsidian.d.ts 1.13.1). Used only in BasesViewFactory / BasesView constructor.
 */
export class QueryController extends Component {}

/** Mirrors BasesViewConfig from obsidian.d.ts (since 1.10.0). */
export class BasesViewConfig {
	name: string = "";
	get(_key: string): unknown { return undefined; }
}

// ---------------------------------------------------------------------------
// BasesEntry + BasesQueryResult stubs (obsidian.d.ts:685, 971 @since 1.10.0)
//
// Declared before BasesView so BasesView.data can be typed as BasesQueryResult.
// ---------------------------------------------------------------------------

/**
 * Minimal stand-in for the real Bases `Value` wrapper (obsidian.d.ts:7246,
 * `export abstract class Value { abstract toString(): string; ... }`).
 *
 * Real `getValue()` NEVER returns a raw scalar — it always returns a `Value`
 * wrapper (or `null`). The mock previously typed `getValue` as returning
 * `unknown`, which let `BasesEntry` satisfy `cardRegistry.ts`'s
 * `BasesEntryLike` under the main tsconfig (where "obsidian" resolves to the
 * REAL typings and `Value` structurally has `toString()`) while silently
 * failing to satisfy it under tsconfig.test/tsconfig.mock (where "obsidian"
 * resolves to THIS file, and `unknown` is not assignable to `{ toString():
 * string } | null`) — a mock/reality divergence caught only by running
 * `typecheck:test`/`typecheck:mock`, not `typecheck`. Typed narrowly to the
 * one accessor every Story Forge caller reads (`toString()`) rather than
 * reproducing the rest of the abstract class (`isTruthy()`, `renderTo()`),
 * which nothing here calls.
 */
export interface MockBasesValue {
	toString(): string;
}

/**
 * Stub for BasesEntry (obsidian.d.ts:685 @since 1.10.0).
 *
 * Shape mirrors obsidian.d.ts: `file: TFile` + `getValue(propertyId): Value | null`.
 * `getValue` is a vi.fn() spy so tests can stub return values per property —
 * stub with a `{ toString(): string }` object (or `null`), never a raw scalar,
 * to match what the real API actually returns.
 */
export class BasesEntry {
	file: TFile = new TFile();
	getValue = vi.fn((_propertyId: string): MockBasesValue | null => null);
}

/**
 * Stub for BasesEntryGroup (obsidian.d.ts:710 @since 1.10.0).
 * Shape mirrors obsidian.d.ts: `key?: Value (unknown in mock); entries: BasesEntry[]; hasKey()`.
 * Value is an abstract class with no testable body — typed as `unknown` here.
 */
export class BasesEntryGroup {
	key?: unknown;
	entries: BasesEntry[] = [];
	hasKey(): boolean { return this.key !== undefined; }
}

/** Minimal stub for BasesQueryResult (obsidian.d.ts:971). */
export class BasesQueryResult {
	/** Flat list of result entries (mirrors BasesQueryResult.data). */
	data: BasesEntry[] = [];

	/** Grouped view of entries (mirrors BasesQueryResult.groupedData getter). */
	get groupedData(): BasesEntryGroup[] { return []; }
}

/**
 * Mirrors BasesViewFactory type from obsidian.d.ts (since 1.10.0).
 * (controller: QueryController, containerEl: HTMLElement) => BasesView
 */
export type BasesViewFactory = (controller: QueryController, containerEl: HTMLElement) => BasesView;

/**
 * Stub for BasesView abstract class (since 1.10.0).
 * Protected constructor — can only be subclassed, not instantiated directly.
 * Shape mirrors obsidian.d.ts:1105–1161.
 */
export abstract class BasesView extends Component {
	abstract type: string;
	app: App = new App();
	config: BasesViewConfig = new BasesViewConfig();
	allProperties: string[] = [];
	/**
	 * Mirrors BasesView.data: BasesQueryResult (obsidian.d.ts:1137).
	 * Typed as BasesQueryResult so subclass code can read data.data (BasesEntry[]).
	 */
	data: BasesQueryResult = new BasesQueryResult();

	// Constructor is protected in the real API; we must accept a QueryController.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	protected constructor(_controller: QueryController) {
		super();
	}

	abstract onDataUpdated(): void;
}

/** Mirrors BasesViewRegistration interface from obsidian.d.ts (since 1.10.0). */
export interface BasesViewRegistration {
	name: string;
	icon: string;
	factory: BasesViewFactory;
	options?: (config: BasesViewConfig) => unknown[];
}

/**
 * MarkdownRenderer — mirrors the real static class in obsidian.d.ts.
 *
 * render() is a static vi.fn() spy so tests can assert it was called with
 * the correct args (app, markdown, el, sourcePath, component).
 *
 * Mirrors obsidian.d.ts:4147 (non-deprecated static render).
 */
export class MarkdownRenderer {
	static render = vi.fn(
		async (
			_app: App,
			_markdown: string,
			_el: HTMLElement,
			_sourcePath: string,
			_component: Component,
		): Promise<void> => {},
	);
}

// ---------------------------------------------------------------------------
// Dataview API mock (T3.2 — engine registry tests)
//
// A minimal test double faithful to Dataview v0.5.68:
//   - execute / executeJs are vi.fn() spies (return resolved Promise)
//   - version.satisfies returns true (passing the >=0.5.31 gate by default)
//   - settings.enableDataviewJs defaults to false (safe default)
//
// Wired into App.plugins.plugins["dataview"].api so getDataviewApi() is
// testable. Tests can override individual vi.fn() mocks per-test:
//   dvApi.version.satisfies = vi.fn(() => false)  // simulate old version
//   dvApi.settings.enableDataviewJs = false       // simulate DVJS disabled
//   delete (app as any).plugins.plugins["dataview"]  // simulate absent Dataview
// ---------------------------------------------------------------------------

/** Minimal Dataview API test double (v0.5.68 shape). */
export interface MockDataviewApi {
	execute: ReturnType<typeof vi.fn>;
	executeJs: ReturnType<typeof vi.fn>;
	version: { satisfies: ReturnType<typeof vi.fn> };
	settings: { enableDataviewJs: boolean };
}

/**
 * Create a fresh Dataview API test double.
 * By default version.satisfies returns true and enableDataviewJs is false.
 */
export function createMockDataviewApi(overrides?: Partial<{
	satisfies: boolean;
	enableDataviewJs: boolean;
}>): MockDataviewApi {
	return {
		execute: vi.fn(async () => {}),
		executeJs: vi.fn(async () => {}),
		version: {
			satisfies: vi.fn(() => overrides?.satisfies ?? true),
		},
		settings: {
			enableDataviewJs: overrides?.enableDataviewJs ?? false,
		},
	};
}

/**
 * Wire a MockDataviewApi onto an App instance at the standard plugin slot.
 * After calling this, getDataviewApi(app) will return the mock api.
 *
 * To simulate Dataview absent: delete (app as any).plugins.
 */
export function wireDataviewApi(app: App, api: MockDataviewApi): void {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const anyApp = app as any;
	if (!anyApp.plugins) {
		anyApp.plugins = { plugins: {} };
	}
	anyApp.plugins.plugins["dataview"] = { api };
}

/**
 * apiVersion — mirrors the real Obsidian global (obsidian.d.ts:400): "This is
 * the API version of the app, which follows the release cycle of the desktop
 * app." A plain value export so `src/` code doing
 * `import { apiVersion } from "obsidian"` compiles and reads a real string at
 * runtime (T4.6 — ADR-36 needs this to tell "Bases absent" apart from "Bases
 * present but disabled"; ungapped now because it was the load-bearing mock gap
 * that made the four availability combinations untestable).
 *
 * Exported as `let` (a live ES-module binding: any module that imports
 * `{ apiVersion }` and reads it inside a function body — not a value captured
 * at import time — observes a later mutation here) with companion setter/reset
 * helpers so per-test stubbing is explicit and typesafe
 * (`_setApiVersion("1.9.0")` / `_resetApiVersion()`), mirroring this file's own
 * `Notice._reset()` convention rather than tests reassigning the imported
 * binding directly (disallowed by ES module syntax for a bare `import`).
 */
export let apiVersion = "1.13.1";

/** Test-only: stub apiVersion for a single test (e.g. simulate an older Obsidian without Bases). */
export function _setApiVersion(v: string): void {
	apiVersion = v;
}

/** Test-only: restore the default apiVersion after a test stubs it. */
export function _resetApiVersion(): void {
	apiVersion = "1.13.1";
}

// --- Platform ---

/**
 * Platform — mirrors the real Obsidian Platform object.
 *
 * isMobile / isDesktop are mutable so tests can override them per-test:
 *   (Platform as { isMobile: boolean }).isMobile = true;
 *
 * The ConsentGate tests use vi.mock("obsidian") to override Platform globally.
 * When NOT using vi.mock, tests can mutate Platform directly.
 */
export const Platform = {
	isMobile: false,
	isDesktop: true,
};

// --- Utilities ---

export function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

/**
 * Realistic getAllTags implementation. obsidian.d.ts:3329 documents this as
 * *"Combines all tags from frontmatter and note content into a single array"* —
 * so it reads BOTH `cache.tags` (inline `#tags` in the body) and the
 * frontmatter `tags` key, and returns every tag with a leading `#`.
 *
 * The frontmatter half matters: the whole seed vault tags its notes in
 * frontmatter (`tags: [canon/character]`) and carries no inline tags at all,
 * so a mock that read only `cache.tags` reported every seed note as untagged —
 * a divergence from the real API that would let tag-driven code pass its tests
 * while resolving nothing in a real vault.
 *
 * Frontmatter `tags` accepts what Obsidian accepts: a list, or a single
 * comma/space-separated string. Non-string members are skipped rather than
 * stringified. Returns null when the note has no tags from either source.
 * Tests can override via vi.mocked(getAllTags).mockReturnValue(...).
 */
export const getAllTags = vi.fn(
	(cache: CachedMetadata): string[] | null => {
		const tags: string[] = (cache.tags ?? []).map((t) => t.tag);

		const fmTags: unknown = cache.frontmatter?.["tags"];
		const raw: unknown[] = Array.isArray(fmTags)
			? fmTags
			: typeof fmTags === "string"
				? fmTags.split(/[,\s]+/)
				: [];
		for (const entry of raw) {
			if (typeof entry !== "string") continue;
			const trimmed = entry.trim();
			if (trimmed === "") continue;
			tags.push(trimmed.startsWith("#") ? trimmed : `#${trimmed}`);
		}

		return tags.length === 0 ? null : tags;
	},
);

// --- Factories ---

export function createMockTFile(overrides?: Partial<{
	path: string;
	name: string;
	basename: string;
	extension: string;
	stat: Partial<{ ctime: number; mtime: number; size: number }>;
}>): TFile {
	const file = new TFile();
	if (overrides?.path !== undefined) file.path = overrides.path;
	if (overrides?.name !== undefined) file.name = overrides.name;
	if (overrides?.basename !== undefined) file.basename = overrides.basename;
	if (overrides?.extension !== undefined) file.extension = overrides.extension;
	if (overrides?.stat) {
		file.stat = {
			ctime: overrides.stat.ctime ?? 1000,
			mtime: overrides.stat.mtime ?? 2000,
			size: overrides.stat.size ?? 100,
		};
	}
	return file;
}

export function createMockCachedMetadata(overrides?: Partial<{
	tags: TagCache[];
	frontmatter: Record<string, unknown>;
	frontmatterLinks: FrontmatterLinkCache[];
}>): CachedMetadata {
	return {
		tags: overrides?.tags ?? [],
		frontmatter: overrides?.frontmatter ?? {},
		frontmatterLinks: overrides?.frontmatterLinks,
	};
}

/**
 * Build a FrontmatterLinkCache entry.
 * key: frontmatter field path, e.g. "pov", "characters.0", "location".
 * link: the wikilink target (without brackets), e.g. "Mara Stoneway".
 */
export function createMockFrontmatterLink(
	key: string,
	link: string,
	displayText?: string,
): FrontmatterLinkCache {
	return {
		key,
		link,
		original: displayText ? `[[${link}|${displayText}]]` : `[[${link}]]`,
		displayText,
	};
}

// --- Debounce utility ---

/**
 * debounce — mirrors the real Obsidian `debounce(fn, ms, resetTimer?)` util.
 *
 * Returns a debounced function with `.cancel()` and `.flush()` helpers so
 * tests can control timing without relying on real timers.
 *
 * Works with both real and fake timers (vi.useFakeTimers()).
 *
 * Parameters:
 *   fn         — the function to debounce
 *   ms         — delay in milliseconds
 *   resetTimer — if true (default), each call resets the timer
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends unknown[], R = void>(
	fn: (...args: T) => R,
	ms: number,
	resetTimer = true,
): ((...args: T) => void) & { cancel: () => void; flush: () => void } {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pending: { args: T } | null = null;

	const debounced = (...args: T): void => {
		pending = { args };
		if (timer !== null && resetTimer) {
			clearTimeout(timer);
			timer = null;
		}
		if (timer === null) {
			timer = setTimeout(() => {
				timer = null;
				const p = pending;
				pending = null;
				if (p) fn(...p.args);
			}, ms);
		}
	};

	debounced.cancel = (): void => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
		pending = null;
	};

	debounced.flush = (): void => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
		if (pending) {
			const p = pending;
			pending = null;
			fn(...p.args);
		}
	};

	return debounced as ((...args: T) => void) & { cancel: () => void; flush: () => void };
}

