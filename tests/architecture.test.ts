import assert from "node:assert/strict";
import { test } from "node:test";
import { isMobileDevice, normalizeArchitecture } from "#lib/architecture";

test("normalizes browser architecture names", () => {
  assert.equal(normalizeArchitecture("x86", "64"), "x86_64");
  assert.equal(normalizeArchitecture("AMD64"), "x86_64");
  assert.equal(normalizeArchitecture("arm", "64"), "aarch64");
  assert.equal(normalizeArchitecture("ARM64"), "aarch64");
  assert.equal(normalizeArchitecture("armv7l"), "armv7l");
  assert.equal(normalizeArchitecture("riscv64"), "riscv64");
  assert.equal(normalizeArchitecture("unknown"), undefined);
});

test("detects mobile browsers", () => {
  assert.equal(isMobileDevice("Mozilla/5.0 (Linux; Android 16; Pixel 9) Mobile"), true);
  assert.equal(isMobileDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), true);
  assert.equal(isMobileDevice("Mozilla/5.0 (X11; Linux x86_64)"), false);
  assert.equal(isMobileDevice("Mozilla/5.0 (X11; Linux x86_64)", true), true);
});
