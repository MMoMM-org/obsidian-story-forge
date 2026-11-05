import { globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import tseslint from "typescript-eslint";
// eslint-plugin-obsidianmd doesn't export its default brand list from the
// package root, so this deep-imports the same DEFAULT_BRANDS array its own
// `obsidianmd/ui/sentence-case` rule falls back to when no `brands` option is
// given (dist/lib/rules/ui/brands.js, typed via brands.d.ts). Reusing it (vs.
// hardcoding a copy) keeps this list in sync with upstream automatically; if
// a future plugin version moves/renames the file, this import throws at lint
// time (loud, not a silent drift) — the fallback is to inline a copy of
// DEFAULT_BRANDS here and extend it the same way.
import { DEFAULT_BRANDS } from "eslint-plugin-obsidianmd/dist/lib/rules/ui/brands.js";

// Story Forge's own product vocabulary (ADR-27) — Anvil (main-window),
// Workbench (sidebar), Codex (content surface). Registered as brands so the
// sentence-case rule preserves their Title Case consistently everywhere
// (ribbon, commands, panel chrome, settings copy) instead of requiring a
// per-string `eslint-disable` at every call site.
const STORY_FORGE_BRANDS = ["Anvil", "Workbench", "Codex"];

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.mts", "manifest.json"],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	...tseslint.configs.recommendedTypeChecked,
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts", "**/*.tsx"],
		rules: {
			// Overrides obsidianmd.configs.recommended's sentence-case entry to
			// extend (not replace) its brand list — the rule takes `brands` as a
			// full replacement of its default when provided, so DEFAULT_BRANDS
			// must be spread in explicitly.
			"obsidianmd/ui/sentence-case": [
				"error",
				{ enforceCamelCaseLower: true, brands: [...DEFAULT_BRANDS, ...STORY_FORGE_BRANDS] },
			],
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"build",
		"esbuild.config.mjs",
		"version-bump.mjs",
		"versions.json",
		"vitest.config.ts",
		"vitest.live.config.ts",
		"main.js",
		"test/__mocks__/**",
		"test/setup/**",
		"test/**/*.test.ts",
		"test/**/helpers.ts",
		"test/fixtures/**",
		"test/*/.obsidian/**",
		"claude-docker-home/**",
	]),
);
