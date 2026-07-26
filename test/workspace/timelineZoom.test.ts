/**
 * timelineZoom.test.ts — ephemeral zoom controller for the Timeline body (T4.3, M6 split API).
 *
 * Split API: controls (`.sf-zoom-bar`) mount in `controlsHost`; the scaled body
 * (`.sf-zoom-wrap > .sf-zoom-scaled`) mounts in `scaledHost`. The two can live in
 * different parents (toolbar vs. body). Tests: zoom in/out within caps, clamp at
 * min/max, wheel with modifier zooms (plain wheel does not), links still present
 * post-zoom, reset to 1x, no persistence side effects, Component-owned teardown.
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

describe("createTimelineZoom (split controls/scaled API)", () => {
	let controlsHost: HTMLElement;
	let scaledHost: HTMLElement;
	let component: Component;

	beforeEach(() => {
		controlsHost = host();
		scaledHost = host();
		component = new Component();
	});

	function zoom(): ReturnType<typeof createTimelineZoom> {
		return createTimelineZoom(component, { controlsHost, scaledHost });
	}

	it("exports ZOOM_MIN, ZOOM_MAX, ZOOM_STEP constants", () => {
		expect(typeof ZOOM_MIN).toBe("number");
		expect(typeof ZOOM_MAX).toBe("number");
		expect(typeof ZOOM_STEP).toBe("number");
		expect(ZOOM_MIN).toBeLessThan(1);
		expect(ZOOM_MAX).toBeGreaterThan(1);
	});

	it("mounts controls in controlsHost and scaled body in scaledHost", () => {
		const result = zoom();
		expect(result.controlsEl).toBeInstanceOf(HTMLElement);
		expect(result.scaledEl).toBeInstanceOf(HTMLElement);
		// Controls live under controlsHost only.
		expect(controlsHost.querySelector(".sf-zoom-bar")).not.toBeNull();
		expect(scaledHost.querySelector(".sf-zoom-bar")).toBeNull();
		// Scaled body lives under scaledHost only.
		expect(scaledHost.querySelector(".sf-zoom-scaled")).not.toBeNull();
		expect(controlsHost.querySelector(".sf-zoom-scaled")).toBeNull();
		expect(typeof result.teardown).toBe("function");
	});

	it("starts at 1x zoom (no scaling)", () => {
		const { scaledEl } = zoom();
		const style = scaledEl.style.getPropertyValue("--sf-zoom");
		expect(style === "" || style === "1").toBe(true);
	});

	it("zoom in button increases the zoom level", () => {
		const { scaledEl, zoomIn } = zoom();
		zoomIn();
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeGreaterThan(1);
	});

	it("zoom out button decreases the zoom level", () => {
		const { scaledEl, zoomOut } = zoom();
		zoomOut();
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeLessThan(1);
	});

	it("reset button returns zoom to 1x", () => {
		const { scaledEl, zoomIn, zoomReset } = zoom();
		zoomIn();
		zoomIn();
		zoomReset();
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBe(1);
	});

	it("zoom clamps at ZOOM_MAX — further zoom in has no effect", () => {
		const { scaledEl, zoomIn } = zoom();
		for (let i = 0; i < 50; i++) zoomIn();
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeLessThanOrEqual(ZOOM_MAX + 0.001);
		zoomIn();
		const val2 = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val2).toBeLessThanOrEqual(ZOOM_MAX + 0.001);
	});

	it("zoom clamps at ZOOM_MIN — further zoom out has no effect", () => {
		const { scaledEl, zoomOut } = zoom();
		for (let i = 0; i < 50; i++) zoomOut();
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeGreaterThanOrEqual(ZOOM_MIN - 0.001);
		zoomOut();
		const val2 = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val2).toBeGreaterThanOrEqual(ZOOM_MIN - 0.001);
	});

	it("modifier+wheel zooms in (deltaY < 0 = scroll up = zoom in)", () => {
		const { scaledEl, wrapEl } = zoom();
		wrapEl.dispatchEvent(makeWheel({ deltaY: -100, ctrlKey: true }));
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeGreaterThan(1);
	});

	it("modifier+wheel zooms out (deltaY > 0 = scroll down = zoom out)", () => {
		const { scaledEl, wrapEl } = zoom();
		wrapEl.dispatchEvent(makeWheel({ deltaY: 100, ctrlKey: true }));
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeLessThan(1);
	});

	it("metaKey+wheel also zooms (Cmd on macOS)", () => {
		const { scaledEl, wrapEl } = zoom();
		wrapEl.dispatchEvent(makeWheel({ deltaY: -100, metaKey: true }));
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBeGreaterThan(1);
	});

	it("plain wheel (no modifier) does NOT zoom", () => {
		const { scaledEl, wrapEl } = zoom();
		wrapEl.dispatchEvent(makeWheel({ deltaY: -100 }));
		const val = parseFloat(scaledEl.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBe(1);
	});

	it("data-sf-link drill spans remain present at every zoom level", () => {
		const { scaledEl, zoomIn } = zoom();
		const link = scaledEl.createEl("span", { text: "Scene A" });
		link.setAttribute("data-sf-link", "SceneA.md");
		zoomIn();
		zoomIn();
		const found = scaledEl.querySelector("[data-sf-link]");
		expect(found).not.toBeNull();
		expect(found!.getAttribute("data-sf-link")).toBe("SceneA.md");
	});

	it("component.unload() removes wheel listener (CON-4 — Component owns cleanup)", () => {
		const { wrapEl } = zoom();
		const preventSpy = vi.spyOn(WheelEvent.prototype, "preventDefault");
		wrapEl.dispatchEvent(makeWheel({ deltaY: -100, ctrlKey: true }));
		expect(preventSpy).toHaveBeenCalled();
		preventSpy.mockRestore();

		component.unload();

		const preventSpy2 = vi.spyOn(WheelEvent.prototype, "preventDefault");
		wrapEl.dispatchEvent(makeWheel({ deltaY: -100, ctrlKey: true }));
		expect(preventSpy2).not.toHaveBeenCalled();
		preventSpy2.mockRestore();
	});

	it("teardown() is a no-op (Component lifecycle owns cleanup; call-site compat)", () => {
		const { teardown } = zoom();
		expect(() => teardown()).not.toThrow();
	});

	it("state is ephemeral: a fresh createTimelineZoom starts at 1x regardless of prior state", () => {
		const { zoomIn } = zoom();
		zoomIn();
		zoomIn();
		const controlsHost2 = host();
		const scaledHost2 = host();
		const component2 = new Component();
		const { scaledEl: s2 } = createTimelineZoom(component2, {
			controlsHost: controlsHost2,
			scaledHost: scaledHost2,
		});
		const val = parseFloat(s2.style.getPropertyValue("--sf-zoom") || "1");
		expect(val).toBe(1);
	});

	it("renders a zoom control bar (sf-zoom-bar) with buttons inside controlsHost", () => {
		zoom();
		const bar = controlsHost.querySelector(".sf-zoom-bar");
		expect(bar).not.toBeNull();
		const btns = bar!.querySelectorAll(".sf-zoom-btn");
		expect(btns.length).toBeGreaterThanOrEqual(3); // −, reset, +
	});

	it("zoom label updates to reflect current zoom level", () => {
		const { zoomIn } = zoom();
		zoomIn();
		const label = controlsHost.querySelector(".sf-zoom-label");
		expect(label).not.toBeNull();
		expect(label!.textContent).not.toBe("100%");
	});
});
