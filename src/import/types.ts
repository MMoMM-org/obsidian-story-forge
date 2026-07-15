/**
 * Shared types for the import flow (S4 — decouples BindModal from
 * ImportPickerModal; both import RegisterCommandCallback from here).
 *
 * @ref SDD/Runtime View — Flow C (import → bind)
 */

/**
 * Callback injected from main.ts / SettingsTab to register a command palette
 * entry. Called by BindModal on confirm only when the user checks "Register
 * as command".
 *
 * @param viewId      The store-generated id (from importToStore).
 * @param commandName The user-edited command name (default: "Story Forge: <sf-name>").
 */
export type RegisterCommandCallback = (viewId: string, commandName: string) => void;
