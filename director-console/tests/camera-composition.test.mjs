import test from "node:test";
import assert from "node:assert/strict";

import {
  aspectRatioValue,
  cameraCompositionGuideGeometry,
  cameraCompositionGuideTypes,
  cameraCompositionGuideVanishingPointAfterKey,
  cameraSensorGate,
  defaultCameraCompositionGuideState,
  fitOutputFrame,
  normalizeCameraCompositionGuideState,
  output1080Resolution,
  outputResolutionForAspect,
  outputVerticalFov,
  overscanVerticalFov,
  withOutputCameraProjection,
} from "../app/camera-composition.js";

test("camera composition guides default off and normalize transient editor state", () => {
  assert.deepEqual(defaultCameraCompositionGuideState(), {
    type: "none",
    direction: "normal",
    vanishingPoint: { x: 0.5, y: 0.5 },
  });
  assert.deepEqual(normalizeCameraCompositionGuideState({
    type: "one-point",
    direction: "mirror",
    vanishingPoint: { x: 1.3, y: -0.2 },
  }), {
    type: "one-point",
    direction: "mirror",
    vanishingPoint: { x: 1, y: 0 },
  });
  assert.deepEqual(normalizeCameraCompositionGuideState({ type: "unknown" }), {
    type: "none",
    direction: "normal",
    vanishingPoint: { x: 0.5, y: 0.5 },
  });
});

test("golden triangle branches stay perpendicular in physical frame space and mirror cleanly", () => {
  for (const aspectRatio of [16 / 9, 9 / 16]) {
    for (const direction of ["normal", "mirror"]) {
      const geometry = cameraCompositionGuideGeometry({
        type: "golden-triangle",
        direction,
      }, aspectRatio);
      const main = geometry.lines[0];
      for (const branch of geometry.lines.slice(1)) {
        const mainVector = {
          x: (main.to.x - main.from.x) * aspectRatio,
          y: main.to.y - main.from.y,
        };
        const branchVector = {
          x: (branch.to.x - branch.from.x) * aspectRatio,
          y: branch.to.y - branch.from.y,
        };
        assert.ok(Math.abs(mainVector.x * branchVector.x + mainVector.y * branchVector.y) < 1e-10);
      }
    }
    const normal = cameraCompositionGuideGeometry({
      type: "golden-triangle",
      direction: "normal",
    }, aspectRatio);
    const mirror = cameraCompositionGuideGeometry({
      type: "golden-triangle",
      direction: "mirror",
    }, aspectRatio);
    assert.deepEqual(
      mirror.lines.map((line) => [line.from.x, line.to.x]),
      normal.lines.map((line) => [1 - line.from.x, 1 - line.to.x])
    );
  }
});

test("diagonal method remains 45 degrees on landscape and portrait frames", () => {
  for (const aspectRatio of [16 / 9, 9 / 16]) {
    const geometry = cameraCompositionGuideGeometry({ type: "diagonal" }, aspectRatio);
    assert.equal(geometry.lines.length, 4);
    for (const line of geometry.lines) {
      const physicalWidth = Math.abs(line.to.x - line.from.x) * aspectRatio;
      const physicalHeight = Math.abs(line.to.y - line.from.y);
      assert.ok(Math.abs(physicalWidth - physicalHeight) < 1e-10);
    }
  }
  assert.equal(
    cameraCompositionGuideGeometry({ type: "diagonal" }, "1:1").lines.length,
    2,
    "square frames should not draw the same two diagonals twice"
  );
});

test("one-point guide supports clamped dragging state and keyboard adjustment", () => {
  assert.deepEqual(
    cameraCompositionGuideVanishingPointAfterKey({ x: 0.5, y: 0.5 }, "ArrowLeft"),
    { x: 0.49, y: 0.5 }
  );
  assert.deepEqual(
    cameraCompositionGuideVanishingPointAfterKey({ x: 0.98, y: 0.02 }, "ArrowRight", { shiftKey: true }),
    { x: 1, y: 0.02 }
  );
  assert.deepEqual(
    cameraCompositionGuideVanishingPointAfterKey({ x: 0.2, y: 0.8 }, "Home"),
    { x: 0.5, y: 0.5 }
  );
  const geometry = cameraCompositionGuideGeometry({
    type: "one-point",
    vanishingPoint: { x: 0.64, y: 0.42 },
  }, "16:9");
  assert.equal(geometry.interactive, true);
  assert.deepEqual(geometry.vanishingPoint, { x: 0.64, y: 0.42 });
  assert.equal(geometry.lines.length, 5);
});

test("all supported composition guides produce finite normalized geometry", () => {
  for (const type of cameraCompositionGuideTypes) {
    const geometry = cameraCompositionGuideGeometry({ type }, "21:9");
    for (const coordinate of geometry.lines.flatMap((line) => [
      line.from.x,
      line.from.y,
      line.to.x,
      line.to.y,
    ]).concat(geometry.points.flatMap((point) => [point.x, point.y]))) {
      assert.equal(Number.isFinite(coordinate), true);
      assert.ok(coordinate >= 0 && coordinate <= 1);
    }
  }
});

test("aspect presets crop inside one fixed 36 by 24 millimeter sensor", () => {
  assert.equal(aspectRatioValue("21:9"), 64 / 27);
  assert.deepEqual(cameraSensorGate("16:9"), {
    width: 36,
    height: 20.25,
    aspectRatio: 16 / 9,
    crop: "vertical",
  });
  assert.deepEqual(cameraSensorGate("9:16"), {
    width: 13.5,
    height: 24,
    aspectRatio: 9 / 16,
    crop: "horizontal",
  });
  assert.deepEqual(
    ["16:9", "9:16", "1:1", "4:3", "21:9"].map((ratio) => {
      const gate = cameraSensorGate(ratio);
      return [ratio, gate.width, gate.height, gate.crop];
    }),
    [
      ["16:9", 36, 20.25, "vertical"],
      ["9:16", 13.5, 24, "horizontal"],
      ["1:1", 24, 24, "horizontal"],
      ["4:3", 32, 24, "horizontal"],
      ["21:9", 36, 36 / (64 / 27), "vertical"],
    ]
  );
});

test("desktop output derives one fixed 1080 preset from the Shot aspect", () => {
  assert.deepEqual(output1080Resolution("16:9"), { width: 1920, height: 1080 });
  assert.deepEqual(output1080Resolution("9:16"), { width: 1080, height: 1920 });
  assert.deepEqual(output1080Resolution("1:1"), { width: 1080, height: 1080 });
  assert.deepEqual(output1080Resolution("4:3"), { width: 1440, height: 1080 });
  assert.deepEqual(output1080Resolution("21:9"), { width: 2560, height: 1080 });
});

test("changing aspect changes the crop but never the focal length contract", () => {
  const wideFov = outputVerticalFov(35, "21:9");
  const portraitFov = outputVerticalFov(35, "9:16");
  assert.ok(wideFov < portraitFov);
  assert.ok(Math.abs(outputVerticalFov(35, "16:9") - 32.2688) < 0.001);
});

test("the output frame fits inside overscan without changing its aspect", () => {
  const landscape = fitOutputFrame(1000, 600, "16:9");
  assert.ok(landscape.width <= 840.001);
  assert.ok(landscape.height <= 504.001);
  assert.ok(Math.abs(landscape.width / landscape.height - 16 / 9) < 0.000001);

  const portrait = fitOutputFrame(1000, 600, "9:16");
  assert.ok(Math.abs(portrait.width / portrait.height - 9 / 16) < 0.000001);
  assert.ok(overscanVerticalFov(40, portrait.heightFraction) > 40);
});

test("Scene View black-frame preview preserves the exact focal-length output gate", () => {
  for (const aspectRatio of ["16:9", "9:16", "1:1"]) {
    const frame = fitOutputFrame(1200, 700, aspectRatio);
    for (const focalLength of [12, 35, 85, 200]) {
      const outputFov = outputVerticalFov(focalLength, aspectRatio);
      const renderFov = overscanVerticalFov(outputFov, frame.heightFraction);
      const outputHalfHeight = Math.tan((outputFov * Math.PI) / 360);
      const framedHalfHeight =
        Math.tan((renderFov * Math.PI) / 360) * frame.heightFraction;
      assert.ok(Math.abs(framedHalfHeight - outputHalfHeight) < 0.000001);
    }
  }
});

test("portrait offscreen rendering uses its own projection and restores the Edit camera", () => {
  const updates = [];
  const camera = {
    aspect: 16 / 9,
    fov: 52,
    updateProjectionMatrix() {
      updates.push({ aspect: this.aspect, fov: this.fov });
    },
  };

  const result = withOutputCameraProjection(camera, {
    width: 1080,
    height: 1920,
    focalLength: 35,
    aspectRatio: "9:16",
  }, () => {
    assert.equal(camera.aspect, 9 / 16);
    assert.equal(camera.fov, outputVerticalFov(35, "9:16"));
    return "rendered";
  });

  assert.equal(result, "rendered");
  assert.equal(camera.aspect, 16 / 9);
  assert.equal(camera.fov, 52);
  assert.deepEqual(updates.at(-1), { aspect: 16 / 9, fov: 52 });
});

test("offscreen projection is restored even when rendering fails", () => {
  const camera = {
    aspect: 4 / 3,
    fov: 45,
    updateProjectionMatrix() {},
  };

  assert.throws(() => withOutputCameraProjection(camera, {
    width: 1080,
    height: 1920,
    focalLength: 50,
    aspectRatio: "9:16",
  }, () => {
    throw new Error("context lost");
  }), /context lost/);
  assert.equal(camera.aspect, 4 / 3);
  assert.equal(camera.fov, 45);
});

test("output resolution scales the chosen short edge without changing Shot aspect",()=>{
 assert.deepEqual(outputResolutionForAspect("16:9",720),{width:1280,height:720});
 assert.deepEqual(outputResolutionForAspect("9:16",2160),{width:2160,height:3840});
});
