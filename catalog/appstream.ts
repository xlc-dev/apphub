import { XMLParser } from "fast-xml-parser";
import parseSpdxExpression from "spdx-expression-parse";
import { appstreamMetadataSchema, type DescriptionBlock } from "#catalog/schema";
import { normalizeLocale } from "#catalog/localization";

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
      "category",
      "keyword",
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

  if (expression.conjunction === "and") {
    return isMetadataLicense(expression.left) && isMetadataLicense(expression.right);
  }

  return isMetadataLicense(expression.left) || isMetadataLicense(expression.right);
}

function validateMetadataLicense(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("AppStream metadata license is missing");
  }

  const unsuitable = new Error(
    `AppStream metadata license ${value} is not suitable for redistribution`
  );

  try {
    if (isMetadataLicense(parseSpdxExpression(value) as SpdxExpression)) {
      return;
    }
  } catch {
    throw unsuitable;
  }

  throw unsuitable;
}

function rejectDeclarations(value: string, source: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(value)) {
    throw new Error(`${source} must not contain document declarations or entities`);
  }
}

function validateXml(value: string, source: string) {
  const elements: string[] = [];
  const tokens = value.matchAll(
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?\s*([A-Za-z_][\w:.-]*)\b[^<>]*>/g
  );
  let end = 0;
  let roots = 0;
  let tags = 0;

  for (const match of tokens) {
    if (value.slice(end, match.index).includes("<")) {
      throw new Error(`${source} is malformed XML`);
    }

    end = match.index + match[0].length;

    const name = match[1];

    if (!name) continue;

    tags++;

    if (tags > 10_000) throw new Error(`${source} contains too many elements`);

    if (/^<\s*\//.test(match[0])) {
      if (elements.pop() !== name) throw new Error(`${source} is malformed XML`);
      continue;
    }

    if (elements.length === 0) roots++;

    if (!/\/\s*>$/.test(match[0])) {
      elements.push(name);
      if (elements.length > 64) throw new Error(`${source} is nested too deeply`);
    }
  }

  if (value.slice(end).includes("<") || elements.length || roots !== 1) {
    throw new Error(`${source} is malformed XML`);
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

  const documentXml = `<description>${value}</description>`;

  validateXml(documentXml, "AppStream descriptions");

  const document = parser.parse(documentXml) as XmlNode[];
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

interface LocalizedText {
  default?: string;
  translations: Record<string, string>;
}

function localizedText(value: unknown): LocalizedText {
  const values = Array.isArray(value) ? value : [value];
  const result: LocalizedText = { translations: {} };

  for (const item of values) {
    if (typeof item === "string") {
      result.default ??= item;
      continue;
    }

    if (!item || typeof item !== "object") continue;

    const entry = item as Record<string, unknown>;
    if (entry.lang !== undefined) {
      throw new Error("AppStream translations must use xml:lang");
    }

    const text = entry["#text"];
    const language = entry["xml:lang"];

    if (typeof text !== "string") continue;

    if (typeof language !== "string") {
      result.default ??= text;
      continue;
    }

    const locale = normalizeLocale(language);

    if (result.translations[locale] !== undefined) {
      throw new Error(`Duplicate AppStream translation for ${locale}`);
    }

    result.translations[locale] = text;
  }

  return result;
}

function addTranslations(
  translations: Record<string, Record<string, unknown>>,
  field: string,
  values: Record<string, unknown>
) {
  for (const [locale, value] of Object.entries(values)) {
    const translation = (translations[locale] ??= {});

    if (translation[field] !== undefined) {
      throw new Error(`Duplicate AppStream ${field} translation for ${locale}`);
    }

    translation[field] = value;
  }
}

export function projectLinks(urls: Record<string, unknown>) {
  const types = [
    "bugtracker",
    "help",
    "contact",
    "donation",
    "translate",
    "contribute",
    "faq",
  ] as const;
  const links: Record<string, string> = {};

  for (const type of types) {
    const url = urls[type];

    if (typeof url === "string" && url) links[type] = url;
  }

  return Object.keys(links).length ? links : undefined;
}

function readWarnings(value: unknown) {
  const warnings: string[] = [];
  const translations: Record<string, string[]> = {};

  for (const attribute of optionalObjects(value)) {
    if (typeof attribute.id !== "string") continue;

    const values = localizedText(attribute);
    const label = attribute.id
      .replaceAll("-", " ")
      .replace(/^./, (character) => character.toUpperCase());

    if (values.default && values.default !== "none") {
      warnings.push(`${label}: ${values.default}`);
    }

    for (const [locale, translated] of Object.entries(values.translations)) {
      if (translated !== "none") {
        (translations[locale] ??= []).push(`${label}: ${translated}`);
      }
    }
  }

  return { warnings, translations };
}

interface RemoteScreenshot {
  caption: string;
  captionTranslations?: Record<string, string>;
  source: string;
}

function readRemoteScreenshots(value: unknown, appName: string) {
  const screenshots: RemoteScreenshot[] = [];

  for (const screenshot of optionalObjects(value)) {
    const image = optionalObjects(screenshot.image).find(
      (item) => item.type === "source" && isHttpsUrl(item["#text"])
    );
    const source = image?.["#text"];

    if (!isHttpsUrl(source)) continue;

    const captions = localizedText(screenshot.caption);
    const result: RemoteScreenshot = {
      caption: captions.default ?? `${appName} screenshot`,
      source,
    };

    if (Object.keys(captions.translations).length) {
      result.captionTranslations = captions.translations;
    }

    screenshots.push(result);

    if (screenshots.length === 10) break;
  }

  return screenshots;
}

function readUrlValues(urls: Array<Record<string, unknown>>) {
  const values: Record<string, string> = {};

  for (const item of urls) {
    if (typeof item.type === "string" && typeof item["#text"] === "string") {
      values[item.type] = item["#text"];
    }
  }

  return values;
}

function readComponent(xml: string, expectedId: string) {
  rejectDeclarations(xml, "AppStream XML");
  validateXml(xml, "AppStream XML");

  const parsed = metadataParser.parse(xml) as Record<string, unknown>;

  if (parsed.components) {
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

  if (component.developer_name !== undefined) {
    throw new Error("AppStream developer_name is not supported; use developer/name");
  }

  if (component.mimetypes !== undefined) {
    throw new Error("AppStream mimetypes is not supported; use provides/mediatype");
  }

  validateMetadataLicense(component.metadata_license);

  const id = defaultText(component.id);

  if (id !== expectedId) {
    throw new Error(`AppStream component has id ${id ?? "unknown"}, expected ${expectedId}`);
  }

  return { component, id };
}

export function readAppstreamXml(xml: string, expectedId: string) {
  const { component, id } = readComponent(xml, expectedId);

  const descriptions = [...xml.matchAll(/<description([^>]*)>([\s\S]*?)<\/description>/g)];
  const description = descriptions.find(
    ([, attributes]) => !attributes?.includes("xml:lang=")
  )?.[2];
  const urls = (Array.isArray(component.url) ? component.url : []) as Array<
    Record<string, unknown>
  >;
  const developer = component.developer as Record<string, unknown> | undefined;
  const categories = component.categories as Record<string, unknown> | undefined;
  const keywords = component.keywords as Record<string, unknown> | undefined;
  const provides = component.provides as Record<string, unknown> | undefined;
  const contentRating = component.content_rating as Record<string, unknown> | undefined;
  const screenshots = component.screenshots as Record<string, unknown> | undefined;

  const url = (type: string) => urls.find((item) => item.type === type)?.["#text"];

  if (!description) {
    throw new Error("Default AppStream description is missing");
  }

  const homepage = url("homepage");
  const repository = url("vcs-browser");
  const names = localizedText(component.name);
  const summaries = localizedText(component.summary);
  const developerNames = localizedText(developer?.name);
  const keywordEntries = Array.isArray(keywords?.keyword) ? keywords.keyword : [];
  const keywordValues = keywordEntries.flatMap((keyword) => {
    const localized = localizedText(keyword);

    return localized.default ? [localized.default] : [];
  });
  const mimeTypes = optionalArray(provides?.mediatype);
  const { warnings, translations: warningTranslations } = readWarnings(
    contentRating?.content_attribute
  );
  const links = projectLinks(readUrlValues(urls));

  const remoteIcon = optionalObjects(component.icon).find(
    (icon) => icon.type === "remote" && isHttpsUrl(icon["#text"])
  )?.["#text"] as string | undefined;
  const remoteScreenshots = readRemoteScreenshots(screenshots?.screenshot, names.default ?? id);

  const translations: Record<string, Record<string, unknown>> = {};

  addTranslations(translations, "name", names.translations);
  addTranslations(translations, "summary", summaries.translations);
  addTranslations(translations, "developerName", developerNames.translations);

  for (const match of descriptions) {
    const language = match[1]?.match(/xml:lang=["']([^"']+)["']/)?.[1];

    if (language && match[2]) {
      addTranslations(translations, "description", {
        [normalizeLocale(language)]: parseDescription(match[2]),
      });
    }
  }

  const translatedKeywords: Record<string, string[]> = {};

  for (const keyword of keywordEntries) {
    for (const [locale, value] of Object.entries(localizedText(keyword).translations)) {
      (translatedKeywords[locale] ??= []).push(value);
    }
  }
  addTranslations(translations, "keywords", translatedKeywords);

  for (const [locale, translatedWarnings] of Object.entries(warningTranslations)) {
    (translations[locale] ??= {}).contentRating = { warnings: translatedWarnings };
  }

  const metadata = appstreamMetadataSchema.parse({
    id,
    name: names.default,
    summary: summaries.default,
    description: parseDescription(description),
    projectLicense: defaultText(component.project_license),
    developer: { name: developerNames.default },
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
    ...(Object.keys(translations).length ? { translations } : {}),
  });

  return {
    metadata,
    media: {
      ...(remoteIcon ? { icon: remoteIcon } : {}),
      ...(remoteScreenshots.length ? { screenshots: remoteScreenshots } : {}),
    },
  };
}
