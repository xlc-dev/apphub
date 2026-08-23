import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { downloadCounts, downloadHistorySchema, sumReleaseDownloads } from "#catalog/downloads";

const history = downloadHistorySchema.parse({
  snapshots: [
    { date: "2026-07-01", apps: { "org.example.First": 10 } },
    { date: "2026-07-24", apps: { "org.example.First": 40 } },
    {
      date: "2026-07-31",
      apps: { "org.example.First": 55, "org.example.New": 100 },
    },
  ],
});

describe("download history", () => {
  test("returns the latest totals for all-time rankings", () => {
    assert.deepEqual(downloadCounts(history), {
      "org.example.First": 55,
      "org.example.New": 100,
    });
  });

  test("calculates downloads since the requested baseline", () => {
    assert.deepEqual(downloadCounts(history, 7), { "org.example.First": 15 });
    assert.deepEqual(downloadCounts(history, 30), { "org.example.First": 45 });
  });

  test("requires enough history for a trend", () => {
    assert.equal(downloadCounts({ snapshots: [history.snapshots[2]!] }, 7), null);
  });

  test("uses the latest baseline before a missed snapshot date", () => {
    assert.deepEqual(
      downloadCounts(
        {
          snapshots: [
            { date: "2026-07-23", apps: { "org.example.App": 10 } },
            { date: "2026-07-31", apps: { "org.example.App": 25 } },
          ],
        },
        7
      ),
      { "org.example.App": 15 }
    );
  });

  test("rejects duplicate or unordered snapshots", () => {
    assert.throws(
      () =>
        downloadHistorySchema.parse({
          snapshots: [history.snapshots[1], history.snapshots[0]],
        }),
      /unique and ordered/
    );
  });

  test("does not report negative download changes", () => {
    assert.deepEqual(
      downloadCounts(
        {
          snapshots: [
            { date: "2026-07-01", apps: { "org.example.App": 10 } },
            { date: "2026-07-08", apps: { "org.example.App": 5 } },
          ],
        },
        7
      ),
      { "org.example.App": 0 }
    );
  });
});

describe("forge download totals", () => {
  test("counts stable AppImage assets only", () => {
    assert.equal(
      sumReleaseDownloads([
        {
          draft: false,
          prerelease: false,
          assets: [
            { name: "Example-x86_64.AppImage", download_count: 10 },
            { name: "Example.AppImage.zsync", download_count: 20 },
          ],
        },
        {
          draft: false,
          prerelease: true,
          assets: [{ name: "Example.AppImage", download_count: 30 }],
        },
        {
          draft: true,
          prerelease: false,
          assets: [{ name: "Example.AppImage", download_count: 40 }],
        },
      ]),
      10
    );
  });
});
