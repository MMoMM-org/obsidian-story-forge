/**
 * consentBox — the two consent states' shared markup (spec 008 T7.1d3; S12 and S17).
 *
 * The Workbench draws them for the shown tab and the Anvil's collection embed draws them for the
 * shown collection. Each surface keeps its own wording (the Workbench says "view", the embed says
 * "collection"); what is shared is the one vocabulary of classes and the button, so a restyle or
 * a rename touches one place. The click is the caller's: this module never talks to the gate.
 */

declare const activeDocument: Document;

/** S12's `.sf-cta-block` (not consented) or S17's `.sf-warnbanner` (drift). The caller fills it. */
export function consentBoxShell(drift: boolean): HTMLElement {
	const box = activeDocument.createElement("div");
	box.className = drift ? "sf-reconsent-required sf-warnbanner" : "sf-consent-required sf-cta-block";
	return box;
}

/** The call-to-action button; a plain listener, because the box is rebuilt on every render. */
export function consentButton(label: string, onClick: () => void): HTMLButtonElement {
	const button = activeDocument.createElement("button");
	button.type = "button";
	button.className = "sf-cta-btn sf-btn";
	button.textContent = label;
	button.addEventListener("click", onClick);
	return button;
}
