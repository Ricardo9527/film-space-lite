// Wire identifiers for authored blocking segments, not animation assets.
export const desktopActions = Object.freeze({
  walk: Object.freeze({ id: "walk", label: "移动", kind: "move", defaultSpeed: 0.8, locomotionGait: "walk", loopBehavior: "loop", naturalDuration: 1 }),
  idle: Object.freeze({ id: "idle", label: "停留", kind: "hold", defaultDuration: 1, loopBehavior: "loop", naturalDuration: 1 }),
});
export const maximumDesktopActionIDLength = 4;
export const desktopActionCatalogVersion = 1;
export const desktopTravelDirections = ["forward"];
export const desktopDefaultQuickActionIDs = { move: ["walk"], stay: ["idle"] };
export const desktopLoopBehaviors = ["loop"];
export function isDesktopActionID(id) { return id === "walk" || id === "idle"; }
export function normalizeDesktopActionLoopBehavior(action, value = "loop") {
  if (value !== "loop") throw new Error("抽象人不支持动画循环参数。");
  return "loop";
}
export function desktopActionLoopBehaviorOptions() { return []; }
