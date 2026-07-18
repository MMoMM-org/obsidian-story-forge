/**
 * Self-tests for the faithful Obsidian Menu / MenuItem mock.
 *
 * The mock records addItem() / addSeparator() calls in order so a settings
 * ⋯ overflow menu can be unit-tested: tests read the ordered entries
 * (title / icon / disabled per item, plus separators) and invoke a chosen
 * item's recorded onClick.
 */

import { describe, it, expect, vi } from "vitest";
import { Menu } from "obsidian";

describe("Menu mock", () => {
	it("addItem captures title, icon, disabled and onClick in order across items", () => {
		const menu = new Menu();
		const onFirst = vi.fn();
		const onSecond = vi.fn();

		const returned = menu
			.addItem((item) => {
				item.setTitle("Rename").setIcon("pencil").onClick(onFirst);
			})
			.addItem((item) => {
				item.setTitle("Delete").setIcon("trash").setDisabled(true).onClick(onSecond);
			});

		// addItem is chainable (returns the menu).
		expect(returned).toBe(menu);

		const items = menu._items;
		expect(items).toHaveLength(2);

		const [first, second] = items;
		expect(first).toBeDefined();
		expect(second).toBeDefined();

		expect(first?.title).toBe("Rename");
		expect(first?.icon).toBe("pencil");
		expect(first?.disabled).toBe(false);
		expect(first?.onClickFn).toBe(onFirst);

		expect(second?.title).toBe("Delete");
		expect(second?.icon).toBe("trash");
		expect(second?.disabled).toBe(true);
		expect(second?.onClickFn).toBe(onSecond);
	});

	it("addSeparator records a separator in the correct position relative to items", () => {
		const menu = new Menu();
		menu
			.addItem((item) => item.setTitle("First"))
			.addSeparator()
			.addItem((item) => item.setTitle("Second"));

		expect(menu._entries).toHaveLength(3);
		expect(menu._entries[0]).toMatchObject({ kind: "item", title: "First" });
		expect(menu._entries[1]).toMatchObject({ kind: "separator" });
		expect(menu._entries[2]).toMatchObject({ kind: "item", title: "Second" });
	});

	it("invoking a captured item's onClick calls the registered fn", () => {
		const menu = new Menu();
		const handler = vi.fn();
		menu.addItem((item) => item.setTitle("Run").onClick(handler));

		const evt = new MouseEvent("click");
		const [entry] = menu._items;
		expect(entry).toBeDefined();
		entry?.onClickFn?.(evt);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith(evt);
	});

	it("showAtMouseEvent marks the menu shown and returns it (chainable)", () => {
		const menu = new Menu();
		expect(menu._shown).toBe(false);

		const evt = new MouseEvent("contextmenu");
		const returned = menu.showAtMouseEvent(evt);

		expect(returned).toBe(menu);
		expect(menu._shown).toBe(true);
	});

	it("showAtPosition also marks the menu shown and returns it (chainable)", () => {
		const menu = new Menu();
		const returned = menu.showAtPosition({ x: 10, y: 20 });

		expect(returned).toBe(menu);
		expect(menu._shown).toBe(true);
	});
});
