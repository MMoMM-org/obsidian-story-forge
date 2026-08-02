# Troubleshooting Memory

<!-- 2026-08-01 -->
- `npm test` alone will NOT catch a store-type breaking change: vitest/esbuild transpiles without type-checking, so adding required fields to `ViewRecord` (or similar core types) can leave `npm test` green while `npm run typecheck` / `npm run typecheck:test` go red across every consumer that builds the type as an object literal. Always run `npm run typecheck` (and `typecheck:test`) after widening a shared type, not just `npm test`. Example: spec-008 T3.1 added required `kind`/`surfaces` to `ViewRecord` — broke tsc in `src/catalog/CatalogService.ts`, `src/import/ViewImporter.ts`, and ~13 test files, none of which were listed as owned by that task.
