/**
 * Sentence-case checker over rendered settings text, shared by the Library tests (T7.1b, T7.1c).
 * The lint rule covers source literals; this covers what is actually painted.
 */

/** Words that are proper nouns or UI terms the mockup writes capitalised mid-sentence. */
const PROPER = new Set([
	"Anvil", "Workbench", "Bases", "Dataview", "DataviewJS", "Scope", "Obsidian",
	"Library", "Browse", "Card", "Hero", "Codex", "FileClass", "FileClasses", "Meta", "Story", "Forge",
]);

/** Capitalised words that are not at the start of a sentence and not allowed. */
export function sentenceCaseViolations(raw: string, labels: readonly string[]): string[] {
	if (raw.trim().startsWith("+")) return [];
	let s = raw;
	for (const label of labels) s = s.split(label).join("");
	const words = s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
	const bad: string[] = [];
	words.forEach((word, i) => {
		const atStart = i === 0 || /[.?!:]$/.test(words[i - 1] ?? "");
		const bare = word.replace(/[^A-Za-z]/g, "");
		if (atStart || !/^[A-Z][a-z]/.test(bare) || PROPER.has(bare)) return;
		bad.push(word);
	});
	return bad;
}

/** Own text of every visible element, minus user data (row names, paths, code, a previewed note) and the plugin header. */
export function visibleStrings(root: HTMLElement): string[] {
	const skip = ".sf-settings-header, .sf-lb-name, .sf-lb-file, .sf-lb-prev-body, code, input";
	return [...root.querySelectorAll<HTMLElement>("*")]
		.filter((el) => !el.closest(skip))
		.map((el) => [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join(" ").trim())
		.filter((t) => t.length > 0);
}
