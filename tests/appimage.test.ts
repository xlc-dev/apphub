import assert from "node:assert/strict";
import { test } from "node:test";
import { findSquashfsSuperblocks, inspectAppImage } from "#catalog/appimage";

function appImage() {
  const data = Buffer.alloc(512);
  data.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0x41, 0x49, 2]);
  data.writeUInt16LE(3, 16);
  data.writeUInt16LE(62, 18);
  data.writeBigUInt64LE(64n, 40);
  data.writeUInt16LE(64, 52);
  data.writeUInt16LE(64, 58);
  data.writeUInt16LE(1, 60);
  data.write("hsqs", 128, "ascii");
  data.writeUInt32LE(1, 132);
  data.writeUInt32LE(4096, 140);
  data.writeUInt16LE(4, 156);
  data.writeUInt16LE(0, 158);
  data.writeBigUInt64LE(96n, 168);
  return data;
}

test("inspects a bounded type 2 AppImage without executing it", () => {
  const data = appImage();
  assert.deepEqual(inspectAppImage(data, findSquashfsSuperblocks(data, 0), data.length, "x86_64"), {
    format: "appimage",
    runtimeType: 2,
    elfClass: 64,
    elfMachine: 62,
    archive: { format: "squashfs", offset: 128, bytesUsed: 96, inodes: 1, blockSize: 4096 },
  });
});

test("rejects malformed, wrong-architecture, and unbounded AppImages", () => {
  const valid = appImage();
  assert.throws(() => inspectAppImage(Buffer.alloc(64), [], 64, "x86_64"), /ELF header/);
  assert.throws(
    () => inspectAppImage(valid, findSquashfsSuperblocks(valid, 0), valid.length, "aarch64"),
    /does not match/
  );

  const bomb = appImage();
  bomb.writeUInt32LE(1_000_001, 132);
  assert.throws(
    () => inspectAppImage(bomb, findSquashfsSuperblocks(bomb, 0), bomb.length, "x86_64"),
    /unbounded/
  );

  const falseMarker = appImage();
  falseMarker.writeBigUInt64LE(128n, 40);
  assert.throws(
    () =>
      inspectAppImage(
        falseMarker,
        findSquashfsSuperblocks(falseMarker, 0),
        falseMarker.length,
        "x86_64"
      ),
    /unbounded/
  );
});
