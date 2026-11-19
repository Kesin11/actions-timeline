import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

export { test } from "node:test";

export function assertEquals<T>(
  actual: T,
  expected: T,
  message?: string,
): void {
  if (message === undefined) {
    assert.deepStrictEqual(actual, expected);
  } else {
    assert.deepStrictEqual(actual, expected, message);
  }
}

export function assertStringIncludes(actual: string, expected: string): void {
  assert.ok(
    actual.includes(expected),
    `Expected string to include ${JSON.stringify(expected)}, received ${JSON.stringify(
      actual,
    )}`,
  );
}

export function assertThrows(
  fn: () => unknown,
  ErrorClass?: new (...args: never[]) => Error,
  messageIncludes?: string,
): Error {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof Error);
    if (ErrorClass) assert.ok(error instanceof ErrorClass);
    if (messageIncludes) assertStringIncludes(error.message, messageIncludes);
    return error;
  }
  assert.fail("Expected function to throw");
}

export const encodeBase64 = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64");
