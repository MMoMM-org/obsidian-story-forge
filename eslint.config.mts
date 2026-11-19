// Local lint is the Obsidian community plugin scanner (spec 010, ADR-44 / CON-7).
//
// This mirrors the "Full scanner-equivalent configuration" from
// eslint-plugin-obsidianmd 0.5.1's docs/configuration.md ("Community plugin
// scanner configuration"), including the stricter layer the scanner applies
// to newly submitted plugins, with two deliberate local additions:
//
// 1. `validate-manifest` and `validate-license` stay on. The scanner switches
//    them off only because it checks manifest.json and LICENSE separately;
//    locally they are the only check we get, so `npm run lint` runs from the
//    project root (`eslint .`) to reach both files.
// 2. `ui/sentence-case` stays on with a local brand list. The scanner skips
//    the sentence-case rules, but the directory's guidelines still ask for
//    sentence case, and `eslint-comments/no-restricted-disable` forbids
//    disabling any `obsidianmd/*` rule — so product names are brands here
//    instead of per-string disables.
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

// The `brands` option replaces the rule's default list, so this is the full
// list the UI text needs: the default brands Story Forge's copy uses, the
// plugins it integrates with, and its own product vocabulary (ADR-27:
// Anvil = main window, Workbench = sidebar, Codex = content surface; the
// workspace views Timeline, Plotlines and Plotgrid; FileClasses from
// Metadata Menu). Kept local on purpose: no deep import into the plugin's
// `dist/`, which is not a public entry point.
const BRANDS = [
	// Obsidian and the formats it reads
	"Obsidian",
	"Obsidian Sync",
	"Markdown",
	"JavaScript",
	"iOS",
	"Android",
	// Plugins Story Forge integrates with
	"Bases",
	"Dataview",
	"DataviewJS",
	"Metadata Menu",
	"Longform",
	"Calendarium",
	"Storyline",
	// Story Forge's own vocabulary
	"Story Forge",
	"Anvil",
	"Workbench",
	"Codex",
	"Timeline",
	"Plotlines",
	"Plotgrid",
	"FileClass",
	"FileClasses",
	// The default vault folder Story Forge installs into, named as written
	"00 Meta",
	// Acronyms the UI writes in capitals (the `acronyms` option would replace
	// the rule's whole default list, so they sit here)
	"POV",
];

// Settings breadcrumbs ("Settings › Library › Collections") name headings and
// tabs exactly as the UI shows them, so their words keep their case.
const IGNORE_REGEX = [" › "];

export default defineConfig([
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},

	...obsidianmd.configs.recommended,

	{
		files: ["**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}"],
		rules: {
			// Security — keep as errors
			"no-eval": "error",
			"no-unsanitized/method": "error",
			"no-unsanitized/property": "error",
			"obsidianmd/regex-lookbehind": "error",
			"obsidianmd/no-forbidden-elements": "error",

			// Covered by TypeScript or too noisy (scanner base layers)
			"no-undef": "off",
			"@typescript-eslint/restrict-template-expressions": "off",
			"@typescript-eslint/no-base-to-string": "off",
			"import/no-unresolved": "off",

			// Newest scanner layer (plugins submitted today): no-unsafe-* and
			// the command-id rules back at warn, these obsidianmd rules at error.
			"@typescript-eslint/no-unsafe-member-access": "warn",
			"@typescript-eslint/no-unsafe-assignment": "warn",
			"@typescript-eslint/no-unsafe-argument": "warn",
			"@typescript-eslint/no-unsafe-call": "warn",
			"@typescript-eslint/no-unsafe-return": "warn",
			"obsidianmd/commands/no-command-in-command-id": "warn",
			"obsidianmd/commands/no-plugin-id-in-command-id": "warn",
			"obsidianmd/settings-tab/no-manual-html-headings": "error",
			"obsidianmd/settings-tab/no-problematic-settings-headings": "error",
			"obsidianmd/sample-names": "error",
			"obsidianmd/no-sample-code": "error",
			"obsidianmd/platform": "error",
			"obsidianmd/no-plugin-as-component": "error",
			"obsidianmd/detach-leaves": "error",
			"obsidianmd/no-static-styles-assignment": "error",
			"obsidianmd/no-view-references-in-plugin": "error",
			"obsidianmd/no-unsupported-api": "error",

			// Local addition (see the header): sentence case with our brands.
			"obsidianmd/ui/sentence-case": [
				"error",
				{ enforceCamelCaseLower: true, brands: BRANDS, ignoreRegex: IGNORE_REGEX },
			],
		},
	},

	{
		// Security — implied eval, once per call (see the scanner docs).
		files: ["**/*.{js,cjs,mjs,jsx}"],
		rules: {
			"no-implied-eval": "error",
		},
	},
	{
		files: ["**/*.{ts,cts,mts,tsx}"],
		rules: {
			"@typescript-eslint/no-implied-eval": "error",
		},
	},

	{
		// The scanner honours disable comments but does not report unused ones.
		linterOptions: {
			reportUnusedDisableDirectives: "warn",
			reportUnusedInlineConfigs: "off",
		},
	},

	globalIgnores([
		// The scanner's ignore list (eslint-plugin-obsidianmd 0.5.1).
		"main.js",
		"**/*.min.js",
		"**/{dist,build,out,release}/**/*.{js,cjs,mjs,jsx}",
		"node_modules",
		"dist",
		"build",
		"pkg",
		"test-vault",
		".obsidian",
		"**/.obsidian/**",
		"esbuild.config.mjs",
		"version-bump.mjs",
		"**/*.test.*",
		"**/*.tests.*",
		"**/*.spec.*",
		"**/*.specs.*",
		"**/test/**",
		"**/tests/**",
		"**/__tests__/**",
		"**/mocks/**",
		"**/__mocks__/**",
		"**/*.cjs",
		"**/*.mjs",
		"**/*.cts",
		"**/*.mts",
		"**/vite*",
		"**/scripts/**",
		"**/docs/**",
		"**/i18n/**",
		"**/i18next/**",
		"**/locale/**",
		"**/locales/**",
		"**/translations/**",
		"**/l10n/**",
		".pnpm-store",
		"**/*.spec.ts",
		"**/testUtils**",
		"automation/**",
		"**/e2e/**",
		"**/e2e-tests/**",
		"**/*.e2e.*",
		"**/wdio.conf.*",
		"**/wdio.*.conf.*",
		"**/playwright.config.*",
		"**/{astro,babel,commitlint,docusaurus,esbuild,eslint,jest,oxlint,postcss,prettier,rolldown,rollup,stylelint,svelte,tailwind,tsdown,tsup,uno,webpack}.config.*",
		"**/{eslint,jest}.*.config.*",
		"**/jest.setup.*",
		"**/.{babelrc,eslintrc,mocharc,prettierrc}.*",
		// Local, not plugin source: agent worktrees, typecheck:mock output,
		// coverage, dev-container home and scratch space.
		".claude/**",
		".typecheck-mock-tmp/**",
		"coverage/**",
		"claude-docker-home/**",
		"claude-docker/**",
		"temp/**",
		"infra/**",
	]),
]);
