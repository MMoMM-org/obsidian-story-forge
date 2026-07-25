/**
 * timelineZoom — ephemeral CSS zoom/pan controller for the Timeline rail (T4.3).
 *
 * Wraps the rail in a scroll container (`sf-zoom-wrap`) containing a scale wrapper
 * (`sf-zoom-scaled`) whose `--sf-zoom` CSS custom property drives the transform.
 * A control bar (`sf-zoom-bar`) with −/reset/+ buttons and a label is prepended.
 *
 * State lives in-memory only (a fresh createTimelineZoom() starts at 1x).
 * Writes nothing. Does not import interactionHandler (ADR-21, CON-1).
 *
 * Listeners use plain addEventListener and are removed by the returned `teardown()`.
 * The host wires `teardown` from WorkspaceView.onClose in Phase 6.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-4.md — T4.3
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-21
 */

/** Minimum zoom scale (10%). */
export const ZOOM_MIN = 0.25;
/** Maximum zoom scale (300%). */
export const ZOOM_MAX = 3.0;
/** Zoom step per button click or wheel tick. */
export const ZOOM_STEP = 0.1;

export interface TimelineZoomHandle {
	/** The outer scroll wrapper — attach wheel listener target. */
	wrapEl: HTMLElement;
	/** The inner scaled element — put rail content inside here. */
	scaledEl: HTMLElement;
	/** Zoom in by one ZOOM_STEP. */
	zoomIn: () => void;
	/** Zoom out by one ZOOM_STEP. */
	zoomOut: () => void;
	/** Reset zoom to 1x. */
	zoomReset: () => void;
	/** Remove all listeners registered by this controller. */
	teardown: () => void;
}

/**
 * Build the zoom wrapper structure inside `container` and return handles for
 * programmatic control and teardown.
 *
 * DOM structure appended to `container`:
 * ```
 * .sf-zoom-bar          (control bar)
 *   .sf-zoom-btn        (zoom out −)
 *   .sf-zoom-label      (e.g. "100%")
 *   .sf-zoom-btn        (reset ⊙)
 *   .sf-zoom-btn        (zoom in +)
 * .sf-zoom-wrap         (scroll container)
 *   .sf-zoom-scaled     (CSS-scaled inner; put rail here)
 * ```
 */
export function createTimelineZoom(container: HTMLElement): TimelineZoomHandle {
	let zoom = 1;

	// --- Build DOM ---
	const bar = container.createEl("div", { cls: "sf-zoom-bar" });
	const btnOut = bar.createEl("button", { cls: "sf-zoom-btn", text: "−" });
	btnOut.setAttribute("aria-label", "Zoom out");
	btnOut.setAttribute("type", "button");

	const label = bar.createEl("span", { cls: "sf-zoom-label", text: "100%" });

	const btnReset = bar.createEl("button", { cls: "sf-zoom-btn", text: "⊙" });
	btnReset.setAttribute("aria-label", "Reset zoom");
	btnReset.setAttribute("type", "button");

	const btnIn = bar.createEl("button", { cls: "sf-zoom-btn", text: "+" });
	btnIn.setAttribute("aria-label", "Zoom in");
	btnIn.setAttribute("type", "button");

	const wrapEl = container.createEl("div", { cls: "sf-zoom-wrap" });
	const scaledEl = wrapEl.createEl("div", { cls: "sf-zoom-scaled" });

	// --- Zoom state ---
	function applyZoom(): void {
		scaledEl.style.setProperty("--sf-zoom", String(zoom));
		scaledEl.style.transform = `scale(${zoom})`;
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

	// --- Button listeners ---
	function onBtnIn(): void {
		zoomIn();
	}
	function onBtnOut(): void {
		zoomOut();
	}
	function onBtnReset(): void {
		zoomReset();
	}

	btnIn.addEventListener("click", onBtnIn);
	btnOut.addEventListener("click", onBtnOut);
	btnReset.addEventListener("click", onBtnReset);

	// --- Wheel listener: only modifier+wheel zooms; plain wheel scrolls normally ---
	function onWheel(e: WheelEvent): void {
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		if (e.deltaY < 0) {
			zoomIn();
		} else {
			zoomOut();
		}
	}

	wrapEl.addEventListener("wheel", onWheel, { passive: false });

	function teardown(): void {
		btnIn.removeEventListener("click", onBtnIn);
		btnOut.removeEventListener("click", onBtnOut);
		btnReset.removeEventListener("click", onBtnReset);
		wrapEl.removeEventListener("wheel", onWheel);
	}

	return { wrapEl, scaledEl, zoomIn, zoomOut, zoomReset, teardown };
}
