import { describe, expect, test } from "bun:test";
import { formatBytes } from "@/lib/format";

describe("byte formatting", () => {
  test("uses binary units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MiB");
  });
});
