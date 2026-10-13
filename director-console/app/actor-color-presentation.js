import { clothingColors } from "./project-model.js";

export function clothingInk(index) {
  const color = typeof index === "string" ? index : clothingColor(index);
  if (typeof index === "string") {
    const channel = (offset) => {
      const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    const darkLuminance = ((20 / 255 + 0.055) / 1.055) ** 2.4;
    return (luminance + 0.05) / (darkLuminance + 0.05) > 1.05 / (luminance + 0.05)
      ? "#141414" : "#ffffff";
  }
  const channel = (offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
  const luminance = (0.2126 * channel(1)) + (0.7152 * channel(3)) + (0.0722 * channel(5));
  return luminance > 0.7 ? "#141414" : "#ffffff";
}

function clothingColor(index) {
  const integer = Number.isInteger(index) ? index : 0;
  const normalized = ((integer % clothingColors.length) + clothingColors.length) % clothingColors.length;
  return clothingColors[normalized] || clothingColors[0];
}
