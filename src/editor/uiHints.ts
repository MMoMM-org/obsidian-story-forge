/**
 * uiHints — the width rule (F6 / ADR-32).
 *
 * Column width is derived from a field's declared type alone; the only
 * presentation override is the `ui: "wide"` hint that lives in our own
 * `schema/*.json` (never in a FileClass file — ADR-32). Images no longer need
 * a hint at all: ADR-32 was revised so a `Media` field gets its width (and
 * its picker) from the *type*, exactly like every other control.
 *
 * @ref SDD/Implementation Examples — "the width rule (F6 / ADR-32)"
 * @ref ADR-0002 §3               — half width for Select/Number/Boolean/Date/Input;
 *                                   full width for Multi/MultiFile
 * @ref ADR-32 (revised 2026-07-29) — only `wide` remains; `Media` supplies its
 *                                     own full-width image control by type
 */

import type { FieldType } from "fileclass/fileClassTypes";

/**
 * Types that share a row (two-up) unless overridden by `ui: "wide"`.
 *
 * Counted from the generated FileClasses (`test/StoryForge/00 Meta/FileClasses/`,
 * the eight `schema/*.json` types): the seven types actually emitted are
 * Input (39x), Select (17x), Multi (10x), MultiFile (10x), Number (7x),
 * File (5x), Media (3x). Of those only Input, Select and Number share a row.
 */
const HALF: ReadonlySet<FieldType> = new Set([
	"Input",
	"Boolean",
	"Number",
	"Select",
	"Cycle",
	"Date",
	"Datetime",
	"Time",
]);

/**
 * Derive a field's column width from its type, with the one remaining
 * presentation override. `Multi`/`MultiFile`/`Media`/`MultiMedia`/`File` and
 * an unrecognised `Unknown` type all take the full row — a list-valued or
 * unrecognised field is never squeezed into a half column.
 */
export function widthOf(field: { type: FieldType; ui?: "wide" }): "half" | "full" {
	if (field.ui === "wide") return "full"; // the one remaining presentation hint
	return HALF.has(field.type) ? "half" : "full";
}
