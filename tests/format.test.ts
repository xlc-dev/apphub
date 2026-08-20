import { describe, expect, test } from "bun:test";
import { formatBytes, formatVersion } from "@/lib/format";

describe("byte formatting", () => {
  test("uses binary units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MiB");
  });
});

describe("version formatting", () => {
  test("removes packaging details", () => {
    expect(formatVersion("1.2.3-4@2099-01-02_1234567890")).toBe("1.2.3-4");
    expect(formatVersion("v5.6.7@2099-01-02_1234567890")).toBe("5.6.7");
  });
});
