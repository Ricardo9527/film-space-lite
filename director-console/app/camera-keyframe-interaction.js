import { moveCameraKeyframes } from "./camera-track.js";

export function wireTimelineKeyframeMarker(marker, {
  canEdit, getTrack, getSelection, select, commit, frameRate, span, offset,
  moveTrack=moveCameraKeyframes,idProperty="cameraKeyframeId",
  railSelector="[data-camera-keyframe-rail]",markerSelector="[data-camera-keyframe-id]",fixedZero=true,
}) {
  const id = marker.dataset[idProperty];
  let drag = null;
  let suppressClick = false;
  const paint = (track, ids) => {
    const rail = marker.closest(railSelector);
    for (const point of rail.querySelectorAll(markerSelector)) {
      const key = track.keyframes.find((key) => key.id === point.dataset[idProperty]);
      point.style.left = offset(key.time / span);
      point.classList.toggle("selected", ids.has(key.id));
      point.setAttribute("aria-pressed", String(ids.has(key.id)));
    }
  };
  marker.addEventListener("pointerdown", (event) => {
    suppressClick = false;
    if (!canEdit() || event.button !== 0 || event.shiftKey) return;
    const track = getTrack();
    const selection = getSelection();
    const ids = selection.has(id) ? new Set(selection) : new Set([id]);
    drag = {
      pointerID: event.pointerId, startX: event.clientX, track, ids,
      width: marker.closest(railSelector).getBoundingClientRect().width,
      next: track, moved: false,
    };
    marker.focus({ preventScroll: true });
    marker.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  marker.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerID) return;
    if (Math.abs(event.clientX - drag.startX) > 3) drag.moved = true;
    if (!drag.moved) return;
    const delta = (event.clientX - drag.startX) / (drag.width - 9 * Math.SQRT2) * span;
    drag.next = moveTrack(drag.track, [...drag.ids], delta, frameRate);
    paint(drag.next, drag.ids);
    event.preventDefault();
  });
  const finish = (cancelled) => {
    const completed = drag;
    drag = null;
    if (marker.hasPointerCapture(completed.pointerID)) marker.releasePointerCapture(completed.pointerID);
    suppressClick = completed.moved;
    if (cancelled) {
      paint(completed.track, getSelection());
      return;
    }
    if (!completed.moved) return;
    const key = completed.track.keyframes.find((key) => (!fixedZero || key.time > 0) && completed.ids.has(key.id));
    const delta = key ? completed.next.keyframes.find((next) => next.id === key.id).time - key.time : 0;
    commit([...completed.ids], delta, id);
  };
  marker.addEventListener("pointerup", (event) => {
    if (drag && event.pointerId === drag.pointerID) finish(false);
  });
  marker.addEventListener("pointercancel", (event) => {
    if (drag && event.pointerId === drag.pointerID) finish(true);
  });
  marker.addEventListener("lostpointercapture", () => {
    if (drag) finish(true);
  });
  marker.addEventListener("click", (event) => {
    if (suppressClick) { suppressClick = false; return; }
    select(id, event.shiftKey);
  });
  marker.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drag) {
      finish(true);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const selection = getSelection();
    commit(selection.has(id) ? [...selection] : [id], (event.key === "ArrowLeft" ? -1 : 1) / frameRate, id);
    event.preventDefault();
    event.stopPropagation();
  });
}

export function wireCameraKeyframeMarker(marker, options) {
  return wireTimelineKeyframeMarker(marker,options);
}
