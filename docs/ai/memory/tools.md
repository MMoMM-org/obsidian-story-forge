# Tools Memory

<!-- 2026-07-20 -->
- `npm run lint` only lints `src/` + `styles.css` (it runs `eslint src/ && stylelint styles.css`) — it does NOT lint `test/`. So test-file issues like unused imports slip past lint entirely; `npm run typecheck:test` catches type errors in tests but not lint-style nits. When reviewing test-file quality, inspect manually rather than trusting a green `lint`.

<!-- 2026-07-31 -->
- `eslint.config.mts` **deep-imports** `DEFAULT_BRANDS` from `eslint-plugin-obsidianmd/dist/lib/rules/ui/brands.js` — a path *inside* the package's `dist`, not a public export. It is deliberate: `obsidianmd/ui/sentence-case` treats its `brands` option as a **replacement** for its default list, not a merge, so passing our own brands without re-adding the defaults would un-register every Obsidian brand name. **Re-check this import on every `eslint-plugin-obsidianmd` upgrade**: if the plugin moves or renames that file the config fails as a module-resolution error at lint time, and nothing surfaces it except opening the config — there is no test over `eslint.config.mts`.
- **`Anvil`, `Workbench` and `Codex` are registered lint brands** (`STORY_FORGE_BRANDS` in `eslint.config.mts`, per ADR-27). That changes which UI strings need an `eslint-disable`: a capitalised `Anvil`/`Workbench`/`Codex` mid-sentence is now accepted by the sentence-case rule, so old suppressions around those strings are dead weight and new ones are unnecessary. Any *further* product noun added to the UI vocabulary must be added to that array, not suppressed at the call site.
