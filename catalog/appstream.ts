import { XMLParser } from "fast-xml-parser";
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
  }),
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

interface XmlNode {
  [name: string]: XmlNode[] | string;
}

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
    ].includes(name),
});

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
  const document = parser.parse(`<description>${value}</description>`) as XmlNode[];
  const root = document[0]?.description;

  if (!Array.isArray(root)) {
    throw new Error("AppStream description is missing");
  }

  const blocks: DescriptionBlock[] = [];

  for (const node of root) {
    const name = Object.keys(node)[0];

    if (name === "#text" && String(node[name]).trim().length === 0) {
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

  return appstreamMetadataSchema.parse({
    id: app.id,
    name: app.name,
    summary: app.summary,
    description: parseDescription(app.description),
    projectLicense: app.project_license,
    developer: { name: app.developer_name },
    homepage: app.urls.homepage,
    ...(app.urls.vcs_browser ? { repository: app.urls.vcs_browser } : {}),
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
      .sort((left, right) => Number(right.default) - Number(left.default))
      .slice(0, 10)
      .map((screenshot) => ({
        caption: screenshot.caption || `${app.name} screenshot`,
        source:
          screenshot.sizes.find(({ src }) => src.includes("_orig."))?.src ??
          screenshot.sizes.sort(
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

function defaultText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.find((item) => typeof item === "string");
  }

  return undefined;
}

export function readAppstreamXml(xml: string, expectedId: string) {
  const parsed = metadataParser.parse(xml) as Record<string, unknown>;
  const component = (parsed.component ??
    (parsed.components as Record<string, unknown>)?.component) as
    Record<string, unknown> | undefined;

  if (!component) {
    throw new Error("AppStream component is missing");
  }

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

  const url = (type: string) =>
    urls.find((item) => item.type === type)?.["#text"] ??
    urls.find((item) => item.type === type)?.["text"];

  if (!description) {
    throw new Error("Default AppStream description is missing");
  }

  const homepage = url("homepage");
  const repository = url("vcs-browser");
  const keywordValues = optionalArray(keywords?.keyword);
  const mimeTypes = optionalArray(mimetypes?.mimetype ?? provides?.mediatype);

  return appstreamMetadataSchema.parse({
    id,
    name: defaultText(component.name),
    summary: defaultText(component.summary),
    description: parseDescription(description),
    projectLicense: defaultText(component.project_license),
    developer: { name: defaultText(developer?.name ?? component.developer_name) },
    homepage,
    ...(repository ? { repository } : {}),
    ...(keywordValues.length ? { keywords: keywordValues } : {}),
    categories: optionalArray(categories?.category),
    ...(mimeTypes.length ? { mimeTypes } : {}),
  });
}
