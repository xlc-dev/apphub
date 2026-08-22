import { expect, test } from "bun:test";
import { normalizeArchitecture } from "@/lib/architecture";

test("normalizes browser architecture names", () => {
  expect(normalizeArchitecture("x86", "64")).toBe("x86_64");
  expect(normalizeArchitecture("AMD64")).toBe("x86_64");
  expect(normalizeArchitecture("arm", "64")).toBe("aarch64");
  expect(normalizeArchitecture("ARM64")).toBe("aarch64");
  expect(normalizeArchitecture("armv7l")).toBe("armv7l");
  expect(normalizeArchitecture("riscv64")).toBe("riscv64");
  expect(normalizeArchitecture("unknown")).toBeUndefined();
});
