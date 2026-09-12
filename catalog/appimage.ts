import type { Architecture } from "#catalog/schema";

const squashfsMagic = Buffer.from("hsqs");
const maximumInodes = 1_000_000;
const maximumRuntimeBytes = 64 * 1024 * 1024;
const machineByArchitecture: Partial<Record<Architecture, number>> = {
  i686: 3,
  x86_64: 62,
  armv7l: 40,
  aarch64: 183,
  ppc64le: 21,
  riscv64: 243,
  s390x: 22,
};
const classByArchitecture: Partial<Record<Architecture, 32 | 64>> = {
  i686: 32,
  armv7l: 32,
  x86_64: 64,
  aarch64: 64,
  ppc64le: 64,
  riscv64: 64,
  s390x: 64,
};

export interface AppImageInspection {
  format: "appimage";
  runtimeType: 1 | 2;
  elfClass: 32 | 64;
  elfMachine: number;
  archive: {
    format: "iso9660" | "squashfs";
    offset: number;
    bytesUsed: number;
    inodes?: number;
    blockSize?: number;
  };
}

function type2ArchiveOffset(
  prefix: Buffer,
  elfClass: 32 | 64,
  littleEndian: boolean,
  size: number
) {
  const sectionOffset = integer(
    prefix,
    elfClass === 64 ? 40 : 32,
    elfClass === 64 ? 8 : 4,
    littleEndian
  );
  const headerSize = integer(prefix, elfClass === 64 ? 52 : 40, 2, littleEndian);
  const sectionEntrySize = integer(prefix, elfClass === 64 ? 58 : 46, 2, littleEndian);
  const sectionCount = integer(prefix, elfClass === 64 ? 60 : 48, 2, littleEndian);
  const expectedHeaderSize = elfClass === 64 ? 64 : 52;
  const expectedSectionEntrySize = elfClass === 64 ? 64 : 40;

  if (
    headerSize !== expectedHeaderSize ||
    sectionEntrySize !== expectedSectionEntrySize ||
    sectionCount === 0
  ) {
    throw new Error("malformed AppImage ELF section table");
  }

  const offset = sectionOffset + sectionEntrySize * sectionCount;
  if (offset < headerSize || offset > maximumRuntimeBytes || offset + 96 > size) {
    throw new Error("invalid AppImage runtime or archive offset");
  }
  return offset;
}

function integer(buffer: Buffer, offset: number, size: 2 | 4 | 8, littleEndian: boolean) {
  if (size === 2) return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
  if (size === 4) return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);

  const value = littleEndian ? buffer.readBigUInt64LE(offset) : buffer.readBigUInt64BE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("AppImage archive size is too large");
  return Number(value);
}

export function inspectAppImage(
  prefix: Buffer,
  squashfsSuperblocks: Array<{ offset: number; data: Buffer }>,
  size: number,
  architecture: Architecture
): AppImageInspection {
  if (prefix.length < 64 || !prefix.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    throw new Error("malformed AppImage ELF header");
  }

  const elfClass = prefix[4] === 1 ? 32 : prefix[4] === 2 ? 64 : undefined;
  const littleEndian = prefix[5] === 1;
  if (!elfClass || (!littleEndian && prefix[5] !== 2)) {
    throw new Error("unsupported AppImage ELF encoding");
  }

  const runtimeType =
    prefix[8] === 0x41 && prefix[9] === 0x49 && (prefix[10] === 1 || prefix[10] === 2)
      ? prefix[10]
      : undefined;
  if (!runtimeType) throw new Error("missing AppImage runtime marker");

  const executableType = integer(prefix, 16, 2, littleEndian);
  if (executableType !== 2 && executableType !== 3) {
    throw new Error("unexpected AppImage ELF executable type");
  }

  const elfMachine = integer(prefix, 18, 2, littleEndian);
  const expectedMachine = machineByArchitecture[architecture];
  if (
    !expectedMachine ||
    elfMachine !== expectedMachine ||
    elfClass !== classByArchitecture[architecture]
  ) {
    throw new Error(`AppImage ELF machine does not match ${architecture}`);
  }

  if (runtimeType === 1) {
    if (prefix.length < 32_898 || prefix.subarray(32_769, 32_774).toString("ascii") !== "CD001") {
      throw new Error("malformed type 1 AppImage ISO9660 archive");
    }
    const blocks = prefix.readUInt32LE(32_848);
    const blockSize = prefix.readUInt16LE(32_896);
    const bytesUsed = blocks * blockSize;
    if (!blocks || blockSize < 512 || blockSize > 32_768 || bytesUsed > size) {
      throw new Error("invalid type 1 AppImage archive bounds");
    }
    return {
      format: "appimage",
      runtimeType,
      elfClass,
      elfMachine,
      archive: { format: "iso9660", offset: 0, bytesUsed, blockSize },
    };
  }

  const archiveOffset = type2ArchiveOffset(prefix, elfClass, littleEndian, size);
  for (const { offset, data } of squashfsSuperblocks) {
    if (offset !== archiveOffset) continue;
    if (data.length < 96 || !data.subarray(0, 4).equals(squashfsMagic)) continue;
    const inodes = data.readUInt32LE(4);
    const blockSize = data.readUInt32LE(12);
    const major = data.readUInt16LE(28);
    const minor = data.readUInt16LE(30);
    const bytesUsed = integer(data, 40, 8, true);
    if (
      inodes > 0 &&
      inodes <= maximumInodes &&
      blockSize >= 4096 &&
      blockSize <= 1_048_576 &&
      (blockSize & (blockSize - 1)) === 0 &&
      major === 4 &&
      minor === 0 &&
      bytesUsed >= 96 &&
      offset + bytesUsed <= size
    ) {
      return {
        format: "appimage",
        runtimeType,
        elfClass,
        elfMachine,
        archive: { format: "squashfs", offset, bytesUsed, inodes, blockSize },
      };
    }
  }

  throw new Error("malformed or unbounded type 2 AppImage SquashFS archive");
}

export function findSquashfsSuperblocks(data: Buffer, baseOffset: number) {
  const blocks: Array<{ offset: number; data: Buffer }> = [];
  for (
    let position = data.indexOf(squashfsMagic);
    position >= 0;
    position = data.indexOf(squashfsMagic, position + 1)
  ) {
    if (position + 96 <= data.length) {
      blocks.push({
        offset: baseOffset + position,
        data: Buffer.from(data.subarray(position, position + 96)),
      });
    }
  }
  return blocks;
}
