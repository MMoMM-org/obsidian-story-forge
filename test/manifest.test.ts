import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";

describe("manifest.json", () => {
	it("minAppVersion is 1.12.7 (CON-5 honest floor)", () => {
		expect(manifest.minAppVersion).toBe("1.12.7");
	});
});
