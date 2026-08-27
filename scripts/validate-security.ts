import { readFile, readdir } from "node:fs/promises";

const pages = (await readdir("dist", { recursive: true })).filter((path) => path.endsWith(".html"));
const directives = [
  "base-uri 'none'",
  "connect-src 'self'",
  "default-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
];
let validated = 0;

for (const path of pages) {
  const html = await readFile(`dist/${path}`, "utf8");

  if (html.includes('<meta http-equiv="refresh"')) continue;

  const policy = /<meta http-equiv="content-security-policy" content="([^"]+)">/.exec(html)?.[1];

  if (!policy) throw new Error(`${path}: missing Content Security Policy`);

  if (html.indexOf("<script") < html.indexOf('<meta http-equiv="content-security-policy"')) {
    throw new Error(`${path}: script appears before Content Security Policy`);
  }

  for (const directive of directives) {
    if (!policy.includes(directive)) throw new Error(`${path}: missing CSP ${directive}`);
  }

  if (policy.includes("'unsafe-inline'") || policy.includes("'unsafe-eval'")) {
    throw new Error(`${path}: CSP permits unsafe script or style execution`);
  }

  if (/<[A-Za-z][^>]*\sstyle=/.test(html)) {
    throw new Error(`${path}: inline style attribute is incompatible with CSP`);
  }

  validated++;
}

console.log(`Validated Content Security Policy on ${validated} pages.`);
