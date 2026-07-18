// schema-types-json — derive Obsidian's vault-wide property→widget-type registry
// (.obsidian/types.json) from the canonical schema/*.json. Shared by schema-gen
// (merge-write) and schema-check (drift gate). Mapping per the _forge handoff
// `types-json-artifact.md` + rulings Q2 (exclude `tags`) and Q3 (plain lists →
// multitext). types.json stores only the WIDGET type — never enum values.

// Names Obsidian fixes regardless of the schema field type (a `list`-typed
// `aliases` must still be the special aliases widget).
export const RESERVED = { aliases: 'aliases', cssclasses: 'multitext' };

// Valid Obsidian native widget types — nothing else may be emitted.
export const VALID_NATIVE = new Set([
  'text', 'number', 'checkbox', 'date', 'datetime', 'multitext', 'tags', 'aliases',
]);

/** StoryForge schema field `type` → Obsidian native widget type (reserved names win). */
export function nativeType(f) {
  if (RESERVED[f.name]) return RESERVED[f.name];
  switch (f.type) {
    case 'number': return 'number';
    case 'boolean': return 'checkbox';
    case 'list': return 'multitext'; // relation/query lists AND plain author lists (Q3)
    case 'fixed':
    case 'text':
    case 'select': // enum VALUES are not stored in types.json — only the widget type
    case 'relation': // a single [[link]] is a text scalar
    default: return 'text';
  }
}

/**
 * Derive {property → native widget type} across every schema.
 * `tags` (the classifier) is excluded (ruling Q2). A property used in more than
 * one schema with DIFFERENT native types is a fatal cross-schema clash (the vault
 * namespace holds one widget per name).
 */
export function deriveNativeTypes(schemas) {
  const derived = {};
  const origin = {};
  const clashes = [];
  for (const s of schemas) {
    for (const f of s.fields) {
      if (f.type === 'tags') continue; // classifier — never emitted (Q2)
      const native = nativeType(f);
      if (derived[f.name] !== undefined && derived[f.name] !== native) {
        clashes.push(
          `${f.name}: ${origin[f.name]} → ${derived[f.name]}, ${s.entity} → ${native}`,
        );
      } else if (derived[f.name] === undefined) {
        derived[f.name] = native;
        origin[f.name] = s.entity;
      }
    }
  }
  return { derived, clashes };
}

/**
 * Compare a derived map against an existing types.json `types` object.
 * Returns the safe additions, the conflicts (kept, not clobbered), and unchanged count.
 */
export function diffTypes(derived, types) {
  const added = [];
  const conflicts = [];
  let unchanged = 0;
  for (const [name, native] of Object.entries(derived)) {
    if (!(name in types)) added.push([name, native]);
    else if (types[name] === native) unchanged++;
    else conflicts.push([name, types[name], native]);
  }
  return { added, conflicts, unchanged };
}
