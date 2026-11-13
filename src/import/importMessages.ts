/**
 * importMessages — what the vault import modal says (mockups-import.html L11f, R4, R6), kept out of
 * the modal so the wording sits in one table.
 *
 * Today's refusal sentences (`ImportError` messages from ViewImporter) are kept word for word; R6
 * adds one fix line under each. Two messages change: a DUPLICATE is refused inline with the path,
 * and a closed DataviewJS review is a neutral note.
 */

import type { Feedback, FixPart } from "catalog/browserList";
import { ImportError } from "import/ViewDefinition";
import type { ViewDefinition } from "import/ViewDefinition";
import { defaultSurfaces } from "store/types";

/** Shown under the action when an import fails for a reason that is not an ImportError. */
export const UNEXPECTED = "Import failed: unexpected error";

/** L11f(h): the DataviewJS review was closed. Not an error. */
export const CLOSED_REVIEW = "Not imported. You closed the review, so nothing was saved.";

/** The fix line for each refusal that has one (L11f table). Read and not-found errors have none. */
function fixFor(err: ImportError): FixPart[] | undefined {
	switch (err.code) {
		case "INVALID_BASE":
			// Not found / unreadable: the error is the fix.
			return err.detail === "base-invalid"
				? ["Add a ", { code: "views:" }, " list, ", { code: "filters:" }, " or ", { code: "formulas:" }, ", or open it in Bases to check it."]
				: undefined;
		case "NO_QUERY_BLOCK":
			return ["Add one ", { code: "```dataview" }, " or ", { code: "```dataviewjs" }, " block to the note."];
		case "MULTIPLE_QUERY_BLOCKS":
			return ["Keep one block, or split the note into one note per query."];
		case "ENGINE_MISMATCH":
			return ["Make ", { code: "sf-engine" }, " match the block, or remove ", { code: "sf-engine" }, ": the block's language decides."];
		case "INVALID_FRONTMATTER":
			if (err.detail === "sf-version") return ["Use a whole number, like ", { code: "sf-version: 1" }, "."];
			if (err.detail === "sf-name") return ["Give it a name, or remove ", { code: "sf-name" }, " to use the file name."];
			return undefined;
		case "DUPLICATE":
			return undefined;
	}
}

/**
 * A refusal as the modal shows it. `path` is the file the import was for. A DUPLICATE (a race:
 * imported from another window meanwhile) reads in Library terms; any other ImportError keeps its
 * text and gains its fix line; anything else is the generic message.
 */
export function refusalFor(err: unknown, path: string): Feedback {
	if (!(err instanceof ImportError)) return { text: UNEXPECTED, tone: "error" };
	if (err.code === "DUPLICATE") return { text: `Not imported: ${path} is already in Library › Collections.`, tone: "error" };
	const fix = fixFor(err);
	return { text: err.message, ...(fix !== undefined ? { fix } : {}), tone: "error" };
}

/** Where a new collection of `engine` shows by default (P2), in the words of the success line. */
function whereItShows(engine: ViewDefinition["engine"]): string {
	const surfaces = defaultSurfaces(engine);
	const names = [surfaces.anvil ? "the Anvil" : null, surfaces.workbench ? "the Workbench" : null].filter((n) => n !== null);
	return names.join(" and ");
}

/** L11f(i), R4: "Imported <name>. It is in Library › Collections and shows in the <Anvil | Workbench>." */
export function successText(def: ViewDefinition): string {
	const where = whereItShows(def.engine);
	const tail = where.length > 0 ? ` and shows in ${where}` : "";
	return `Imported ${def.name}. It is in Library › Collections${tail}.`;
}
