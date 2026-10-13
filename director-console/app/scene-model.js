export const defaultMoveSpeed = 0.8;
export const minimumMoveSpeed = 0.05;
export const walkReferenceSpeed = 0.8;
export const walkReferenceCadence = 1.7;
export const minimumWalkTimeScale = 0.75;
export const maximumWalkTimeScale = 1.35;

export function defaultActionIDForKind(kind) {
  return kind === "move" ? "walk" : "idle";
}

export function previewActionID(actionID, fallbackActionID, availableActionIDs = []) {
  const available = new Set(
    Array.from(availableActionIDs || [])
      .filter((id) => typeof id === "string")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean)
  );
  const normalized = typeof actionID === "string" ? actionID.trim().toLowerCase() : "";
  const fallback = typeof fallbackActionID === "string" && fallbackActionID.trim()
    ? fallbackActionID.trim().toLowerCase()
    : "idle";

  if (normalized && (!available.size || available.has(normalized))) return normalized;
  if (!available.size || available.has(fallback)) return fallback;
  return "idle";
}

export function normalizeAction(action) {
  const kind = action?.kind === "move" ? "move" : "hold";
  const actionID = typeof action?.actionID === "string" && action.actionID.trim()
    ? action.actionID.trim().toLowerCase()
    : defaultActionIDForKind(kind);
  return { ...action, kind, actionID };
}

export function playbackStatus(snapshot) {
  return snapshot?.motionPlaybackStatus || (snapshot?.isPathPlaying ? "playing" : "idle");
}

export function hasAnyMotion(snapshot) {
  return Boolean(snapshot?.humans?.some((human) => hasMotion(human)));
}

export function hasMotion(human) {
  return motionActionsFor(human).length > 0;
}

export function motionActionsFor(human) {
  if (!human) return [];
  if (Array.isArray(human.motionActions)) return human.motionActions.map(normalizeAction);
  return legacyPathToActions(human);
}

export function legacyPathToActions(human) {
  const path = human.path || [];
  if (!path.length) return [];

  const start = human.pathStartPosition || human.motionStartPosition || human.position;
  const startAction = {
    id: crypto.randomUUID(),
    kind: "hold",
    actionID: "idle",
    position: start,
    speed: defaultMoveSpeed,
    duration: 0,
  };

  return [startAction, ...path.flatMap((waypoint) => {
    const move = {
      id: waypoint.id,
      kind: "move",
      actionID: "walk",
      position: waypoint.position,
      speed: defaultMoveSpeed,
      duration: 0,
    };
    if (Number(waypoint.waitDuration || 0) <= 0) return [move];
    return [
      move,
      {
        id: crypto.randomUUID(),
        kind: "hold",
        actionID: "idle",
        position: waypoint.position,
        speed: defaultMoveSpeed,
        duration: Number(waypoint.waitDuration || 0),
      },
    ];
  })];
}

export function motionStartPosition(human) {
  const firstAction = motionActionsFor(human)[0];
  if (firstAction?.kind === "hold") return firstAction.position;
  return human.motionStartPosition || human.pathStartPosition || human.position;
}

export function motionEndPosition(human) {
  let anchor = motionStartPosition(human);
  for (const action of motionActionsFor(human)) {
    if (action.kind === "move") anchor = action.position;
    if (action.kind === "hold") anchor = action.position;
  }
  return anchor;
}

export function moveDuration(start, end, speed) {
  return distanceXYZ(start, end) / Math.max(Number(speed || defaultMoveSpeed), minimumMoveSpeed);
}

export function walkAnimationTimeScaleForSpeed(speed) {
  const speedRatio = Math.max(Number(speed || defaultMoveSpeed), minimumMoveSpeed) / walkReferenceSpeed;
  const rawScale = Math.sqrt(speedRatio);
  return clamp(rawScale, minimumWalkTimeScale, maximumWalkTimeScale);
}

export function walkCadenceForSpeed(speed) {
  return walkReferenceCadence * walkAnimationTimeScaleForSpeed(speed);
}

export function activeMoveForPosition(human, position, options = {}) {
  const tolerance = Number(options.tolerance ?? 0.1);
  const endTolerance = Number(options.endTolerance ?? 0.035);
  let anchor = motionStartPosition(human);

  for (const action of motionActionsFor(human)) {
    if (action.kind !== "move") {
      anchor = action.position;
      continue;
    }
    if (isPointOnMoveSegment(position, anchor, action.position, tolerance)) {
      if (distanceXYZ(position, action.position) <= endTolerance) return null;
      return {
        action,
        start: anchor,
        end: action.position,
        speed: Math.max(Number(action.speed || defaultMoveSpeed), minimumMoveSpeed),
      };
    }
    anchor = action.position;
  }

  return null;
}

export function isPointOnMoveSegment(position, start, end, tolerance = 0.1) {
  const segmentX = Number(end?.x || 0) - Number(start?.x || 0);
  const segmentY = Number(end?.y || 0) - Number(start?.y || 0);
  const segmentZ = Number(end?.z || 0) - Number(start?.z || 0);
  const lengthSquared = (
    segmentX * segmentX
    + segmentY * segmentY
    + segmentZ * segmentZ
  );
  if (lengthSquared <= 0.000001) return false;

  const pointX = Number(position?.x || 0) - Number(start?.x || 0);
  const pointY = Number(position?.y || 0) - Number(start?.y || 0);
  const pointZ = Number(position?.z || 0) - Number(start?.z || 0);
  const t = Math.max(0, Math.min(
    1,
    (
      pointX * segmentX
      + pointY * segmentY
      + pointZ * segmentZ
    ) / lengthSquared
  ));
  const closest = {
    x: Number(start?.x || 0) + segmentX * t,
    y: Number(start?.y || 0) + segmentY * t,
    z: Number(start?.z || 0) + segmentZ * t,
  };
  const dx = Number(position?.x || 0) - closest.x;
  const dy = Number(position?.y || 0) - closest.y;
  const dz = Number(position?.z || 0) - closest.z;
  return dx * dx + dy * dy + dz * dz <= tolerance * tolerance;
}

export function distanceXYZ(a, b) {
  const dx = Number(a?.x || 0) - Number(b?.x || 0);
  const dy = Number(a?.y || 0) - Number(b?.y || 0);
  const dz = Number(a?.z || 0) - Number(b?.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function distanceXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function shortID(id) {
  return String(id || "").slice(0, 8);
}

export function fmt(value) {
  return Number(value || 0).toFixed(2);
}

export function normalizeAngle(value) {
  const angle = Number(value);
  if (!Number.isFinite(angle)) return 0;
  if (angle >= -Math.PI && angle <= Math.PI) {
    return Object.is(angle, -0) ? 0 : angle;
  }
  const normalized = Math.atan2(Math.sin(angle), Math.cos(angle));
  const rounded = Number(normalized.toPrecision(15));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function lerpAngle(from, to, alpha) {
  return normalizeAngle(from + normalizeAngle(to - from) * alpha);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
