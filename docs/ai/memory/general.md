# General Memory

<!-- 2026-08-01 -->
- `ViewRecord` (src/store/types.ts) has a shared test factory — `makeDummyViewRecord()` in `test/helpers/viewFixtures.ts` — but only ~4 test files use it; most build the object literal inline, and several keep their own local `rec()`/`makeRecord()` helper. So adding a required field to `ViewRecord` has **no single choke point**: expect breakage scattered across ~20 files. Fix each file's local helper once rather than every call of it, and prefer extending `viewFixtures.ts` over adding a new local factory.
