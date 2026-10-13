import { wireInputNumberScrub } from "./number-scrub.js";

export function wireCameraSpeedControl(root, renderer) {
  const input = root.querySelector("input");
  const toggle = root.querySelector(".camera-speed-toggle");
  const panel = root.querySelector(".camera-speed-panel");
  const fine = root.querySelector(".camera-speed-fine");
  const mode = () => root.parentElement.dataset.editViewMode === "scene" ? "scene" : "camera";
  const close = () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };
  const renderIndicators = () => {
    fine.hidden = renderer.cameraPrecisionKeys.size === 0;
    for (const button of panel.querySelectorAll("[data-speed]")) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.speed) === Number(input.value)));
    }
  };
  const render = () => {
    input.value = String(renderer.cameraNavigationSpeedMultipliers[mode()]);
    renderIndicators();
  };
  const apply = () => {
    if (input.value === "" || !input.validity.valid) return;
    renderer.cameraNavigationSpeedMultipliers[mode()] = input.valueAsNumber;
    renderIndicators();
  };
  wireInputNumberScrub(input, { precision: 1 });
  input.addEventListener("input", apply);
  input.addEventListener("change", () => {
    if (!input.validity.valid) input.reportValidity();
    render();
  });
  input.addEventListener("blur", render);
  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  });
  for (const button of panel.querySelectorAll("[data-speed]")) {
    button.addEventListener("click", (event) => {
      input.value = button.dataset.speed;
      apply();
      close();
      button.blur();
      if (event.detail === 0) toggle.focus({ preventScroll: true });
      else renderer.renderer.domElement.focus({ preventScroll: true });
    });
  }
  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) close();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
      input.blur();
      toggle.focus({ preventScroll: true });
    }
  });
  for (const name of ["keydown", "keyup"]) {
    window.addEventListener(name, (event) => {
      if (event.key === "Shift") queueMicrotask(() => { fine.hidden = renderer.cameraPrecisionKeys.size === 0; });
    });
  }
  window.addEventListener("blur", () => { fine.hidden = true; close(); });
  return () => { close(); render(); };
}
