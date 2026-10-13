import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  circleOfConfusionRadiusPixels,
  maximumBokehRadiusPixels,
  normalizeDepthOfFieldOptics,
  signedCircleOfConfusionRadiusPixels,
  vogelDiskKernel,
} from "../app/camera-depth-of-field-model.js";

const screenshotOptics = {
  focusDistance: 3.87,
  focalLength: 35,
  sensorWidth: 36,
  imageWidth: 1920,
};

const depthOfFieldRendererSource = await readFile(
  new URL("../app/camera-depth-of-field.js", import.meta.url),
  "utf8",
);

test("the physical circle of confusion is zero on the focus plane", () => {
  assert.equal(circleOfConfusionRadiusPixels({
    ...screenshotOptics,
    aperture: 2.8,
    objectDistance: screenshotOptics.focusDistance,
  }), 0);
});

test("35 mm at f/16 and 3.87 m focus stays effectively sharp around the actors", () => {
  const radius = circleOfConfusionRadiusPixels({
    ...screenshotOptics,
    aperture: 16,
    objectDistance: 3,
  });
  assert.ok(radius < 0.2, `expected a sub-pixel radius, received ${radius}`);
});

test("opening the aperture and lengthening the lens increase optical blur", () => {
  const stoppedDown = circleOfConfusionRadiusPixels({
    ...screenshotOptics,
    aperture: 16,
    objectDistance: 2,
  });
  const open35 = circleOfConfusionRadiusPixels({
    ...screenshotOptics,
    aperture: 2.8,
    objectDistance: 2,
  });
  const open85 = circleOfConfusionRadiusPixels({
    ...screenshotOptics,
    aperture: 2.8,
    focalLength: 85,
    objectDistance: 2,
  });
  assert.ok(open35 > stoppedDown * 5);
  assert.ok(open85 > open35 * 5);
});

test("signed circle of confusion separates foreground from background", () => {
  const optics = {
    focusDistance: 5,
    aperture: 2.8,
    focalLength: 50,
    sensorWidth: 36,
    imageWidth: 1920,
  };
  assert.ok(signedCircleOfConfusionRadiusPixels({ ...optics, objectDistance: 3 }) < 0);
  assert.equal(signedCircleOfConfusionRadiusPixels({ ...optics, objectDistance: 5 }), 0);
  assert.ok(signedCircleOfConfusionRadiusPixels({ ...optics, objectDistance: 8 }) > 0);
});

test("physical blur scales with output pixel density and optics normalize safely", () => {
  const hd = circleOfConfusionRadiusPixels({
    ...screenshotOptics,
    aperture: 2.8,
    objectDistance: 2,
  });
  const uhd = circleOfConfusionRadiusPixels({
    ...screenshotOptics,
    aperture: 2.8,
    objectDistance: 2,
    imageWidth: 3840,
  });
  assert.ok(Math.abs(uhd - hd * 2) < 1e-10);
  assert.deepEqual(normalizeDepthOfFieldOptics({}), {
    focusDistance: 5,
    aperture: 2.8,
    focalLength: 35,
    sensorWidth: 36,
  });
});

test("the dense blur kernel fills the aperture without repeated directions", () => {
  const kernel = vogelDiskKernel(64);
  assert.equal(kernel.length, 64);
  assert.equal(new Set(kernel.map(({ x, y }) => `${x.toFixed(6)},${y.toFixed(6)}`)).size, 64);
  assert.ok(kernel.every(({ x, y }) => Math.hypot(x, y) < 1));
  assert.ok(Math.max(...kernel.map(({ x, y }) => Math.hypot(x, y))) > 0.99);
  assert.ok(Math.abs(kernel.reduce((sum, point) => sum + point.x, 0) / kernel.length) < 0.02);
  assert.ok(Math.abs(kernel.reduce((sum, point) => sum + point.y, 0) / kernel.length) < 0.02);
});

test("the bokeh quality cap scales with the image before its desktop ceiling", () => {
  assert.equal(maximumBokehRadiusPixels(240), 12);
  assert.equal(maximumBokehRadiusPixels(1000), 50);
  assert.equal(maximumBokehRadiusPixels(1920), 96);
  assert.equal(maximumBokehRadiusPixels(3840), 96);
});

test("a wide lens keeps nearby depth differences sharp while a telephoto lens separates them", () => {
  const wideRadius = circleOfConfusionRadiusPixels({
    focusDistance: 5.1,
    aperture: 1.8,
    focalLength: 22.7,
    sensorWidth: 36,
    imageWidth: 1920,
    objectDistance: 4.3,
  });
  const telephotoRadius = circleOfConfusionRadiusPixels({
    focusDistance: 20,
    aperture: 1.4,
    focalLength: 85,
    sensorWidth: 36,
    imageWidth: 1920,
    objectDistance: 4.3,
  });
  assert.ok(wideRadius < 0.3, `expected a nearly sharp wide-lens foreground, received ${wideRadius}`);
  assert.ok(telephotoRadius > 25, `expected visible telephoto bokeh, received ${telephotoRadius}`);
});

test("foreground geometry remains opaque while its blur weight changes", () => {
  assert.match(
    depthOfFieldRendererSource,
    /float coverage = step\(0\.000001, coc\.g\);/,
  );
  assert.match(
    depthOfFieldRendererSource,
    /float blendNear = clamp\(nearInfluence\.r, 0\.0, 1\.0\);/,
  );
  assert.match(
    depthOfFieldRendererSource,
    /vec3 result = mix\(farResult, blurredNearResult, blendNear\);/,
  );
  assert.doesNotMatch(
    depthOfFieldRendererSource,
    /float coverage = texture2D\(tCoC, vUv\)\.r;/,
  );
});
