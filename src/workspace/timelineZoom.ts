/**
 * timelineZoom — ephemeral CSS zoom controller for the Timeline body (M6, mockup M1).
 *
 * Split API (M6 rework): the CONTROLS bar and the SCALED body are separable so the
 * AnvilView can place the −/label/+ buttons in the toolbar row while the timeline
 * body (rail or swimlane) lives in the main body under the scaled wrapper.
 *
 * `createTimelineZoom(component, { controlsHost, scaledHost })`:
 *  - builds a `.sf-zoom-bar` (−, label, reset, +) inside `controlsHost`,
 *  - builds a `.sf-zoom-wrap > .sf-zoom-scaled` inside `scaledHost`,
 *  - returns handles (`controlsEl`, `wrapEl`, `scaledEl`, zoomIn/out/reset, teardown).
 *
 * The `--sf-zoom` CSS custom property + `transform: scale()` on `.sf-zoom-scaled`
 * drives the visual zoom. State lives in-memory only (a fresh controller starts at 1x).
 * Writes nothing. Does not import interactionHandler (ADR-21, CON-1).
 *
 * Listeners are registered via `component.registerDomEvent` (CON-4). Cleanup is owned
 * by the Component lifecycle — AnvilView (a Component) passes `this`; on unload all
 * listeners detach automatically.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-4.md — T4.3
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-21
 */

/** Minimum zoom scale (25%). */
export const ZOOM_MIN = 0.25;
/** Maximum zoom scale (300%). */
export const ZOOM_MAX = 3.0;
/** Zoom step per button click or wheel tick. */
export const ZOOM_STEP = 0.1;

/**
 * Minimal delegate interface for Component-based listener registration (CON-4).
 * The real Obsidian `Component` satisfies this; tests pass a mock Component.
 * Using a structural interface avoids importing `Component` from "obsidian" in
 * a module that must remain free of Obsidian runtime dependencies (ADR-21).
 */
export interface ZoomComponentDelegate {
	registerDomEvent<K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void;
}

/** Where the zoom controller mounts its two separable pieces. */
export interface TimelineZoomHosts {
	/** Parent for the `.sf-zoom-bar` controls (e.g. the toolbar row). */
	controlsHost: HTMLElement;
	/** Parent for the `.sf-zoom-wrap > .sf-zoom-scaled` body (e.g. the main body). */
	scaledHost: HTMLElement;
}

export interface TimelineZoomHandle {
	/** The controls bar (buttons + label) — lives in the toolbar. */
	controlsEl: HTMLElement;
	/** The outer scroll wrapper — wheel listener target. */
	wrapEl: HTMLElement;
	/** The inner scaled element — put timeline body content inside here. */
	scaledEl: HTMLElement;
	/** Zoom in by one ZOOM_STEP. */
	zoomIn: () => void;
	/** Zoom out by one ZOOM_STEP. */
	zoomOut: () => void;
	/** Reset zoom to 1x. */
	zoomReset: () => void;
	/**
	 * No-op. Cleanup is now owned by the Component lifecycle (CON-4).
	 * Kept for call-site compatibility; the Component's unload detaches listeners.
	 */
	teardown: () => void;
}

/**
 * Build the split zoom structure and return handles for programmatic control.
 * All DOM listeners are registered via `component` (CON-4); the Component lifecycle
 * owns cleanup — no manual teardown required.
 *
 * DOM appended:
 * ```
 * controlsHost:
 *   .sf-zoom-bar          (control bar — sits in the toolbar row)
 *     .sf-zoom-btn        (zoom out −)
 *     .sf-zoom-label      ("100%")
 *     .sf-zoom-btn        (reset ⊙)
 *     .sf-zoom-btn        (zoom in +)
 * scaledHost:
 *   .sf-zoom-wrap         (scroll container)
 *     .sf-zoom-scaled     (CSS-scaled inner; put timeline body here)
 * ```
 */
export function createTimelineZoom(
	component: ZoomComponentDelegate,
	hosts: TimelineZoomHosts,
): TimelineZoomHandle {
	let zoom = 1;

	// --- Build controls (in the toolbar) ---
	const controlsEl = hosts.controlsHost.createDiv({ cls: "sf-zoom-bar" });
	const btnOut = controlsEl.createEl("button", { cls: "sf-zoom-btn", text: "−" });
	btnOut.setAttribute("aria-label", "Zoom out");
	btnOut.setAttribute("type", "button");

	const label = controlsEl.createSpan({ cls: "sf-zoom-label", text: "100%" });

	const btnReset = controlsEl.createEl("button", { cls: "sf-zoom-btn", text: "⊙" });
	btnReset.setAttribute("aria-label", "Reset zoom");
	btnReset.setAttribute("type", "button");

	const btnIn = controlsEl.createEl("button", { cls: "sf-zoom-btn", text: "+" });
	btnIn.setAttribute("aria-label", "Zoom in");
	btnIn.setAttribute("type", "button");

	// --- Build scaled body (in the main body) ---
	const wrapEl = hosts.scaledHost.createDiv({ cls: "sf-zoom-wrap" });
	const scaledEl = wrapEl.createDiv({ cls: "sf-zoom-scaled" });

	// --- Zoom state ---
	function applyZoom(): void {
		// styles.css applies the scale from --sf-zoom (#49).
		scaledEl.setCssProps({ "--sf-zoom": String(zoom) });
		label.textContent = `${Math.round(zoom * 100)}%`;
	}

	function zoomIn(): void {
		zoom = Math.min(ZOOM_MAX, parseFloat((zoom + ZOOM_STEP).toFixed(10)));
		applyZoom();
	}

	function zoomOut(): void {
		zoom = Math.max(ZOOM_MIN, parseFloat((zoom - ZOOM_STEP).toFixed(10)));
		applyZoom();
	}

	function zoomReset(): void {
		zoom = 1;
		applyZoom();
	}

	// --- Button listeners (CON-4: registered via component, not plain addEventListener) ---
	component.registerDomEvent(btnIn, "click", () => { zoomIn(); });
	component.registerDomEvent(btnOut, "click", () => { zoomOut(); });
	component.registerDomEvent(btnReset, "click", () => { zoomReset(); });

	// --- Wheel listener: only modifier+wheel zooms; plain wheel scrolls normally ---
	component.registerDomEvent(wrapEl, "wheel", (e: WheelEvent) => {
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		if (e.deltaY < 0) {
			zoomIn();
		} else {
			zoomOut();
		}
	}, { passive: false });

	// Cleanup is owned by the Component lifecycle (CON-4). teardown() is kept as
	// a no-op for call-site compatibility; component.unload() does the real work.
	function teardown(): void { /* no-op — Component lifecycle owns cleanup */ }

	return { controlsEl, wrapEl, scaledEl, zoomIn, zoomOut, zoomReset, teardown };
}
