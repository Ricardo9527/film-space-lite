// 数字字段一律可拖（docs/work/desktop-ui.md）。这两个函数原来是 director-app.js 的私有
// 函数，于是只有主控台那一页能用；动作库对话框和动作预览页各自是独立模块，它们的数字框
// 就只剩原生上下箭头 —— 规则写着"一律"，实现却按文件边界漏了。搬到这里，三个模块共用一份。
//
// 这里只放不碰应用状态的部分：wireNumberScrub 是纯指针拖拽，wireInputNumberScrub 只读
// input 自己的 step/min/max。要在拖动过程中改项目并进历史的那层（wireProjectNumberScrub）
// 依赖 history / project / syncRenderer，留在 director-app.js。

export function wireNumberScrub(input, options) {
  if (!input) return;
  let drag = null;
  let suppressClick = false;
  let suppressNativeChange = false;

  input.addEventListener("change", (event) => {
    if (!suppressNativeChange) return;
    event.stopImmediatePropagation();
  }, true);

  const releasePointer = (pointerID) => {
    if (input.hasPointerCapture?.(pointerID)) input.releasePointerCapture(pointerID);
  };
  const clearScrubState = () => {
    input.classList.remove("scrubbing");
    document.body.classList.remove("scrubbing-number");
  };
  const cancelDrag = () => {
    if (!drag) return;
    const current = drag;
    drag = null;
    releasePointer(current.pointerID);
    clearScrubState();
    if (current.active) options.onCancel?.(current.context, current.startValue);
  };

  input.addEventListener("pointerdown", (event) => {
    if (input.disabled || event.button !== 0 || event.pointerType === "touch") return;
    const startValue = Number(input.value);
    if (!Number.isFinite(startValue)) return;
    drag = {
      pointerID: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startValue,
      value: startValue,
      active: false,
      context: null,
    };
    input.setPointerCapture?.(event.pointerId);
  });

  input.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerID) return;
    // 横向右拖增大、竖向上拖增大，取位移更大的那个轴。
    // 原来只认竖向（startY − clientY），而 Blender / Maya / AE / Figma / C4D
    // 的数字拖拽全是横向的 —— 按公约去拖等于毫无反应，看着就像这个功能是假的。
    const horizontal = event.clientX - drag.startX;
    const vertical = drag.startY - event.clientY;
    const delta = Math.abs(horizontal) >= Math.abs(vertical) ? horizontal : vertical;
    if (!drag.active && Math.abs(delta) < 3) return;
    if (!drag.active) {
      drag.active = true;
      drag.context = options.onStart?.();
      input.classList.add("scrubbing");
      document.body.classList.add("scrubbing-number");
    }
    event.preventDefault();
    drag.value = options.valueAtDelta(drag.startValue, delta, event.shiftKey);
    input.value = options.format(drag.value);
    options.onPreview?.(drag.value, drag.context);
  });

  input.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.pointerID) return;
    const current = drag;
    drag = null;
    releasePointer(current.pointerID);
    clearScrubState();
    if (!current.active) return;
    suppressClick = true;
    // 只拦 blur() 触发的那个原生 change（防重复提交），拦完立刻复位 ——
    // 原来用 queueMicrotask 复位，而 onCommit 是同步紧接着跑的，
    // 于是它派发的 change 撞上仍为 true 的拦截器被 stopImmediatePropagation 杀掉：
    // 拖动看着改了数值，却从来没有落库。
    suppressNativeChange = true;
    input.blur();
    suppressNativeChange = false;
    event.preventDefault();
    options.onCommit?.(current.value, current.context);
  });

  input.addEventListener("pointercancel", cancelDrag);
  input.addEventListener("click", (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
  });
  input.addEventListener("dblclick", () => input.select());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drag?.active) {
      event.preventDefault();
      cancelDrag();
    } else if (event.key === "Enter") {
      input.blur();
    }
  });
}

export function wireInputNumberScrub(input, options = {}) {
  if (!input) return;
  (input.closest("label") || input.closest(".input-with-unit") || input.parentElement)
    ?.classList.add("scrubbable-input");
  const step = Math.max(Math.abs(Number(input.step)) || Number(options.step) || 0.01, 0.000001);
  const minimum = input.hasAttribute("min") && Number.isFinite(Number(input.min))
    ? Number(input.min)
    : -Infinity;
  const maximum = input.hasAttribute("max") && Number.isFinite(Number(input.max))
    ? Number(input.max)
    : Infinity;
  const precision = Number.isInteger(options.precision)
    ? options.precision
    : Math.min(6, Math.max(0, (String(step).split(".")[1] || "").length));
  const dispatch = (eventName) => {
    if (eventName) input.dispatchEvent(new Event(eventName, { bubbles: true }));
  };
  const previewEvent = Object.hasOwn(options, "previewEvent") ? options.previewEvent : "input";
  const commitEvent = Object.hasOwn(options, "commitEvent") ? options.commitEvent : "change";
  wireNumberScrub(input, {
    onStart: () => Number(input.value),
    valueAtDelta: (startValue, delta, fine) => Math.max(
      minimum,
      Math.min(maximum, startValue + delta * step * (fine ? 0.1 : 1))
    ),
    format: (value) => Number(value).toFixed(precision),
    onPreview: () => dispatch(previewEvent),
    onCancel: (_context, startValue) => {
      input.value = Number(startValue).toFixed(precision);
      dispatch(previewEvent);
    },
    onCommit: () => dispatch(commitEvent),
  });
}
