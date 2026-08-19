export function formatBytes(bytes: number) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = units[0]!;

  for (let index = 1; value >= 1024 && index < units.length; index++) {
    value /= 1024;
    unit = units[index]!;
  }

  return `${value >= 10 || unit === "B" ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}
