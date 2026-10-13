export const cameraSensorWidth = 36;
export const cameraSensorHeight = 24;

export const cameraCompositionGuideTypes = Object.freeze([
  "none",
  "thirds",
  "center",
  "golden-triangle",
  "diagonal",
  "one-point",
]);

export function defaultCameraCompositionGuideState() {
  return {
    type: "none",
    direction: "normal",
    vanishingPoint: { x: 0.5, y: 0.5 },
  };
}

export function normalizeCameraCompositionGuideState(input) {
  const fallback = defaultCameraCompositionGuideState();
  return {
    type: cameraCompositionGuideTypes.includes(input?.type) ? input.type : fallback.type,
    direction: input?.direction === "mirror" ? "mirror" : fallback.direction,
    vanishingPoint: {
      x: clampFinite(input?.vanishingPoint?.x, 0, 1, fallback.vanishingPoint.x),
      y: clampFinite(input?.vanishingPoint?.y, 0, 1, fallback.vanishingPoint.y),
    },
  };
}

export function cameraCompositionGuideVanishingPointAfterKey(
  pointInput,
  key,
  { shiftKey = false } = {}
) {
  const point = normalizeCameraCompositionGuideState({
    type: "one-point",
    vanishingPoint: pointInput,
  }).vanishingPoint;
  if (key === "Home") return { x: 0.5, y: 0.5 };
  const step = shiftKey ? 0.05 : 0.01;
  const delta = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }[key];
  if (!delta) return point;
  return {
    x: clampFinite(point.x + delta[0], 0, 1, 0.5),
    y: clampFinite(point.y + delta[1], 0, 1, 0.5),
  };
}

export function cameraCompositionGuideGeometry(stateInput, aspectRatioInput) {
  const state = normalizeCameraCompositionGuideState(stateInput);
  const aspectRatio = aspectRatioValue(aspectRatioInput);
  const line = (x1, y1, x2, y2, kind = "major") => ({
    from: { x: x1, y: y1 },
    to: { x: x2, y: y2 },
    kind,
  });
  const point = (x, y, kind = "reference") => ({ x, y, kind });
  let lines = [];
  let points = [];

  if (state.type === "thirds") {
    lines = [
      line(1 / 3, 0, 1 / 3, 1),
      line(2 / 3, 0, 2 / 3, 1),
      line(0, 1 / 3, 1, 1 / 3),
      line(0, 2 / 3, 1, 2 / 3),
    ];
  } else if (state.type === "center") {
    // Keep a physically square opening around the centre on wide and tall frames.
    const gapX = 0.044;
    const gapY = clampFinite(gapX * aspectRatio, 0.025, 0.18, 0.078);
    lines = [
      line(0.5, 0, 0.5, 0.5 - gapY),
      line(0.5, 0.5 + gapY, 0.5, 1),
      line(0, 0.5, 0.5 - gapX, 0.5),
      line(0.5 + gapX, 0.5, 1, 0.5),
    ];
    points = [point(0.5, 0.5, "center")];
  } else if (state.type === "golden-triangle") {
    const squaredWidth = aspectRatio * aspectRatio;
    const projectionFromTopRight = squaredWidth / (squaredWidth + 1);
    const projectionFromBottomLeft = 1 / (squaredWidth + 1);
    lines = [
      line(0, 0, 1, 1),
      line(1, 0, projectionFromTopRight, projectionFromTopRight, "minor"),
      line(0, 1, projectionFromBottomLeft, projectionFromBottomLeft, "minor"),
    ];
    points = [
      point(projectionFromTopRight, projectionFromTopRight),
      point(projectionFromBottomLeft, projectionFromBottomLeft),
    ];
    if (state.direction === "mirror") {
      lines = lines.map((candidate) => ({
        ...candidate,
        from: { ...candidate.from, x: 1 - candidate.from.x },
        to: { ...candidate.to, x: 1 - candidate.to.x },
      }));
      points = points.map((candidate) => ({ ...candidate, x: 1 - candidate.x }));
    }
  } else if (state.type === "diagonal") {
    const candidates = aspectRatio >= 1
      ? [
          line(0, 0, 1 / aspectRatio, 1),
          line(1, 0, 1 - 1 / aspectRatio, 1),
          line(0, 1, 1 / aspectRatio, 0),
          line(1, 1, 1 - 1 / aspectRatio, 0),
        ]
      : [
          line(0, 0, 1, aspectRatio),
          line(1, 0, 0, aspectRatio),
          line(0, 1, 1, 1 - aspectRatio),
          line(1, 1, 0, 1 - aspectRatio),
        ];
    const seen = new Set();
    lines = candidates.filter((candidate) => {
      const first = `${candidate.from.x.toFixed(8)},${candidate.from.y.toFixed(8)}`;
      const second = `${candidate.to.x.toFixed(8)},${candidate.to.y.toFixed(8)}`;
      const key = [first, second].sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } else if (state.type === "one-point") {
    const { x, y } = state.vanishingPoint;
    lines = [
      line(0, y, 1, y, "minor"),
      line(0, 0, x, y, "minor"),
      line(1, 0, x, y, "minor"),
      line(0, 1, x, y, "minor"),
      line(1, 1, x, y, "minor"),
    ];
    points = [point(x, y, "vanishing")];
  }

  return {
    type: state.type,
    direction: state.direction,
    lines,
    points,
    interactive: state.type === "one-point",
    vanishingPoint: state.vanishingPoint,
  };
}

export function aspectRatioValue(value, fallback = 16 / 9) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== "string") return fallback;
  // The UI uses the familiar 21:9 label for the conventional 2560×1080 frame.
  if (value.trim() === "21:9") return 64 / 27;
  const match = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(value);
  if (!match) return fallback;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : fallback;
}

export function output1080Resolution(aspectRatioInput) {
  return outputResolutionForAspect(aspectRatioInput, 1080);
}

export function outputResolutionForAspect(aspectRatioInput, shortEdge) {
  const aspectRatio = Math.max(0.01, aspectRatioValue(aspectRatioInput));
  const even = (value) => Math.max(16, Math.round(value / 2) * 2);
  return aspectRatio >= 1
    ? { width: even(shortEdge * aspectRatio), height: shortEdge }
    : { width: shortEdge, height: even(shortEdge / aspectRatio) };
}

export function cameraSensorGate(aspectRatioInput) {
  const aspectRatio = aspectRatioValue(aspectRatioInput);
  const sensorAspect = cameraSensorWidth / cameraSensorHeight;
  if (aspectRatio >= sensorAspect) {
    return {
      width: cameraSensorWidth,
      height: cameraSensorWidth / aspectRatio,
      aspectRatio,
      crop: "vertical",
    };
  }
  return {
    width: cameraSensorHeight * aspectRatio,
    height: cameraSensorHeight,
    aspectRatio,
    crop: "horizontal",
  };
}

export function outputVerticalFov(focalLengthInput, aspectRatioInput) {
  const focalLength = clampFinite(focalLengthInput, 1, 1000, 35);
  const gate = cameraSensorGate(aspectRatioInput);
  return radiansToDegrees(2 * Math.atan(gate.height / (2 * focalLength)));
}

export function withOutputCameraProjection(camera, {
  width: widthInput,
  height: heightInput,
  focalLength,
  aspectRatio,
}, render) {
  const width = Number(widthInput);
  const height = Number(heightInput);
  if (!camera || typeof camera.updateProjectionMatrix !== "function") {
    throw new TypeError("An output camera with updateProjectionMatrix() is required");
  }
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError("Output projection dimensions must be positive finite numbers");
  }
  if (typeof render !== "function") throw new TypeError("An output render callback is required");

  const previousAspect = camera.aspect;
  const previousFov = camera.fov;
  camera.aspect = width / height;
  camera.fov = outputVerticalFov(focalLength, aspectRatio);
  camera.updateProjectionMatrix();
  try {
    return render();
  } finally {
    camera.aspect = previousAspect;
    camera.fov = previousFov;
    camera.updateProjectionMatrix();
  }
}

export function fitOutputFrame(containerWidthInput, containerHeightInput, aspectRatioInput, inset = 0.08) {
  const containerWidth = Math.max(Number(containerWidthInput || 0), 1);
  const containerHeight = Math.max(Number(containerHeightInput || 0), 1);
  const aspectRatio = aspectRatioValue(aspectRatioInput);
  const safeInset = clampFinite(inset, 0, 0.4, 0.08);
  const availableWidth = containerWidth * (1 - safeInset * 2);
  const availableHeight = containerHeight * (1 - safeInset * 2);
  let width = availableWidth;
  let height = width / aspectRatio;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * aspectRatio;
  }
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
    widthFraction: width / containerWidth,
    heightFraction: height / containerHeight,
    aspectRatio,
  };
}

export function overscanVerticalFov(outputVerticalFovInput, frameHeightFractionInput) {
  const outputFov = degreesToRadians(clampFinite(outputVerticalFovInput, 1, 175, 40));
  const frameHeightFraction = clampFinite(frameHeightFractionInput, 0.05, 1, 0.84);
  return radiansToDegrees(2 * Math.atan(Math.tan(outputFov / 2) / frameHeightFraction));
}

function degreesToRadians(value) {
  return value * Math.PI / 180;
}

function radiansToDegrees(value) {
  return value * 180 / Math.PI;
}

function clampFinite(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}
