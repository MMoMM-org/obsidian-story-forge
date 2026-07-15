/**
 * checksum.ts — byte-exact SHA-256 over fenced block source.
 *
 * Cross-platform: uses the Web Crypto API (`crypto.subtle.digest`), which is
 * available on desktop Electron AND mobile webviews. DQL views use this
 * checksum for consent/drift and must run on all platforms — a desktop-only
 * checksum would crash DQL on mobile (ADR-4, corrected 2026-07-15).
 *
 * Output format: "sha256:<64-char lowercase hex>"
 * CRLF vs LF: NOT normalised — byte-exact by design (ADR-4).
 *
 * @ref SDD/Interface Specifications — Checksum
 * @ref SDD/ADR-4 (byte-exact SHA-256 via Web Crypto, CRLF ≠ LF, cross-platform)
 */

/**
 * Type alias for the "sha256:<hex>" checksum string.
 * Used in ViewRecord.okayed.checksum and ViewDefinition.checksum.
 */
export type Checksum = `sha256:${string}`;

/**
 * Compute a SHA-256 checksum over the raw UTF-8 bytes of a fenced block's
 * source.
 *
 * - Encoding: UTF-8 bytes (via TextEncoder).
 * - CRLF vs LF: NOT normalised — CRLF ≠ LF by design.
 * - Output: "sha256:<64-char hex>".
 * - Uses the cross-platform Web Crypto API (`crypto.subtle.digest`).
 */
export async function computeChecksum(source: string): Promise<Checksum> {
	const bytes = new TextEncoder().encode(source);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	const hex = [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `sha256:${hex}`;
}
