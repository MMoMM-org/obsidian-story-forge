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
 * activeDocument — Obsidian's popout-window-aware document reference.
 * In tests (jsdom) there is only one document, so we expose it as a global
 * to match Obsidian's runtime API without requiring @types/obsidian changes.
 */
if (typeof globalThis.activeDocument === "undefined") {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	(globalThis as any).activeDocument = document;
}

// --- Core types ---

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

export class Component {
	/**
	 * registerDomEvent — tracks registration AND wires the real DOM listener.
	 *
	 * The real Obsidian registerDomEvent attaches the listener AND stores it for
	 * cleanup on unload. The mock does the same: addEventListener is called so
	 * tests can dispatch real DOM events (click, keydown, etc.), and the call is
	 * tracked by vi.fn() so tests can assert it was used.
	 */
	registerDomEvent = vi.fn(
		<K extends keyof HTMLElementEventMap>(
			el: HTMLElement,
			type: K,
			listener: (ev: HTMLElementEventMap[K]) => void,
		): void => {
			el.addEventListener(type, listener as EventListener);
		},
	);

	registerInterval = vi.fn();

	/**
	 * registerEvent — tracks that events are registered through the Obsidian API.
	 * Returns the EventRef it was passed (mirrors real Obsidian API).
	 */
	registerEvent = vi.fn(
		(eventRef: unknown): unknown => eventRef,
	);
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
	_eventRegistrations: Map<string, Array<(...args: unknown[]) => void>> = new Map();

	on = vi.fn(
		(
			event: string,
			callback: (...args: unknown[]) => void,
		): { e: string; fn: typeof callback } => {
			if (!this._eventRegistrations.has(event)) {
				this._eventRegistrations.set(event, []);
			}
			this._eventRegistrations.get(event)!.push(callback);
			return { e: event, fn: callback };
		},
	);

	off = vi.fn();

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

	revealLeaf = vi.fn((_leaf: WorkspaceLeaf): void => {});

	detachLeavesOfType = vi.fn((_type: string): void => {});

	getActiveViewOfType = vi.fn(
		<T>(_type: new (...args: unknown[]) => T): T | null => null,
	);

	iterateAllLeaves = vi.fn((_cb: (leaf: WorkspaceLeaf) => void): void => {});

	openLinkText = vi.fn(async (): Promise<void> => {});

	/** Trigger a registered event (used in tests to simulate Obsidian events). */
	_trigger(event: string, ...args: unknown[]): void {
		const callbacks = this._eventRegistrations.get(event) ?? [];
		for (const cb of callbacks) cb(...args);
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
		adapter: {
			read: vi.fn(),
			write: vi.fn(),
			exists: vi.fn(),
			stat: vi.fn(async () => null),
			rename: vi.fn(),
			remove: vi.fn(),
		},
		configDir: ".obsidian",
	};
	fileManager = {
		processFrontMatter: vi.fn(),
	};
	workspace: Workspace = new Workspace();
	metadataCache = {
		getFileCache: vi.fn((_file: TFile): CachedMetadata | null => null),
		getFirstLinkpathDest: vi.fn(
			(_linkpath: string, _sourcePath: string): TFile | null => null,
		),
		on: vi.fn(
			(
				event: string,
				callback: (...args: unknown[]) => void,
			): { e: string; fn: typeof callback } => {
				return { e: event, fn: callback };
			},
		),
		/** Trigger metadataCache event (used in tests). */
		_trigger: function(event: string, ...args: unknown[]): void {
			// Collect callbacks registered via on()
			const onMock = this.on as ReturnType<typeof vi.fn>;
			const calls = onMock.mock.calls as Array<[string, (...args: unknown[]) => void]>;
			for (const [evName, cb] of calls) {
				if (evName === event) cb(...args);
			}
		},
	};
}

// --- Plugin ---

export class Plugin extends Component {
	app: App;
	manifest = { id: "test-plugin", name: "Test Plugin", version: "0.0.0" };
	private _cleanupFns: Array<() => unknown> = [];

	constructor(app?: App) {
		super();
		this.app = app ?? new App();
	}

	loadData = vi.fn(async () => ({}));
	saveData = vi.fn(async () => {});
	addRibbonIcon = vi.fn(() => document.createElement("div"));
	addStatusBarItem = vi.fn(() => ({ setText: vi.fn() }));
	addCommand = vi.fn();
	addSettingTab = vi.fn();
	registerView = vi.fn((_type: string, _factory: (leaf: WorkspaceLeaf) => unknown): void => {});
	register = vi.fn((fn: () => unknown) => {
		this._cleanupFns.push(fn);
	});

	/** Simulate Obsidian calling all registered cleanup functions (for testing onunload). */
	_runCleanup(): void {
		for (const fn of this._cleanupFns) fn();
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
		this.onOpen();
	});
	close = vi.fn(() => {
		this.onClose();
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
class TextComponent {
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

/** ToggleComponent — exposes `toggleEl` so tests can click to flip state. */
class ToggleComponent {
	toggleEl: HTMLElement;
	_value = false;
	_onChange?: (value: boolean) => void;

	constructor() {
		this.toggleEl = document.createElement("div");
		this.toggleEl.setAttribute("role", "switch");
		this.toggleEl.addEventListener("click", () => {
			this._value = !this._value;
			this.toggleEl.setAttribute("aria-checked", String(this._value));
			this._onChange?.(this._value);
		});
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
class ButtonComponent {
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
class DropdownComponent {
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
		async (state: { type: string; active?: boolean }): Promise<void> => {
			this.view.getViewType = vi.fn(() => state.type);
		},
	);

	/** detach — removes the leaf (no-op in mock). */
	detach = vi.fn((): void => {});
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

// --- Utilities ---

export function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

/**
 * Realistic getAllTags implementation: reads cache.tags and returns the tag
 * strings (e.g. "#canon/character"). Returns null when cache has no tags.
 * Tests can override via vi.mocked(getAllTags).mockReturnValue(...).
 */
export const getAllTags = vi.fn(
	(cache: CachedMetadata): string[] | null => {
		if (!cache.tags || cache.tags.length === 0) return null;
		return cache.tags.map((t) => t.tag);
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
export function debounce<T extends (...args: Parameters<T>) => void>(
	fn: T,
	ms: number,
	resetTimer = true,
): T & { cancel: () => void; flush: () => void } {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pending: { args: Parameters<T> } | null = null;

	const debounced = (...args: Parameters<T>): void => {
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

	return debounced as T & { cancel: () => void; flush: () => void };
}
