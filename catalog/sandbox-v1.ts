import { z } from "zod";

const filesystemLocationSchema = z.enum([
  "home",
  "desktop",
  "documents",
  "downloads",
  "music",
  "pictures",
  "public-share",
  "templates",
  "videos",
  "removable-media",
]);

const filesystemRuleSchema = z
  .object({
    location: filesystemLocationSchema,
    access: z.enum(["read-only", "read-write"]),
  })
  .strict();

const busRuleSchema = z
  .object({
    name: z
      .string()
      .min(3)
      .max(255)
      .regex(/^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)+$/),
    access: z.enum(["see", "talk", "own"]),
  })
  .strict();

const uniqueBy = <T>(values: T[], key: (value: T) => string) =>
  new Set(values.map(key)).size === values.length;

const filteredBusRulesSchema = z
  .array(busRuleSchema)
  .min(1)
  .max(50)
  .refine((rules) => uniqueBy(rules, ({ name }) => name), "D-Bus names must be unique");

const busAccessSchema = z.discriminatedUnion("access", [
  z.object({ access: z.literal("none"), rules: z.array(busRuleSchema).length(0) }).strict(),
  z.object({ access: z.literal("filtered"), rules: filteredBusRulesSchema }).strict(),
  z.object({ access: z.literal("full"), rules: z.array(busRuleSchema).length(0) }).strict(),
]);

export const sandboxV1Schema = z
  .object({
    network: z.enum(["none", "full"]),
    display: z.enum(["none", "wayland", "x11", "wayland-or-x11"]),
    audio: z.enum(["none", "full"]),
    processes: z.enum(["isolated", "full"]),
    ipc: z.boolean(),
    filesystem: z
      .array(filesystemRuleSchema)
      .max(filesystemLocationSchema.options.length)
      .refine(
        (rules) => uniqueBy(rules, ({ location }) => location),
        "Filesystem locations must be unique"
      ),
    devices: z
      .array(z.enum(["gpu", "input", "camera", "usb", "serial", "optical", "fuse", "kvm"]))
      .max(8)
      .refine((devices) => uniqueBy(devices, (device) => device), "Devices must be unique"),
    sessionBus: busAccessSchema,
    systemBus: busAccessSchema,
  })
  .strict()
  .describe(
    "Host access the app needs. Every app gets private storage and all unlisted access is denied."
  )
  .meta({ title: "AppHub sandbox v1" });

export type SandboxV1 = z.infer<typeof sandboxV1Schema>;
