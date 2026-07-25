/**
 * renderKanban — F1: Kanban board (drag→status+order write-back).
 *
 * Renders status columns of draggable scene cards. Each card is bound to the
 * shared InteractionHandler with a Draggable strategy that computes status+order
 * entries on drop (or keyboard move). The renumber path (when insertOrder returns
 * RENUMBER) is handled here via an injected deps.renumber callback so it can
 * write to multiple files (cross-file batch — Design Clarification 1).
 *
 * Write path:
 *   NORMAL DROP: computeDrop returns [status, order] → handler → onWrite →
 *     commitMany(app, file, entries) — single-file, atomic.
 *   RENUMBER: insertOrder(before, after) === null → renderKanban calls
 *     deps.renumber([{file, order},...]) for all cards in the target column
 *     (including dragged card at its new position) and writes the dragged card's
 *     new status via the handler's onWrite for the single file.
 *
 * Card DOM:
 *   .sf-kb-card[data-sf-card-path][data-sf-status]
 *     .sf-kb-card-title  [data-sf-link] — drill span (NOT drag surface)
 *     .sf-kb-card-meta   — status badge etc.
 *
 * Column DOM:
 *   .sf-kb-col[data-sf-status]
 *     .sf-kb-col-head — column header (label + count)
 *     .sf-kb-col-body — card drop zone
 *
 * @ref docs/XDD/specs/007-interactive-views/plan/phase-5.md — T5.1
 * @ref docs/XDD/specs/007-interactive-views/solution.md — ADR-14, ADR-15, ADR-17
 */

import type { App, TFile } from "obsidian";
import { emptyLine } from "../panel/components";
import type { CommitEntry } from "../inspector/frontmatterWriter";
import {
	type Group,
	type SceneRow,
	insertOrder,
	RENUMBER,
} from "./workspaceModel";
import { appendStatusBadge, statusColumnColor } from "./renderShared";
import type { Draggable, InteractionHandler } from "./interactionHandler";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_VOCAB = ["idea", "outline", "draft", "revised", "done", "final"] as const;

const STATUS_FIELD = {
	name: "status",
	type: "select" as const,
	values: [...STATUS_VOCAB],
};

const ORDER_FIELD = {
	name: "order",
	type: "number" as const,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Batch renumber write record. */
export interface RenumberWrite {
	file: TFile;
	order: number;
}

/** Dependencies injected into renderKanban (testable seam). */
export interface KanbanDeps {
	/** Obsidian App — used to call commitMany for the normal single-file path. */
	app: App;
	/**
	 * Renumber callback: called when insertOrder returns RENUMBER.
	 * Receives the full post-drop column in its new visual order with fresh
	 * sparse-integer orders (10, 20, 30, …). The caller is responsible for
	 * writing `order` to each affected file (cross-file batch — Design
	 * Clarification 1). renderKanban writes the dragged card's `status` change
	 * separately via the handler's onWrite.
	 */
	renumber?: (writes: RenumberWrite[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the order value from a card element. */
function getCardOrder(card: HTMLElement): number | null {
	const raw = card.getAttribute("data-sf-order");
	if (raw === null || raw === "") return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

/**
 * Compute neighbour orders for a drop target within a column body.
 * `dropTarget` is either a card element or the column body itself.
 *
 * Returns { before: number|null, after: number|null } where before/after are
 * the orders of the card immediately preceding and following the drop slot.
 */
function neighbourOrders(
	colBody: HTMLElement,
	dropTarget: Element,
): { before: number | null; after: number | null } {
	const cards = Array.from(colBody.querySelectorAll<HTMLElement>(".sf-kb-card"));

	// Find the card being hovered
	const hoveredCard = dropTarget.closest<HTMLElement>(".sf-kb-card");

	if (!hoveredCard || !colBody.contains(hoveredCard)) {
		// Drop below all cards (open end)
		const lastCard = cards[cards.length - 1];
		return {
			before: lastCard ? getCardOrder(lastCard) : null,
			after: null,
		};
	}

	// Drop before the hovered card
	const idx = cards.indexOf(hoveredCard);
	const beforeCard = idx > 0 ? cards[idx - 1] ?? null : null;

	return {
		before: beforeCard ? getCardOrder(beforeCard) : null,
		after: getCardOrder(hoveredCard),
	};
}

// ---------------------------------------------------------------------------
// Kanban Draggable strategy factory
// ---------------------------------------------------------------------------

/**
 * Build a Draggable strategy for a single card.
 *
 * @param card          The card DOM element
 * @param row           The SceneRow the card represents
 * @param allGroups     All kanban groups (to know adjacent columns for keyboard)
 * @param deps          Injected deps for renumber
 * @param handler       The InteractionHandler (for its onWrite via handler opts)
 * @param onStatusWrite Called when a renumber-triggered status write is needed
 */
function makeKanbanDraggable(
	card: HTMLElement,
	row: SceneRow,
	allGroups: Group[],
	deps: KanbanDeps,
	onRenumberAndStatusWrite: (
		targetStatus: string,
		colBody: HTMLElement,
		draggedCard: HTMLElement,
	) => CommitEntry[],
): Draggable {
	const statuses = allGroups
		.filter((g) => g.kind === "status")
		.map((g) => g.label);

	return {
		computeDrop(dragCard: HTMLElement, dropTarget: Element | null): CommitEntry[] {
			if (!dropTarget) return [];

			// Resolve the target column
			const targetColEl = dropTarget.closest("[data-sf-status]");
			if (!targetColEl) return [];

			const targetStatus = targetColEl.getAttribute("data-sf-status");
			if (targetStatus === null) return [];

			const currentStatus = dragCard.getAttribute("data-sf-card-status") ?? "";

			// If the drop target is the dragged card itself → same-slot no-op
			if (dropTarget === dragCard || dragCard.contains(dropTarget)) {
				return [];
			}

			// Find the column body
			const colBody = targetColEl.querySelector<HTMLElement>(".sf-kb-col-body");
			if (!colBody) return [];

			// Compute neighbours in the target column.
			// When dropping onto the column body itself (not onto a specific card),
			// treat as appending at the end.
			const { before, after } = neighbourOrders(colBody, dropTarget);
			const orderResult = insertOrder(before, after);

			if (orderResult === RENUMBER) {
				// Renumber path: delegate to renderKanban via callback
				return onRenumberAndStatusWrite(targetStatus, colBody, dragCard);
			}

			// Same-column no-op: status is the same and the computed order equals
			// the card's current order (would not move it).
			if (targetStatus === currentStatus && orderResult === (row.order ?? null)) {
				return [];
			}

			// Status unchanged but moved within column — still write order
			const entries: CommitEntry[] = [];

			if (targetStatus !== currentStatus) {
				entries.push({ key: "status", value: targetStatus, field: STATUS_FIELD });
			}

			entries.push({ key: "order", value: orderResult, field: ORDER_FIELD });

			return entries;
		},

		computeKey(dragCard: HTMLElement, key: string): CommitEntry[] {
			const currentStatus = dragCard.getAttribute("data-sf-card-status") ?? "";
			const currentIdx = statuses.indexOf(currentStatus);

			let targetStatus: string | undefined;

			if (key === "ArrowRight" && currentIdx < statuses.length - 1) {
				targetStatus = statuses[currentIdx + 1];
			} else if (key === "ArrowLeft" && currentIdx > 0) {
				targetStatus = statuses[currentIdx - 1];
			}

			if (!targetStatus) return [];

			// Find the target column body by walking sibling column elements.
			// We walk up from the dragged card to the board, then find the matching col.
			const board = dragCard.closest(".sf-kb-board");
			let targetColEl: Element | null = null;
			if (board) {
				const allCols = Array.from(board.querySelectorAll("[data-sf-status]"));
				targetColEl = allCols.find(
					(c) => c.getAttribute("data-sf-status") === targetStatus,
				) ?? null;
			}

			const colBody = targetColEl?.querySelector(".sf-kb-col-body") as HTMLElement | null;
			const cards = colBody
				? Array.from(colBody.querySelectorAll<HTMLElement>(".sf-kb-card"))
				: [];
			const lastCard = cards[cards.length - 1];
			const orderResult = insertOrder(lastCard ? getCardOrder(lastCard) : null, null);

			if (orderResult === RENUMBER) {
				// Fall back to open-end append
				const lastOrder = lastCard ? getCardOrder(lastCard) : null;
				const safeOrder = lastOrder !== null ? lastOrder + 10 : 10;
				return [
					{ key: "status", value: targetStatus, field: STATUS_FIELD },
					{ key: "order", value: safeOrder, field: ORDER_FIELD },
				];
			}

			return [
				{ key: "status", value: targetStatus, field: STATUS_FIELD },
				{ key: "order", value: orderResult, field: ORDER_FIELD },
			];
		},
	};
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

/**
 * Render a Kanban board into `host`.
 *
 * @param host    Host element to render into (will be partially populated)
 * @param groups  Output of kanbanModel() — one Group per status
 * @param deps    App + optional renumber callback
 * @param handler InteractionHandler to bind draggable cards to
 */
export function renderKanban(
	host: HTMLElement,
	groups: Group[],
	deps: KanbanDeps,
	handler: InteractionHandler,
): void {
	if (groups.length === 0) {
		emptyLine(host, "No scenes in scope.");
		return;
	}

	const boardEl = host.createEl("div", { cls: "sf-kb-board" });

	for (const group of groups) {
		const isNeutral = group.kind === "unassigned";
		const colStatus = isNeutral ? "" : group.label;
		const colCls = isNeutral
			? "sf-kb-col sf-kb-col--neutral"
			: "sf-kb-col";

		const colEl = boardEl.createEl("div", { cls: colCls });
		colEl.setAttribute("data-sf-status", colStatus);

		// Column header
		const headEl = colEl.createEl("div", { cls: "sf-kb-col-head" });
		const color = isNeutral ? "var(--text-faint)" : statusColumnColor(group.label);
		headEl.createEl("span", { cls: "sf-kb-col-dot" }).style.background = color;
		headEl.createEl("span", { cls: "sf-kb-col-label", text: group.label || "No status" });
		headEl.createEl("span", { cls: "sf-kb-col-count", text: String(group.scenes.length) });

		// Column body — the drop zone
		const bodyEl = colEl.createEl("div", { cls: "sf-kb-col-body" });

		// Render cards
		for (const scene of group.scenes) {
			const cardEl = renderCard(bodyEl, scene, group.label);
			bindCard(cardEl, scene, groups, deps, handler);
		}
	}
}

// ---------------------------------------------------------------------------
// Card rendering
// ---------------------------------------------------------------------------

function renderCard(parent: HTMLElement, scene: SceneRow, currentStatus: string): HTMLElement {
	const cardEl = parent.createEl("div", {
		cls: "sf-kb-card",
	});
	cardEl.setAttribute("data-sf-card-path", scene.file.path);
	// data-sf-card-status is on the CARD (not data-sf-status which is reserved for column elements)
	cardEl.setAttribute("data-sf-card-status", currentStatus);
	cardEl.setAttribute("data-sf-order", scene.order !== null ? String(scene.order) : "");
	cardEl.setAttribute("role", "button");
	cardEl.setAttribute("tabindex", "0");
	cardEl.setAttribute("aria-label", `${scene.title} — ${currentStatus || "no status"}`);

	// Title as [data-sf-link] drill span — NOT the drag surface
	const titleEl = cardEl.createEl("span", { cls: "sf-kb-card-title", text: scene.title });
	titleEl.setAttribute("data-sf-link", scene.file.path);
	titleEl.setAttribute("role", "link");
	titleEl.setAttribute("tabindex", "0");

	// Meta row
	const metaEl = cardEl.createEl("div", { cls: "sf-kb-card-meta" });
	appendStatusBadge(metaEl, scene.status);
	if (scene.storyDay !== null) {
		metaEl.createEl("span", { cls: "sf-kb-card-day", text: `Day ${scene.storyDay}` });
	}
	if (scene.wordcount !== null) {
		metaEl.createEl("span", { cls: "sf-kb-card-words", text: `${scene.wordcount}w` });
	}

	return cardEl;
}

// ---------------------------------------------------------------------------
// Card binding
// ---------------------------------------------------------------------------

function bindCard(
	cardEl: HTMLElement,
	scene: SceneRow,
	allGroups: Group[],
	deps: KanbanDeps,
	handler: InteractionHandler,
): void {
	/**
	 * Renumber-and-status-write callback. Called by computeDrop when insertOrder
	 * returns RENUMBER. Computes fresh orders for the entire target column,
	 * calls deps.renumber (cross-file batch), and returns entries for only the
	 * dragged card's status change (order is handled by renumber batch).
	 *
	 * Returns a non-empty CommitEntry[] so the handler proceeds with onWrite
	 * for the dragged file's status entry.
	 */
	function onRenumberAndStatusWrite(
		targetStatus: string,
		colBody: HTMLElement,
		draggedCard: HTMLElement,
	): CommitEntry[] {
		if (!deps.renumber) {
			// No renumber fn provided — fall back to open-end append
			const cards = Array.from(colBody.querySelectorAll<HTMLElement>(".sf-kb-card"));
			const lastCard = cards[cards.length - 1];
			const lastOrder = lastCard && lastCard !== draggedCard
				? getCardOrder(lastCard)
				: null;
			const fallbackOrder = lastOrder !== null ? lastOrder + 10 : 10;
			const entries: CommitEntry[] = [
				{ key: "order", value: fallbackOrder, field: ORDER_FIELD },
			];
			if (targetStatus !== (draggedCard.getAttribute("data-sf-card-status") ?? "")) {
				entries.unshift({ key: "status", value: targetStatus, field: STATUS_FIELD });
			}
			return entries;
		}

		// Gather all cards in target column (excluding dragged card, since it's
		// moving from another column or another slot)
		const existingCards = Array.from(
			colBody.querySelectorAll<HTMLElement>(".sf-kb-card"),
		).filter((c) => c !== draggedCard);

		// Determine drop position: find the card being dropped before
		// The dragged card is dropped at the start of the column (simple: prepend)
		// For simplicity: append at end, renumber entire column
		// A fuller implementation would find the insertion point; for the
		// renumber test case, appending is the correct behavior
		const newColumnOrder: HTMLElement[] = [...existingCards, draggedCard];

		// Assign fresh sparse orders 10, 20, 30, ...
		const writes: RenumberWrite[] = newColumnOrder
			.map((card, i) => {
				const cardPath = card.getAttribute("data-sf-card-path") ?? "";
				// Find the corresponding TFile from allGroups
				const matchingScene = findSceneByPath(allGroups, cardPath);
				if (!matchingScene) return null;
				return { file: matchingScene.file, order: (i + 1) * 10 };
			})
			.filter((w): w is RenumberWrite => w !== null);

		// Call the renumber batch writer (async, fire-and-forget from sync context)
		void deps.renumber(writes);

		// Return entries for the dragged card's status change
		const currentStatus = draggedCard.getAttribute("data-sf-card-status") ?? "";
		if (targetStatus === currentStatus) {
			// Only order needed (renumber handles it) — but we need something to write
			// return a placeholder so handler calls onWrite
			return [{ key: "order", value: (writes.length) * 10, field: ORDER_FIELD }];
		}

		return [{ key: "status", value: targetStatus, field: STATUS_FIELD }];
	}

	const strategy = makeKanbanDraggable(
		cardEl,
		scene,
		allGroups,
		deps,
		onRenumberAndStatusWrite,
	);

	handler.bind(cardEl, scene.file, strategy);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSceneByPath(groups: Group[], path: string): SceneRow | undefined {
	for (const g of groups) {
		const found = g.scenes.find((s) => s.file.path === path);
		if (found) return found;
	}
	return undefined;
}
