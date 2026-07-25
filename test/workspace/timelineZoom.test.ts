/**
 * timelineZoom.test.ts — ephemeral zoom/pan controller for the Timeline rail (T4.3).
 *
 * Tests: zoom in/out within caps, clamp at min/max, wheel with modifier zooms
 * (plain wheel does not), links still present post-zoom, reset to 1x,
 * no persistence side effects, teardown removes listeners.
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-4.md — T4.3
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-21
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { augmentEl, Component } from "../__mocks__/obsidian";
import { createTimelineZoom, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "workspace/timelineZoom";

function host(): HTMLElement {
	return augmentEl(document.createElement("div"));
}

function makeWheel(opts: { deltaY: number; ctrlKey?: boolean; metaKey?: boolean }): WheelEvent {
	return new WheelEvent("wheel", {
		deltaY: opts.deltaY,
		ctrlKey: opts.ctrlKey ?? false,
		metaKey: opts.metaKey ?? false,
		bubbles: true,
		cancelable: true,
	});
}

describe("createTimelineZoom", () => {
	let container: HTMLElement;
	let component: Component;

	beforeEach(() => {
		container = host();
		component = new Component();
	});

	it("exports ZOOM_MIN, ZOOM_MAX, ZOOM_STEP constants", () => {
		expect(typeof ZOOM_MIN).toBe("number");
		expect(typeof ZOOM_MAX).toBe("number");
		expect(typeof ZOOM_STEP).toBe("number");
		expect(ZOOM_MIN).toBeLessThan(1);
		expect(ZOOM_MAX).toBeGreaterThan(1);
	});

	it("returns a zoom wrapper element and a teardown function", () => {
		const result = createTimelineZoom(container, component);
		expect(result.scaledEl).toBeInstanceOf(HTMLElement);
		expect(typeof result.teardown).toBe("function");
	});

	it("starts at 1x zoom (no scaling)", () => {
		const { scaledEl } = createTimelineZoom(container, component);
		const style = scaledEl.style.getPropertyValue("--sf-zoom");
		// Either the property is absent (defaults to 1) or explicitly "1"
		expect(style === "" || style === "1").toBe(true);
	});

	it("zoom in button increases the zoom level", () => {
		const { scaledEl, zoomIn } = createTimelineZoom(container, component);
		zoomIn();
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeGreaterThan(1);
	});

	it("zoom out button decreases the zoom level", () => {
		const { scaledEl, zoomOut } = createTimelineZoom(container, component);
		zoomOut();
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeLessThan(1);
	});

	it("reset button returns zoom to 1x", () => {
		const { scaledEl, zoomIn, zoomReset } = createTimelineZoom(container, component);
		zoomIn();
		zoomIn();
		zoomReset();
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBe(1);
	});

	it("zoom clamps at ZOOM_MAX — further zoom in has no effect", () => {
		const { scaledEl, zoomIn } = createTimelineZoom(container, component);
		for (let i = 0; i < 50; i++) zoomIn();
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeLessThanOrEqual(ZOOM_MAX + 0.001);
		// A second call past max still clamps
		zoomIn();
		const val2 = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val2).toBeLessThanOrEqual(ZOOM_MAX + 0.001);
	});

	it("zoom clamps at ZOOM_MIN — further zoom out has no effect", () => {
		const { scaledEl, zoomOut } = createTimelineZoom(container, component);
		for (let i = 0; i < 50; i++) zoomOut();
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeGreaterThanOrEqual(ZOOM_MIN - 0.001);
		zoomOut();
		const val2 = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val2).toBeGreaterThanOrEqual(ZOOM_MIN - 0.001);
	});

	it("modifier+wheel zooms in (deltaY < 0 = scroll up = zoom in)", () => {
		const { scaledEl, wrapEl } = createTimelineZoom(container, component);
		const evt = makeWheel({ deltaY: -100, ctrlKey: true });
		wrapEl.dispatchEvent(evt);
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeGreaterThan(1);
	});

	it("modifier+wheel zooms out (deltaY > 0 = scroll down = zoom out)", () => {
		const { scaledEl, wrapEl } = createTimelineZoom(container, component);
		const evt = makeWheel({ deltaY: 100, ctrlKey: true });
		wrapEl.dispatchEvent(evt);
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeLessThan(1);
	});

	it("metaKey+wheel also zooms (Cmd on macOS)", () => {
		const { scaledEl, wrapEl } = createTimelineZoom(container, component);
		const evt = makeWheel({ deltaY: -100, metaKey: true });
		wrapEl.dispatchEvent(evt);
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeGreaterThan(1);
	});

	it("plain wheel (no modifier) does NOT zoom", () => {
		const { scaledEl, wrapEl } = createTimelineZoom(container, component);
		const evt = makeWheel({ deltaY: -100 });
		wrapEl.dispatchEvent(evt);
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBe(1);
	});

	it("data-sf-link drill spans remain present at every zoom level", () => {
		const { scaledEl, zoomIn } = createTimelineZoom(container, component);
		// Add a link inside the scaled content area
		const link = scaledEl.createEl("span", { text: "Scene A" });
		link.setAttribute("data-sf-link", "SceneA.md");
		zoomIn();
		zoomIn();
		const found = scaledEl.querySelector("[data-sf-link]");
		expect(found).not.toBeNull();
		expect(found!.getAttribute("data-sf-link")).toBe("SceneA.md");
	});

	it("component.unload() removes wheel listener (CON-4 — Component owns cleanup)", () => {
		const { wrapEl } = createTimelineZoom(container, component);
		// Before unload: ctrlKey wheel zooms (preventDefault called)
		const preventSpy = vi.spyOn(WheelEvent.prototype, "preventDefault");
		const evtBefore = makeWheel({ deltaY: -100, ctrlKey: true });
		wrapEl.dispatchEvent(evtBefore);
		expect(preventSpy).toHaveBeenCalled();
		preventSpy.mockRestore();

		// Unload via Component lifecycle — detaches all registered listeners
		component.unload();

		// After unload: ctrl+wheel must NOT call preventDefault (listener gone)
		const preventSpy2 = vi.spyOn(WheelEvent.prototype, "preventDefault");
		const evtAfter = makeWheel({ deltaY: -100, ctrlKey: true });
		wrapEl.dispatchEvent(evtAfter);
		expect(preventSpy2).not.toHaveBeenCalled();
		preventSpy2.mockRestore();
	});

	it("teardown() is a no-op (Component lifecycle owns cleanup; call-site compat)", () => {
		const { teardown } = createTimelineZoom(container, component);
		// teardown() must not throw and must not break subsequent Component.unload()
		expect(() => teardown()).not.toThrow();
	});

	it("state is ephemeral: a fresh createTimelineZoom starts at 1x regardless of prior state", () => {
		const { zoomIn } = createTimelineZoom(container, component);
		zoomIn();
		zoomIn();
		// A brand-new zoom controller on a fresh container starts at 1x
		const container2 = host();
		const component2 = new Component();
		const { scaledEl: s2 } = createTimelineZoom(container2, component2);
		const val = parseFloat(s2.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBe(1);
	});

	it("renders a zoom control bar (sf-zoom-bar) with buttons inside the container", () => {
		createTimelineZoom(container, component);
		const bar = container.querySelector(".sf-zoom-bar");
		expect(bar).not.toBeNull();
		const btns = bar!.querySelectorAll(".sf-zoom-btn");
		expect(btns.length).toBeGreaterThanOrEqual(3); // −, reset, +
	});

	it("zoom label updates to reflect current zoom level", () => {
		const { zoomIn } = createTimelineZoom(container, component);
		zoomIn();
		const label = container.querySelector(".sf-zoom-label");
		expect(label).not.toBeNull();
		// After zoom in, label should not say "100%"
		expect(label!.textContent).not.toBe("100%");
	});
});
