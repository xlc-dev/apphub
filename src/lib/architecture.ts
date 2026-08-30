export function normalizeArchitecture(value: string, bitness = "") {
  const architecture = value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");

  if (/^(x8664|amd64|x64)$/.test(architecture) || (architecture === "x86" && bitness === "64")) {
    return "x86_64";
  }

  if (/^i[3-6]86$/.test(architecture) || architecture === "x86") {
    return "i686";
  }

  if (/^(aarch64|arm64)$/.test(architecture) || (architecture === "arm" && bitness === "64")) {
    return "aarch64";
  }

  if (/^(armv7l|armv7|armhf)$/.test(architecture) || architecture === "arm") {
    return "armv7l";
  }

  if (["riscv64", "ppc64le", "s390x"].includes(architecture)) {
    return architecture;
  }

  return undefined;
}

export function isMobileDevice(userAgent: string, clientHint = false) {
  return clientHint || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}
