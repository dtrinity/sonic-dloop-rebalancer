/**
 * Assert that a condition is truthy and throw an error with the provided
 * message if it is not. This narrows types for TypeScript using
 * `asserts condition`.
 *
 * @param condition - The condition to assert.
 * @param message - Optional error message when the assertion fails.
 */
export function assert(condition: any, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

/**
 * Ensure a value is not null or undefined and return it typed as `T`.
 * Throws an Error with the provided message if the value is nullish.
 *
 * @param value - The value to check for non-nullness.
 * @param message - Optional error message when the value is null or undefined.
 * @returns The provided value with type `T`.
 */
export function assertNonNull<T>(
  value: T | null | undefined,
  message?: string,
): T {
  if (value == null) {
    throw new Error(message || "Value is null or undefined");
  }
  return value;
}
