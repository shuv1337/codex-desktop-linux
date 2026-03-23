import test from "node:test";
import assert from "node:assert/strict";

import { parseAppcastXml } from "../scripts/appcast-metadata.mjs";

test("parseAppcastXml parses beta appcast item", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
  <rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0">
    <channel>
      <item>
        <title>26.320.11513</title>
        <pubDate>Fri, 20 Mar 2026 23:58:21 +0000</pubDate>
        <sparkle:version>1119</sparkle:version>
        <sparkle:shortVersionString>26.320.11513</sparkle:shortVersionString>
        <enclosure url="https://persistent.oaistatic.com/codex-app-beta/Codex%20(Beta)-darwin-arm64-26.320.11513.zip" length="178076936" type="application/octet-stream" />
      </item>
    </channel>
  </rss>`;

  const parsed = parseAppcastXml(xml);
  assert.equal(parsed.version, "26.320.11513");
  assert.equal(parsed.buildNumber, "1119");
  assert.equal(parsed.archiveExtension, "zip");
  assert.equal(parsed.archiveFileName, "Codex (Beta)-darwin-arm64-26.320.11513.zip");
});

test("parseAppcastXml parses prod appcast item", () => {
  const xml = `<?xml version="1.0"?>
  <rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0">
    <channel>
      <item>
        <title>26.318.11754</title>
        <pubDate>Thu, 19 Mar 2026 20:25:08 +0000</pubDate>
        <sparkle:version>1100</sparkle:version>
        <sparkle:shortVersionString>26.318.11754</sparkle:shortVersionString>
        <enclosure url="https://persistent.oaistatic.com/codex-app-prod/Codex-darwin-arm64-26.318.11754.zip" length="176789927" type="application/octet-stream"></enclosure>
      </item>
    </channel>
  </rss>`;

  const parsed = parseAppcastXml(xml);
  assert.equal(parsed.version, "26.318.11754");
  assert.equal(parsed.buildNumber, "1100");
  assert.equal(parsed.archiveExtension, "zip");
  assert.equal(parsed.archiveFileName, "Codex-darwin-arm64-26.318.11754.zip");
});

test("parseAppcastXml throws on missing item", () => {
  assert.throws(() => parseAppcastXml("<rss><channel></channel></rss>"), /No <item> found/);
});
