/**
 * The write recorder is module state and a second install throws (ADR-44). Many suites call
 * `plugin.onload()` repeatedly without unloading, so clear it after every test.
 */
import { afterEach } from "vitest";
import { resetWriteRecorderForTests } from "inspector/frontmatterWriter";

afterEach(() => {
	resetWriteRecorderForTests();
});
