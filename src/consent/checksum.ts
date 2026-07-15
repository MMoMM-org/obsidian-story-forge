/**
 * checksum.ts — byte-exact SHA-256 over fenced block source.
 *
 * Desktop-only: uses node:crypto via a dynamic import so the mobile bundle
 * is never broken. Call sites must guard with Platform.isDesktop.
 *
 * Output format: "sha256:<64-char lowercase hex>"
 * CRLF vs LF: NOT normalised — byte-exact by design (ADR-4).
 *
 * @ref SDD/Interface Specifications — Checksum
 * @ref SDD/ADR-4 (byte-exact, CRLF ≠ LF, dynamic import, desktop-only)
 * @ref SDD/Implementation Gotchas (node:crypto must be a dynamic import)
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
 * - node:crypto is imported dynamically so the mobile bundle never imports it.
 *
 * @throws Error if node:crypto is unavailable (mobile guard should prevent this).
 */
export async function computeChecksum(source: string): Promise<string> {
	// eslint-disable-next-line import/no-nodejs-modules -- dynamic import: mobile bundle never executes this path; call sites guard with Platform.isDesktop (ADR-4, CON-7)
	const { createHash } = await import("node:crypto");
	const bytes = new TextEncoder().encode(source);
	const hash = createHash("sha256").update(bytes).digest("hex");
	return `sha256:${hash}`;
}
