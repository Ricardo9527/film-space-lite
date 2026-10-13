import test from "node:test";
import assert from "node:assert/strict";

import {
  outputFrameCount,
  outputSampleTime,
  validH264Resolution,
} from "../app/output-export.js";

test("deterministic output uses one sample per project frame", () => {
  assert.equal(outputFrameCount(4, 30), 120);
  assert.equal(outputFrameCount(2.71, 30), 82);
  assert.equal(outputSampleTime(0, 30, 4), 0);
  assert.equal(outputSampleTime(119, 30, 4), 119 / 30);
  assert.equal(outputSampleTime(999, 30, 4), 4);
});

test("H.264 output requires bounded even dimensions", () => {
  assert.equal(validH264Resolution({ width: 1920, height: 1080 }), true);
  assert.equal(validH264Resolution({ width: 1080, height: 1920 }), true);
  assert.equal(validH264Resolution({ width: 1919, height: 1080 }), false);
  assert.equal(validH264Resolution({ width: 8, height: 8 }), false);
});
