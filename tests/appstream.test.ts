import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseDescription, readAppstreamXml } from "#catalog/appstream";

describe("AppStream metadata", () => {
  test("preserves supported description structure", () => {
    assert.deepEqual(
      parseDescription("<p>Use <em>simple</em> <code>text</code>.</p><ul><li>First</li></ul>"),
      [
        {
          type: "paragraph",
          content: [
            { type: "text", value: "Use " },
            { type: "emphasis", value: "simple" },
            { type: "text", value: " " },
            { type: "code", value: "text" },
            { type: "text", value: "." },
          ],
        },
        {
          type: "unordered-list",
          items: [[{ type: "text", value: "First" }]],
        },
      ]
    );
  });

  test("rejects document declarations and custom entities", () => {
    assert.throws(
      () => parseDescription('<!DOCTYPE p [<!ENTITY x "value">]><p>&x;</p>'),
      /must not contain/
    );
  });

  test("decodes standard XML entities", () => {
    assert.deepEqual(parseDescription("<p>A &amp; B</p>"), [
      { type: "paragraph", content: [{ type: "text", value: "A & B" }] },
    ]);
  });

  test("reads a direct MetaInfo document", () => {
    const metadata = readAppstreamXml(
      `
          <component type="desktop-application">
            <id>org.example.App</id>
            <name>Example</name>
            <summary>Do example things</summary>
            <description><p>An example app.</p></description>
            <project_license>MIT</project_license>
            <developer><name>Example Developers</name></developer>
            <url type="homepage">https://example.org/</url>
            <url type="vcs-browser">https://example.org/source</url>
            <categories><category>Utility</category></categories>
            <keywords><keyword>example</keyword></keywords>
            <provides><mediatype>text/plain</mediatype></provides>
          </component>
        `,
      "org.example.App"
    );

    assert.deepEqual(
      {
        id: metadata.id,
        name: metadata.name,
        repository: metadata.repository,
        keywords: metadata.keywords,
        mimeTypes: metadata.mimeTypes,
      },
      {
        id: "org.example.App",
        name: "Example",
        repository: "https://example.org/source",
        keywords: ["example"],
        mimeTypes: ["text/plain"],
      }
    );
  });
});
