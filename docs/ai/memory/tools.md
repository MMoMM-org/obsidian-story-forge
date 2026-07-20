# Tools Memory

<!-- 2026-07-20 -->
- `npm run lint` only lints `src/` + `styles.css` (it runs `eslint src/ && stylelint styles.css`) — it does NOT lint `test/`. So test-file issues like unused imports slip past lint entirely; `npm run typecheck:test` catches type errors in tests but not lint-style nits. When reviewing test-file quality, inspect manually rather than trusting a green `lint`.
