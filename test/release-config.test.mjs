import test from "node:test";
import assert from "node:assert/strict";

import { getChannel, releaseTagFor, releaseVersionFor } from "../scripts/release/config.mjs";

test("getChannel resolves beta and prod", () => {
  assert.equal(getChannel("beta").name, "beta");
  assert.equal(getChannel("prod").name, "prod");
});

test("releaseVersionFor formats beta version", () => {
  const version = releaseVersionFor("beta", {
    version: "26.320.11513",
    buildNumber: "1119"
  }, 1);

  assert.equal(version, "26.320.11513-beta.1119.linux.1");
});

test("releaseVersionFor formats prod version", () => {
  const version = releaseVersionFor("prod", {
    version: "26.318.11754",
    buildNumber: "1100"
  }, 1);

  assert.equal(version, "26.318.11754.linux.1");
  assert.equal(releaseTagFor(version), "v26.318.11754.linux.1");
});
