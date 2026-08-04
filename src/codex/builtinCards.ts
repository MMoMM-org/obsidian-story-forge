/**
 * builtinCards — the module-level `CardRegistry` with the three shipped Cards
 * registered (ADR-30, T4.2/T4.3), plus which ids count as "built-in" (T4.4).
 *
 * Extracted out of `codexTab.ts` at the start of T4.4 (a T4.3 review cleanup):
 * `codexTab.ts` was accreting markup building, collection defaults, selection
 * state AND registry construction, and this task adds the Card selector on
 * top of that. Registry construction has no dependency on the rest of
 * `codexTab.ts`, so it moves here first — the selector then lands in a file
 * that isn't already overfull.
 *
 * Module-level rather than per-render: registration happens once, the same
 * way `registerBasesView` must (`cardRegistry.ts`'s module doc) — Hero is the
 * default, so `resolve(undefined)` and `resolve("some-removed-id")` both
 * degrade to it, and the grid is never empty just because nothing has been
 * selected yet.
 *
 * @ref docs/XDD/specs/008-codex-surface/solution.md — ADR-30
 * @ref docs/XDD/specs/008-codex-surface/plan/phase-4.md — T4.3 review, T4.4 preconditions
 */

import { createCardRegistry, type CardRegistry } from "./cardRegistry";
import { heroCard } from "./cards/heroCard";
import { tableCard } from "./cards/tableCard";
import { compactCard } from "./cards/compactCard";

export const CODEX_CARD_REGISTRY: CardRegistry = createCardRegistry(heroCard);
CODEX_CARD_REGISTRY.register(tableCard);
CODEX_CARD_REGISTRY.register(compactCard);

/**
 * The ids that ship with the plugin. Everything else `CODEX_CARD_REGISTRY.list()`
 * returns is "Yours" in the selector (T4.4) — the split is derived by joining
 * against this set rather than by adding a `provenance` field to `CardRenderer`,
 * which T4.2 deliberately kept off the frozen contract.
 */
export const BUILT_IN_CARD_IDS: ReadonlySet<string> = new Set([
	heroCard.id,
	tableCard.id,
	compactCard.id,
]);
