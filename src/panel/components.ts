/**
 * Shared panel DOM component builders — T3.1.
 *
 * Pure XSS-safe DOM builders using Obsidian's `createEl` API. No `innerHTML`,
 * no framework — only `el.createEl(tag, opts)` which sets textContent safely.
 *
 * Every function appends its output to `container` AND returns the relevant
 * element(s) for callers that need to compose further.
 *
 * Event listeners are NOT wired here except via explicit `onClick` callback
 * params — link-click wiring happens in T3.4/T4 (SidebarView nav stack).
 *
 * @ref SDD/ADR-2 (components module; pure DOM builders)
 * @ref mockups.html S32–S40 (visual render target)
 */

// Obsidian's createEl is available on augmented HTMLElements at runtime and
// in tests via the obsidian mock's augmentEl(). The TypeScript type is not
// shipped in @types/obsidian for plain HTMLElement, so we declare a local
// extension type and access it via a narrowing function.
//
// `activeDocument` is the Obsidian-preferred document reference for popout
// window compatibility (real global set by Obsidian; mock sets it in tests).

declare const activeDocument: Document;

type ObsidianEl = HTMLElement & {
	createEl: (
		tag: string,
		opts?: {
			text?: string;
			cls?: string;
			attr?: Record<string, string>;
			href?: string;
		},
	) => ObsidianEl;
};

function asObs(el: HTMLElement): ObsidianEl {
	return el as ObsidianEl;
}

// ---------------------------------------------------------------------------
// section()
// ---------------------------------------------------------------------------

export interface SectionHandle {
	sectionEl: HTMLElement;
	bodyEl: HTMLElement;
}

export interface SectionOptions {
	/** When true, section starts collapsed. Default: false. */
	collapsed?: boolean;
	/** Item count to display in the header badge. */
	count?: number;
}

/**
 * Render a collapsible section with a labelled header and a body region.
 *
 * @param container  Parent element to append into.
 * @param label      Section heading text.
 * @param opts       Optional collapsed state and item count.
 * @returns          Handle with sectionEl and bodyEl.
 */
export function section(
	container: HTMLElement,
	label: string,
	opts: SectionOptions = {},
): SectionHandle {
	const collapsed = opts.collapsed ?? false;
	const obs = asObs(container);

	const sectionEl = obs.createEl("div", { cls: "sf-section" });

	// Header — role=button for keyboard/screen-reader access
	const headEl = asObs(sectionEl).createEl("div", { cls: "sf-sec-head" });
	headEl.setAttribute("role", "button");
	headEl.setAttribute("aria-expanded", collapsed ? "false" : "true");
	headEl.setAttribute("tabindex", "0");

	// Chevron indicator
	asObs(headEl).createEl("span", {
		cls: "sf-sec-chev",
		text: collapsed ? "▶" : "▼",
	});

	// Label text
	asObs(headEl).createEl("span", { cls: "sf-sec-label", text: label });

	// Count badge — only when count is provided
	if (opts.count !== undefined) {
		asObs(headEl).createEl("span", {
			cls: "sf-count",
			text: String(opts.count),
		});
	}

	// Body region
	const bodyEl = asObs(sectionEl).createEl("div", { cls: "sf-sec-body" });
	if (collapsed) {
		bodyEl.setAttribute("aria-hidden", "true");
		bodyEl.classList.add("sf-sec-body--collapsed");
	}

	return { sectionEl, bodyEl };
}

// ---------------------------------------------------------------------------
// factRow()
// ---------------------------------------------------------------------------

/**
 * Render a key/value fact row.
 *
 * @param container  Parent element to append into.
 * @param key        Field name label.
 * @param value      String text or an HTMLElement for complex values.
 * @returns          The row element.
 */
export function factRow(
	container: HTMLElement,
	key: string,
	value: string | HTMLElement,
): HTMLElement {
	const rowEl = asObs(container).createEl("div", { cls: "sf-frow" });

	asObs(rowEl).createEl("span", { cls: "sf-frow-k", text: key });

	if (typeof value === "string") {
		asObs(rowEl).createEl("span", { cls: "sf-frow-v", text: value });
	} else {
		rowEl.appendChild(value);
	}

	return rowEl;
}

// ---------------------------------------------------------------------------
// relationRow()
// ---------------------------------------------------------------------------

/**
 * Render a labelled relation row with stacked link elements.
 *
 * @param container  Parent element to append into.
 * @param label      Relation field name.
 * @param linkEls    Pre-built link elements (one per related entity).
 * @returns          The row element.
 */
export function relationRow(
	container: HTMLElement,
	label: string,
	linkEls: HTMLElement[],
): HTMLElement {
	const rowEl = asObs(container).createEl("div", { cls: "sf-rel" });

	asObs(rowEl).createEl("span", { cls: "sf-rel-k", text: label });

	const linksContainer = asObs(rowEl).createEl("div", { cls: "sf-rel-lnks" });
	for (const el of linkEls) {
		linksContainer.appendChild(el);
	}

	return rowEl;
}

// ---------------------------------------------------------------------------
// linkRow()
// ---------------------------------------------------------------------------

export interface LinkRowOptions {
	/** Optional trailing tag label (e.g. "pov", "char", kind name). */
	tag?: string;
	/**
	 * Optional target file path. When present, the link element carries a
	 * `data-sf-link` attribute so SidebarView's delegated body handler can
	 * resolve and route the click (T4.2). Unresolved links must NOT pass a path.
	 */
	path?: string;
	/** Optional click handler (link-click wiring; default: none). */
	onClick?: () => void;
}

/**
 * Build a `.sf-lrow-lnk` span carrying focus + role affordances and, when a
 * target `path` is given, a `data-sf-link` attribute for the delegated handler.
 * Shared stamping helper so every emission site produces identical markup (T4.2).
 */
export function stampLinkEl(text: string, path?: string): HTMLElement {
	const el = activeDocument.createElement("span");
	el.className = "sf-lrow-lnk";
	el.textContent = text;
	el.setAttribute("tabindex", "0");
	el.setAttribute("role", "link");
	if (path !== undefined) el.setAttribute("data-sf-link", path);
	return el;
}

/**
 * Render a focusable link row, optionally with a trailing tag.
 *
 * @param container  Parent element to append into.
 * @param text       Display text for the link.
 * @param opts       Optional tag and onClick callback.
 * @returns          The row element.
 */
export function linkRow(
	container: HTMLElement,
	text: string,
	opts: LinkRowOptions = {},
): HTMLElement {
	const rowEl = asObs(container).createEl("div", { cls: "sf-lrow" });

	// The link element — a span with role=link. When a target path is given it
	// carries data-sf-link so the delegated body handler routes the click (T4.2).
	const lnkEl = stampLinkEl(text, opts.path);
	rowEl.appendChild(lnkEl);

	if (opts.onClick) {
		const handler = opts.onClick;
		lnkEl.addEventListener("click", handler);
		lnkEl.addEventListener("keydown", (e: Event) => {
			const ke = e as KeyboardEvent;
			if (ke.key === "Enter" || ke.key === " ") handler();
		});
	}

	// Trailing tag badge
	if (opts.tag !== undefined) {
		asObs(rowEl).createEl("span", { cls: "sf-trail", text: opts.tag });
	}

	return rowEl;
}

// ---------------------------------------------------------------------------
// emptyLine()
// ---------------------------------------------------------------------------

/**
 * Render an empty-state placeholder line.
 *
 * @param container  Parent element to append into.
 * @param text       The placeholder message.
 * @returns          The element.
 */
export function emptyLine(
	container: HTMLElement,
	text: string,
): HTMLElement {
	return asObs(container).createEl("div", { cls: "sf-emptyline", text });
}

// ---------------------------------------------------------------------------
// unresolvedRow()
// ---------------------------------------------------------------------------

/**
 * Build an unresolved-link element without appending it to any container.
 * Useful when composing the element into a relation-link list (e.g. inside
 * a relationRow) rather than rendering it as a standalone row.
 *
 * The returned element is NOT clickable, aria-disabled="true".
 *
 * @param linkText  The original wikilink text that did not resolve.
 * @returns         The unresolved element (not yet in the DOM).
 */
export function unresolvedEl(linkText: string): HTMLElement {
	const el = activeDocument.createElement("div");
	el.className = "sf-unres";
	el.setAttribute("aria-disabled", "true");

	const glyph = activeDocument.createElement("span");
	glyph.className = "sf-unres-glyph";
	glyph.textContent = "⊘";
	el.appendChild(glyph);

	const text = activeDocument.createElement("span");
	text.className = "sf-unres-text";
	text.textContent = linkText;
	el.appendChild(text);

	const mark = activeDocument.createElement("span");
	mark.className = "sf-unres-mark";
	mark.textContent = "(Unresolved)";
	el.appendChild(mark);

	return el;
}

/**
 * Render an unresolved-link row into `container`. NOT clickable,
 * aria-disabled="true".
 *
 * Delegates to `unresolvedEl` so both the standalone-row and the
 * composable-element paths share a single implementation.
 *
 * @param container  Parent element to append into.
 * @param linkText   The original wikilink text that did not resolve.
 * @returns          The row element.
 */
export function unresolvedRow(
	container: HTMLElement,
	linkText: string,
): HTMLElement {
	const el = unresolvedEl(linkText);
	container.appendChild(el);
	return el;
}

// ---------------------------------------------------------------------------
// portraitTile()
// ---------------------------------------------------------------------------

/**
 * Render a portrait tile. Shows initials (monogram) when `image` is empty or
 * undefined; renders an `<img>` when `image` is a non-empty string.
 *
 * The element has `aria-label` set to `name` in all cases.
 * The `<img>` has `alt` set to `name`.
 *
 * @param container  Parent element to append into.
 * @param name       Character name — used for initials and aria-label/alt.
 * @param image      Optional image path/URL.
 * @returns          The tile element.
 */
export function portraitTile(
	container: HTMLElement,
	name: string,
	image?: string,
): HTMLElement {
	const tileEl = asObs(container).createEl("div", { cls: "sf-portrait" });
	tileEl.setAttribute("aria-label", name);

	if (image) {
		// Render an img element (activeDocument for popout window compat)
		const imgEl = activeDocument.createElement("img");
		imgEl.src = image;
		imgEl.alt = name;
		imgEl.className = "sf-portrait-img";
		tileEl.appendChild(imgEl);
	} else {
		// Monogram: initials from first letter(s) of name words
		const initials = nameToInitials(name);
		asObs(tileEl).createEl("span", { cls: "sf-portrait-mono", text: initials });
	}

	return tileEl;
}

/** Extract up to 2 uppercase initials from a name string. */
function nameToInitials(name: string): string {
	// split(/\s+/) on any string always produces at least one element ([""])
	// so the words.length === 0 guard is unreachable — single-element branch handles "".
	const words = name.trim().split(/\s+/);
	if (words.length === 1) return (words[0]![0] ?? "").toUpperCase();
	return ((words[0]![0] ?? "") + (words[1]![0] ?? "")).toUpperCase();
}

// ---------------------------------------------------------------------------
// imageTile()
// ---------------------------------------------------------------------------

/**
 * Render an image thumbnail tile. Returns null when `image` is empty or
 * undefined — callers must not render anything in that case.
 *
 * @param container  Parent element to append into (only when image is set).
 * @param image      Optional image path/URL.
 * @returns          The tile element, or null.
 */
export function imageTile(
	container: HTMLElement,
	image: string | undefined,
): HTMLElement | null {
	if (!image) return null;

	const tileEl = asObs(container).createEl("div", { cls: "sf-imgtile" });

	// Render an img element (activeDocument for popout window compat)
	const imgEl = activeDocument.createElement("img");
	imgEl.src = image;
	imgEl.alt = "";
	imgEl.className = "sf-imgtile-img";
	tileEl.appendChild(imgEl);

	return tileEl;
}
