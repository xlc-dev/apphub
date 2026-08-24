import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeArchitecture } from "#lib/architecture";

test("normalizes browser architecture names", () => {
  assert.equal(normalizeArchitecture("x86", "64"), "x86_64");
  assert.equal(normalizeArchitecture("AMD64"), "x86_64");
  assert.equal(normalizeArchitecture("arm", "64"), "aarch64");
  assert.equal(normalizeArchitecture("ARM64"), "aarch64");
  assert.equal(normalizeArchitecture("armv7l"), "armv7l");
  assert.equal(normalizeArchitecture("riscv64"), "riscv64");
  assert.equal(normalizeArchitecture("unknown"), undefined);
});
