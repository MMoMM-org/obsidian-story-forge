/**
 * DisclosureModal — Obsidian Modal subclass for consent/re-consent flows.
 *
 * Full disclosure for DataviewJS (S20/S23): name, description, source path,
 * full source in scrollable block, sha256 checksum, ⚠ JS warning.
 * Cancel is default-focused (primary). Enable is danger.
 *
 * The DQL light confirm (S21) was removed 2026-11-17: DQL is enable/disable only
 * and never asks for consent.
 *
 * All user-supplied text rendered via createEl/textContent (XSS-safe, no innerHTML).
 *
 * @ref SDD/ADR-5 (DataviewJS full disclosure always)
 * @ref SDD/ADR-7 (standard Modal subclass; focus trap inherited)
 * @ref SDD/Cross-Cutting Concepts — Accessibility
 * @ref mockups.html states S20, S23
 */

import { Modal } from "obsidian";
import type { App } from "obsidian";

export interface DisclosureInfo {
	/** View name (commandName or sf-name). */
	name: string;
	/** Optional description blurb. */
	description?: string;
	/** Vault-relative path of the source note. */
	sourcePath: string;
	/** Raw fenced block body (the query source). */
	source: string;
	/** SHA-256 checksum string ("sha256:<hex>"). */
	checksum: string;
	/** True when this is a re-consent flow (S23 — adds drift warning banner). */
	isDrift?: boolean;
}

/**
 * DisclosureModal — presented before a view is first enabled (or re-enabled
 * after drift). Resolves with true if the user clicked "Enable", false otherwise.
 *
 * Use present() — NOT open() — to get the Promise<boolean>.
 */
export class DisclosureModal extends Modal {
	private _resolver: ((granted: boolean) => void) | null = null;
	private readonly _info: DisclosureInfo;

	/** Escape handler — stored so it can be removed in onClose. */
	private readonly _escHandler = (evt: KeyboardEvent): void => {
		if (evt.key === "Escape") {
			this._resolveOnce(false);
			this.close();
		}
	};

	constructor(app: App, info: DisclosureInfo) {
		super(app);
		this._info = info;
	}

	/** Open the modal and return a promise that resolves with the user's decision. */
	present(): Promise<boolean> {
		const promise = new Promise<boolean>((resolve) => {
			this._resolver = resolve;
		});
		this.open();
		return promise;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-disclosure-modal");

		// Register Escape handler
		contentEl.addEventListener("keydown", this._escHandler);

		// --- Header ---
		const head = contentEl.createDiv({ cls: "sf-modal-head" });
		head.createEl("div", { cls: "sf-modal-title", text: this._info.name });
		if (this._info.description) {
			head.createEl("div", { cls: "sf-modal-sub", text: this._info.description });
		}
		const pathEl = head.createEl("div", { cls: "sf-modal-path" });
		pathEl.textContent = this._info.sourcePath;

		// --- Body ---
		const body = contentEl.createDiv({ cls: "sf-modal-body" });

		this._buildFullDisclosureBody(body);

		// --- Footer ---
		const foot = contentEl.createDiv({ cls: "sf-modal-foot" });
		this._buildFooter(foot);
	}

	onClose(): void {
		this.contentEl.removeEventListener("keydown", this._escHandler);
		this._resolveOnce(false);
		this.contentEl.empty();
	}

	// -------------------------------------------------------------------------
	// Variant builders
	// -------------------------------------------------------------------------

	private _buildFullDisclosureBody(body: HTMLElement): void {
		// Drift warning banner (S23 only)
		if (this._info.isDrift) {
			const banner = body.createDiv({ cls: "sf-drift-banner" });
			banner.textContent =
				"⚠ Query changed since you last enabled this collection. Review the new source before re-enabling.";
		}

		// Source label + engine badge
		const sourceLabel = body.createEl("div", { cls: "sf-source-label" });
		sourceLabel.textContent = "Source ";
		sourceLabel.createEl("span", { cls: "sf-badge sf-badge-dvjs", text: "DataviewJS" });

		// Source code in a scrollable pre block
		const pre = body.createEl("pre", { cls: "sf-source-pre" });
		pre.textContent = this._info.source;

		// Checksum section
		const checksumSection = body.createDiv({ cls: "sf-checksum-section" });
		checksumSection.createEl("div", { cls: "sf-checksum-label", text: "SHA-256 checksum" });
		const checksumEl = checksumSection.createEl("div", { cls: "sf-checksum-value" });
		checksumEl.textContent = this._info.checksum;

		// Security warning
		const warn = body.createEl("div", { cls: "sf-security-warn" });
		warn.textContent =
			"⚠ This collection runs JavaScript with full vault access. Only enable collections whose source you have read and trust. You will be re-prompted if the code changes.";
	}

	// -------------------------------------------------------------------------
	// Footer buttons
	// -------------------------------------------------------------------------

	private _buildFooter(foot: HTMLElement): void {
		// S20/S23: Cancel is primary + default-focused; Enable is danger
		const cancelBtn = foot.createEl("button", {
			cls: "sf-btn sf-btn-primary",
			text: "Cancel",
		});
		cancelBtn.setAttribute("type", "button");
		cancelBtn.addEventListener("click", () => {
			this._resolveOnce(false);
			this.close();
		});
		// Focus Cancel (safe default per ADR-5)
		cancelBtn.focus();

		const enableBtn = foot.createEl("button", {
			cls: "sf-btn sf-btn-danger",
			text: "Enable",
		});
		enableBtn.setAttribute("type", "button");
		enableBtn.addEventListener("click", () => {
			this._resolveOnce(true);
			this.close();
		});
	}

	// -------------------------------------------------------------------------
	// Promise helpers
	// -------------------------------------------------------------------------

	/** Resolve the promise exactly once; subsequent calls are no-ops. */
	private _resolveOnce(granted: boolean): void {
		if (this._resolver === null) return;
		const r = this._resolver;
		this._resolver = null;
		r(granted);
	}
}
