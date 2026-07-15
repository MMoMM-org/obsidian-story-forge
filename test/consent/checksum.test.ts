/**
 * Tests for computeChecksum (src/consent/checksum.ts).
 *
 * Contract (SDD/T1.2, ADR-4):
 * - Returns "sha256:<64hex>" format.
 * - Byte-exact: CRLF ≠ LF (different inputs → different outputs).
 * - Empty string is valid (no throw).
 * - Deterministic: same input → same output.
 * - Checksum type alias is exported.
 */

import { describe, it, expect } from "vitest";
import { computeChecksum } from "consent/checksum";
import type { Checksum } from "consent/checksum";

describe("computeChecksum", () => {
	it("returns a string matching /^sha256:[0-9a-f]{64}$/", async () => {
		const result = await computeChecksum("hello\n");
		expect(result).toMatch(/^sha256:[0-9a-f]{64}$/);
	});

	it("CRLF ≠ LF — same logical text with different line endings produces different checksums", async () => {
		const lf = await computeChecksum("hello\n");
		const crlf = await computeChecksum("hello\r\n");
		expect(lf).not.toBe(crlf);
	});

	it("does not throw for empty source", async () => {
		await expect(computeChecksum("")).resolves.toMatch(/^sha256:[0-9a-f]{64}$/);
	});

	it("is deterministic — same input always produces the same output", async () => {
		const source = "LIST FROM #canon\n";
		const first = await computeChecksum(source);
		const second = await computeChecksum(source);
		expect(first).toBe(second);
	});

	it("produces the known SHA-256 for an empty string", async () => {
		// SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
		const result = await computeChecksum("");
		expect(result).toBe(
			"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
	});

	it("produces different checksums for different sources", async () => {
		const a = await computeChecksum("LIST FROM #canon\n");
		const b = await computeChecksum("TABLE FROM #canon\n");
		expect(a).not.toBe(b);
	});
});

// Type-level test: Checksum is exported and assignable from a valid string.
describe("Checksum type", () => {
	it("Checksum type alias is exported and usable", () => {
		const cs: Checksum = "sha256:abc123" as Checksum;
		expect(cs).toMatch(/^sha256:/);
	});
});
