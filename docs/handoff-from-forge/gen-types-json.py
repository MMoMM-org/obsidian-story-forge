#!/usr/bin/env python3
"""gen-types-json — project the fileclass schema onto the vault-wide types.json.

The fileclasses (blueprint/fileclasses/fc-*.md) are the source of truth for the
per-note-type schema. Obsidian's own `.obsidian/types.json` is a FLAT, vault-wide
registry mapping each property name to exactly ONE widget type. This tool derives
the native widget type for every fileclass field and MERGES it into types.json.

MERGE, never overwrite. types.json also holds many keys that no fileclass owns —
Breadcrumbs (BC-*), Tasks (TQ_*), the relation fields, and the special types
`aliases`/`tags`/`cssclasses`. Those must survive untouched. Therefore:

  - existing keys keep their value and their order; new fileclass keys are appended
  - a fileclass key whose native type DIFFERS from the one already in types.json is
    a CONFLICT: it is reported and LEFT AS-IS (never silently clobbered) unless --force
  - no key is ever removed

  exit 0 = types.json already matches / was safely extended
  exit 1 = drift remains: unresolved conflicts, or (--check) pending additions

Usage:
  gen-types-json.py [--write] [--check] [--force]
                    [--fileclasses DIR] [--types-json FILE]

  --write          (default) apply safe additions in place; report conflicts, keep them
  --check          dry run: report what would change, write nothing, exit 1 on any drift
  --force          also overwrite conflicting keys with the fileclass-derived type
  --fileclasses    fileclass source dir (default: blueprint/fileclasses next to this script)
  --types-json     target registry (default: blueprint/vault-template/dot_obsidian/types.json)

The path flags let deploy-vault.sh gate the exact copies it ships
(vault-template/00 Meta/FileClasses + vault-template/dot_obsidian/types.json).
"""
import sys
import re
import json
import pathlib
from collections import OrderedDict

HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_FILECLASS_DIR = HERE / "fileclasses"
DEFAULT_TYPES_JSON = HERE / "vault-template" / "dot_obsidian" / "types.json"

# Metadata Menu field type -> Obsidian native property (widget) type.
MM_TO_NATIVE = {
    "Input": "text",
    "Select": "text",
    "Cycle": "text",
    "Number": "number",
    "Boolean": "checkbox",
    "Date": "date",
    "DateTime": "datetime",
    "Time": "text",
    "File": "text",
    "Media": "text",
    "Multi": "multitext",
    "MultiFile": "multitext",
    "MultiMedia": "multitext",
    "Lookup": "text",
    "Formula": "text",
    "JSON": "text",
    "YAML": "text",
    "Object": "text",
    "ObjectList": "multitext",
    "Canvas": "text",
    "CanvasGroup": "multitext",
    "CanvasGroupLink": "multitext",
}

# Names whose native type is fixed by Obsidian regardless of the fileclass type
# (a Multi-typed `aliases` field must still be the special "aliases" widget).
RESERVED = {
    "aliases": "aliases",
    "cssclasses": "multitext",
}

# Never emitted into types.json — Obsidian types these natively and schema:check
# excludes the classifier. `tags` is the tag classifier, handled via tagNames.
SKIP = {"tags"}

VALID_NATIVE = {"text", "number", "checkbox", "date", "datetime",
                "multitext", "tags", "aliases"}


def derive_fields(fileclass_dir):
    """Return {property_name: native_type} for every field across all fileclasses.

    A property seen in more than one fileclass must map to the same native type;
    a cross-fileclass disagreement is fatal (the vault namespace cannot hold both).
    """
    derived = {}
    origin = {}
    problems = []
    for fc in sorted(fileclass_dir.glob("fc-*.md")):
        text = fc.read_text(encoding="utf-8")
        # Each field is a `- name: X` line followed (soon) by a `type: Y` line.
        for m in re.finditer(
            r"^\s*-\s*name:\s*(?P<name>.+?)\s*$"
            r"(?P<body>(?:\n(?!\s*-\s*name:).*)*)",
            text, re.M,
        ):
            name = m.group("name").strip().strip('"').strip("'")
            if name in SKIP:
                continue
            tm = re.search(r"^\s*type:\s*(\S+)", m.group("body"), re.M)
            mm_type = tm.group(1).strip() if tm else "Input"
            native = RESERVED.get(name) or MM_TO_NATIVE.get(mm_type)
            if native is None:
                problems.append(f"{fc.name}: unknown Metadata Menu type "
                                f"{mm_type!r} for field {name!r}")
                native = "text"
            if name in derived and derived[name] != native:
                problems.append(
                    f"cross-fileclass type clash for {name!r}: "
                    f"{origin[name]} says {derived[name]}, {fc.name} says {native}")
            derived.setdefault(name, native)
            origin.setdefault(name, fc.name)
    return derived, problems


def load_types(types_json):
    raw = json.loads(types_json.read_text(encoding="utf-8"),
                     object_pairs_hook=OrderedDict)
    if "types" not in raw or not isinstance(raw["types"], OrderedDict):
        raise SystemExit(f"malformed types.json: missing object 'types' in {types_json}")
    return raw


def main():
    args = sys.argv[1:]
    force = "--force" in args
    check = "--check" in args
    # --write is the default; --check turns writing off.
    write = not check

    fileclass_dir = DEFAULT_FILECLASS_DIR
    types_json = DEFAULT_TYPES_JSON
    i = 0
    while i < len(args):
        if args[i] == "--fileclasses":
            fileclass_dir = pathlib.Path(args[i + 1]); i += 2
        elif args[i] == "--types-json":
            types_json = pathlib.Path(args[i + 1]); i += 2
        else:
            i += 1

    if not fileclass_dir.is_dir():
        raise SystemExit(f"no fileclass dir: {fileclass_dir}")
    if not types_json.is_file():
        raise SystemExit(f"no types.json: {types_json}")

    derived, problems = derive_fields(fileclass_dir)
    for p in problems:
        print(f"  ! {p}", file=sys.stderr)

    raw = load_types(types_json)
    types = raw["types"]  # OrderedDict, preserves existing order

    added, conflicts, unchanged = [], [], 0
    for name, native in derived.items():
        if name not in types:
            added.append((name, native))
        elif types[name] == native:
            unchanged += 1
        else:
            conflicts.append((name, types[name], native))

    # Apply — additions are always safe; conflicts only with --force.
    changed = False
    for name, native in added:
        types[name] = native
        changed = True
    for name, old, native in conflicts:
        if force:
            types[name] = native
            changed = True

    # Report.
    print(f"fileclass fields: {len(derived)}  "
          f"| types.json properties: {len(types)}  "
          f"| unchanged: {unchanged}")
    for name, native in added:
        print(f"  + {name}: {native}"
              + ("" if write else "   (pending — run without --check to apply)"))
    for name, old, native in conflicts:
        state = "OVERWRITTEN" if force else "KEPT existing (use --force to change)"
        print(f"  ~ CONFLICT {name}: types.json={old} fileclass={native}  -> {state}")

    # Sanity: nothing invalid leaked in.
    invalid = {k: v for k, v in types.items() if v not in VALID_NATIVE}
    if invalid:
        print(f"  ! invalid native types produced: {invalid}", file=sys.stderr)
        return 1

    if write and changed:
        text = json.dumps(raw, indent=2, ensure_ascii=False) + "\n"
        types_json.write_text(text, encoding="utf-8")
        print(f"wrote {types_json}")

    # Drift = unresolved conflicts always; pending additions only in --check mode.
    unresolved_conflicts = conflicts and not force
    pending_additions = added and not write
    if problems or unresolved_conflicts or pending_additions:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
