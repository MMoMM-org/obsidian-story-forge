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
if (typeof (globalThis as Record<string, unknown>).activeDocument === "undefined") {
	(globalThis as Record<string, unknown>).activeDocument = document;
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

export class Component {
	/**
	 * Cleanup functions accumulated via the register* helpers. Running them
	 * (via _unload / _runCleanup) releases every listener/timer — mirroring the
	 * real Obsidian Component lifecycle, so tests can prove nothing leaks.
	 */
	protected _cleanupFns: Array<() => unknown> = [];

	/**
	 * registerDomEvent — tracks registration AND wires the real DOM listener.
	 *
	 * The real Obsidian registerDomEvent attaches the listener AND stores it for
	 * cleanup on unload. The mock does the same: addEventListener is called so
	 * tests can dispatch real DOM events (click, keydown, etc.), and the call is
	 * tracked by vi.fn() so tests can assert it was used. The removeEventListener
	 * is queued as a cleanup so unload genuinely detaches the DOM handler.
	 */
	registerDomEvent = vi.fn(
		<K extends keyof HTMLElementEventMap>(
			el: HTMLElement,
			type: K,
			listener: (ev: HTMLElementEventMap[K]) => void,
		): void => {
			el.addEventListener(type, listener as EventListener);
			this._cleanupFns.push(() => {
				el.removeEventListener(type, listener as EventListener);
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

	revealLeaf = vi.fn((_leaf: WorkspaceLeaf): void => {});

	getActiveFile = vi.fn((): TFile | null => null);

	detachLeavesOfType = vi.fn((_type: string): void => {});

	getActiveViewOfType = vi.fn(
		<T extends { file?: TFile | null }>(_type: new (...args: unknown[]) => T): T | null => null,
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

/** ToggleComponent — exposes `toggleEl` so tests can click to flip state. */
export class ToggleComponent {
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

	showAtMouseEvent = vi.fn((_evt: MouseEvent): this => {
		this._shown = true;
		return this;
	});

	showAtPosition = vi.fn((_position: MenuPositionDef, _doc?: Document): this => {
		this._shown = true;
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

