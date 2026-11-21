import type { MockInstance } from "vitest";

/**
 * A mock's current implementation, typed as the function it mocks.
 *
 * vitest 4 types `getMockImplementation()` as a union that includes a constructor
 * signature, so the result is not callable. Tests that wrap the mock's default
 * behaviour (pass most calls through, intercept one) read it through this helper,
 * which takes the type from the mock's own call signature instead.
 */
export function implOf<A extends unknown[], R>(
	mock: Pick<MockInstance, "getMockImplementation"> & ((...args: A) => R),
): ((...args: A) => R) | undefined {
	return mock.getMockImplementation() as ((...args: A) => R) | undefined;
}
