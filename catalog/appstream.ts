import { XMLParser } from "fast-xml-parser";
import parseSpdxExpression from "spdx-expression-parse";
import { z } from "zod";
import { appstreamMetadataSchema, type DescriptionBlock } from "#catalog/schema";

const flathubSchema = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  description: z.string(),
  developer_name: z.string(),
  project_license: z.string(),
  categories: z.array(z.string()),
  keywords: z.array(z.string()).nullish(),
  mimetypes: z.array(z.string()).nullish(),
  urls: z.object({
    homepage: z.string(),
    vcs_browser: z.string().nullable(),
    bugtracker: z.string().nullable().optional(),
    help: z.string().nullable().optional(),
    contact: z.string().nullable().optional(),
    donation: z.string().nullable().optional(),
    translate: z.string().nullable().optional(),
    contribute: z.string().nullable().optional(),
    faq: z.string().nullable().optional(),
  }),
  content_rating_details: z
    .record(
      z.string(),
      z.object({
        minimumAgeText: z.string(),
        minimumAge: z.number().int().nonnegative(),
        categories: z.array(
          z.object({ level: z.string(), description: z.string().nullable(), id: z.string() })
        ),
      })
    )
    .nullish(),
  icon: z.string(),
  screenshots: z.array(
    z.object({
      default: z.boolean().nullish(),
      caption: z.string().nullable(),
      sizes: z.array(
        z.object({
          src: z.string(),
          width: z.string(),
          height: z.string(),
        })
      ),
    })
  ),
});

type XmlNode = Record<string, XmlNode[] | string>;

const parser = new XMLParser({ preserveOrder: true, trimValues: false });
const metadataParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  isArray: (name) =>
    [
      "name",
      "summary",
      "developer_name",
      "category",
      "keyword",
      "mimetype",
      "mediatype",
      "url",
      "icon",
      "screenshot",
      "image",
      "caption",
      "content_attribute",
    ].includes(name),
});

type SpdxExpression =
  | { license: string; exception?: string }
  | { left: SpdxExpression; conjunction: "and" | "or"; right: SpdxExpression };

const metadataLicenses = new Set([
  "0BSD",
  "BSL-1.0",
  "CC0-1.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "CC-BY-SA-3.0",
  "CC-BY-SA-4.0",
  "FSFAP",
  "FSFUL",
  "FTL",
  "GFDL-1.1",
  "GFDL-1.2",
  "GFDL-1.3",
  "MIT",
]);

function isMetadataLicense(expression: SpdxExpression): boolean {
  if ("license" in expression) {
    return !expression.exception && metadataLicenses.has(expression.license);
  }

  return expression.conjunction === "and"
    ? isMetadataLicense(expression.left) && isMetadataLicense(expression.right)
    : isMetadataLicense(expression.left) || isMetadataLicense(expression.right);
}

function validateMetadataLicense(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("AppStream metadata license is missing");
  }

  try {
    if (isMetadataLicense(parseSpdxExpression(value) as SpdxExpression)) {
      return;
    }
  } catch {
    // Report malformed and unsuitable licenses consistently.
  }

  throw new Error(`AppStream metadata license ${value} is not suitable for redistribution`);
}

function rejectDeclarations(value: string, source: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(value)) {
    throw new Error(`${source} must not contain document declarations or entities`);
  }
}

function text(nodes: XmlNode[], allowed: Set<string>) {
  const parts: Array<{ type: "text" | "emphasis" | "code"; value: string }> = [];

  for (const node of nodes) {
    if (typeof node["#text"] === "string") {
      parts.push({ type: "text", value: node["#text"].replace(/\s+/g, " ") });
      continue;
    }

    const name = Object.keys(node)[0];

    if (!name || !allowed.has(name)) {
      throw new Error(`Unsupported AppStream description element: ${name ?? "unknown"}`);
    }

    const value = text(node[name] as XmlNode[], new Set())
      .map((part) => part.value)
      .join("");

    parts.push({ type: name === "em" ? "emphasis" : "code", value });
  }

  if (parts[0]?.type === "text") {
    parts[0].value = parts[0].value.trimStart();
  }

  if (parts.at(-1)?.type === "text") {
    parts.at(-1)!.value = parts.at(-1)!.value.trimEnd();
  }

  return parts.filter(({ value }) => value.length > 0);
}

export function parseDescription(value: string) {
  rejectDeclarations(value, "AppStream descriptions");

  const document = parser.parse(`<description>${value}</description>`) as XmlNode[];
  const root = document[0]?.description;

  if (!Array.isArray(root)) {
    throw new Error("AppStream description is missing");
  }

  const blocks: DescriptionBlock[] = [];

  for (const node of root) {
    const name = Object.keys(node)[0];

    if (name === "#text" && typeof node[name] === "string" && node[name].trim().length === 0) {
      continue;
    }

    if (name === "p") {
      blocks.push({
        type: "paragraph",
        content: text(node[name] as XmlNode[], new Set(["em", "code"])),
      });
      continue;
    }

    if (name === "ul" || name === "ol") {
      const items = (node[name] as XmlNode[]).flatMap((item) =>
        Array.isArray(item.li) ? [text(item.li, new Set(["em", "code"]))] : []
      );

      blocks.push({ type: name === "ul" ? "unordered-list" : "ordered-list", items });
      continue;
    }

    throw new Error(`Unsupported AppStream description element: ${name ?? "unknown"}`);
  }

  return blocks;
}

export function readFlathubAppstream(value: unknown) {
  const app = flathubSchema.parse(value);
  const rating =
    app.content_rating_details?.en_US ?? Object.values(app.content_rating_details ?? {})[0];
  const warnings = rating?.categories.flatMap(({ level, description }) =>
    level !== "none" && description ? [description] : []
  );
  const links = projectLinks(app.urls);

  return appstreamMetadataSchema.parse({
    id: app.id,
    name: app.name,
    summary: app.summary,
    description: parseDescription(app.description),
    projectLicense: app.project_license,
    developer: { name: app.developer_name },
    homepage: app.urls.homepage,
    ...(app.urls.vcs_browser ? { repository: app.urls.vcs_browser } : {}),
    ...(links ? { links } : {}),
    ...(rating
      ? {
          contentRating: {
            label: rating.minimumAgeText,
            minimumAge: rating.minimumAge,
            ...(warnings?.length ? { warnings } : {}),
          },
        }
      : {}),
    ...(app.keywords?.length ? { keywords: app.keywords } : {}),
    categories: app.categories,
    ...(app.mimetypes?.length ? { mimeTypes: app.mimetypes } : {}),
  });
}

export function readFlathubAssets(value: unknown) {
  const app = flathubSchema.parse(value);

  return {
    icon: app.icon,
    screenshots: app.screenshots
      .toSorted((left, right) => Number(right.default) - Number(left.default))
      .slice(0, 10)
      .map((screenshot) => ({
        caption: screenshot.caption?.trim() ? screenshot.caption : `${app.name} screenshot`,
        source:
          screenshot.sizes.find(({ src }) => src.includes("_orig."))?.src ??
          screenshot.sizes.toSorted(
            (left, right) =>
              Number(right.width) * Number(right.height) - Number(left.width) * Number(left.height)
          )[0]?.src,
      })),
  };
}

function optionalArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function optionalObjects(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object")
      )
    : [];
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function defaultText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.find((item) => typeof item === "string");
  }

  return undefined;
}

function projectLinks(urls: Record<string, unknown>) {
  const types = [
    "bugtracker",
    "help",
    "contact",
    "donation",
    "translate",
    "contribute",
    "faq",
  ] as const;
  const links = Object.fromEntries(
    types.flatMap((type) =>
      typeof urls[type] === "string" && urls[type] ? [[type, urls[type]]] : []
    )
  );

  return Object.keys(links).length ? links : undefined;
}

export function readAppstreamXml(xml: string, expectedId: string) {
  rejectDeclarations(xml, "AppStream XML");

  const parsed = metadataParser.parse(xml) as Record<string, unknown>;
  const components = parsed.components as Record<string, unknown> | undefined;

  if (components) {
    throw new Error("AppStream collection documents are not supported; provide one MetaInfo file");
  }

  const component = parsed.component as Record<string, unknown> | undefined;

  if (!component) {
    throw new Error("AppStream component is missing");
  }

  if (component.type !== "desktop-application") {
    const type = typeof component.type === "string" ? component.type : "unknown";

    throw new Error(`AppStream component has type ${type}, expected desktop-application`);
  }

  validateMetadataLicense(component.metadata_license);

  const id = defaultText(component.id);

  if (id !== expectedId) {
    throw new Error(`AppStream component has id ${id ?? "unknown"}, expected ${expectedId}`);
  }

  const descriptions = [...xml.matchAll(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/g)];
  const description = descriptions.find(([opening]) => !opening.includes("xml:lang="))?.[1];
  const urls = (Array.isArray(component.url) ? component.url : []) as Array<
    Record<string, unknown>
  >;
  const developer = component.developer as Record<string, unknown> | undefined;
  const categories = component.categories as Record<string, unknown> | undefined;
  const keywords = component.keywords as Record<string, unknown> | undefined;
  const provides = component.provides as Record<string, unknown> | undefined;
  const mimetypes = component.mimetypes as Record<string, unknown> | undefined;
  const contentRating = component.content_rating as Record<string, unknown> | undefined;
  const screenshots = component.screenshots as Record<string, unknown> | undefined;

  const url = (type: string) =>
    urls.find((item) => item.type === type)?.["#text"] ??
    urls.find((item) => item.type === type)?.text;

  if (!description) {
    throw new Error("Default AppStream description is missing");
  }

  const homepage = url("homepage");
  const repository = url("vcs-browser");
  const name = defaultText(component.name);
  const keywordValues = optionalArray(keywords?.keyword);
  const mimeTypes = optionalArray(mimetypes?.mimetype ?? provides?.mediatype);
  const contentAttributes = (
    Array.isArray(contentRating?.content_attribute) ? contentRating.content_attribute : []
  ) as Array<Record<string, unknown>>;
  const warnings = contentAttributes.flatMap((attribute) =>
    typeof attribute.id === "string" &&
    typeof attribute["#text"] === "string" &&
    attribute["#text"] !== "none"
      ? [
          `${attribute.id.replaceAll("-", " ").replace(/^./, (character) => character.toUpperCase())}: ${attribute["#text"]}`,
        ]
      : []
  );
  const links = projectLinks(
    Object.fromEntries(
      urls.flatMap((item) =>
        typeof item.type === "string" && typeof (item["#text"] ?? item.text) === "string"
          ? [[item.type, item["#text"] ?? item.text]]
          : []
      )
    )
  );

  const remoteIcon = optionalObjects(component.icon).find(
    (icon) => icon.type === "remote" && isHttpsUrl(icon["#text"])
  )?.["#text"] as string | undefined;
  const remoteScreenshots = optionalObjects(screenshots?.screenshot)
    .flatMap((screenshot) => {
      const source = optionalObjects(screenshot.image).find(
        (image) => image.type === "source" && isHttpsUrl(image["#text"])
      )?.["#text"] as string | undefined;

      return source
        ? [{ caption: defaultText(screenshot.caption) ?? `${name} screenshot`, source }]
        : [];
    })
    .slice(0, 10);

  const metadata = appstreamMetadataSchema.parse({
    id,
    name,
    summary: defaultText(component.summary),
    description: parseDescription(description),
    projectLicense: defaultText(component.project_license),
    developer: { name: defaultText(developer?.name ?? component.developer_name) },
    homepage,
    ...(repository ? { repository } : {}),
    ...(links ? { links } : {}),
    ...(typeof contentRating?.type === "string"
      ? {
          contentRating: {
            scheme: contentRating.type,
            ...(warnings.length ? { warnings } : {}),
          },
        }
      : {}),
    ...(keywordValues.length ? { keywords: keywordValues } : {}),
    categories: optionalArray(categories?.category),
    ...(mimeTypes.length ? { mimeTypes } : {}),
  });

  return {
    metadata,
    media: {
      ...(remoteIcon ? { icon: remoteIcon } : {}),
      ...(remoteScreenshots.length ? { screenshots: remoteScreenshots } : {}),
    },
  };
}
