import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "vitest/config";

const srcDir = path.resolve(__dirname, "src");

export default defineConfig({
	resolve: {
		alias: [
			// obsidian mock — must come before the src-baseUrl fallback.
			{ find: "obsidian", replacement: path.resolve(__dirname, "test/__mocks__/obsidian.ts") },
			// Mirror tsconfig baseUrl:"src" — only redirect bare imports that
			// resolve to an actual file under src/, so node_modules (vitest,
			// node built-ins, etc.) are not intercepted.
			{
				find: /^([a-zA-Z][^:]*?)$/,
				replacement: "$1",
				customResolver(id) {
					// Try <srcDir>/<id>.ts then <srcDir>/<id>/index.ts
					const candidates = [
						path.join(srcDir, `${id}.ts`),
						path.join(srcDir, id, "index.ts"),
					];
					for (const c of candidates) {
						if (fs.existsSync(c)) return c;
					}
					// Not found under src/ → let vite resolve normally (node_modules etc.)
					return null;
				},
			},
		],
	},
	test: {
		globals: true,
		environment: "jsdom",
		include: ["test/**/*.test.ts"],
		exclude: ["test/live/**"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.d.ts"],
		},
	},
});
