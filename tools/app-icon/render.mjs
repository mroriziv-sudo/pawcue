/**
 * Renders the app icon set from the dog character's own geometry, so the icon and the dog in the app are one
 * drawing. Emits SVGs; rasterise them with `tools/app-icon/rasterise.swift` (macOS, WebKit) or any SVG renderer.
 *
 *   node --experimental-strip-types tools/app-icon/render.mjs <outDir> [variant]
 *
 * Variants: paper (bust on Warm Ivory), evergreen (bust on Deep Evergreen), sit (sitting dog on Warm Ivory).
 * Development tooling only; nothing here ships except the PNGs it produces under apps/mobile/assets.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const outDir = resolve(process.argv[2] ?? "/tmp/pawcue-app-icon");
const only = process.argv[3];
mkdirSync(outDir, { recursive: true });

const { drawDog } = await import(
  pathToFileURL(resolve("apps/mobile/src/dogs/dog-art.ts")).href
);

const PAPER = "#FAF8F4";
const EVERGREEN = "#23473C";
const CHARCOAL = "#1F2523";

function shapeToSvg(s, fillOverride) {
  const fill = (f) => fillOverride ?? f;
  const rot = (cx, cy) =>
    s.rotate ? ` transform="rotate(${s.rotate} ${cx} ${cy})"` : "";
  switch (s.kind) {
    case "ellipse":
      return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="${fill(s.fill)}"${rot(s.cx, s.cy)} />`;
    case "circle":
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${fill(s.fill)}" />`;
    case "path": {
      const o = s.origin ?? [0, 0];
      const stroke = s.stroke
        ? ` stroke="${fill(s.stroke)}" stroke-width="${s.width ?? 2}" stroke-linecap="round" stroke-linejoin="round"`
        : "";
      return `<path d="${s.d}" fill="${s.fill ? fill(s.fill) : "none"}"${stroke}${s.rotate ? ` transform="rotate(${s.rotate} ${o[0]} ${o[1]})"` : ""} />`;
    }
  }
}

/**
 * Frame a drawing inside a square canvas: the drawing's viewBox is scaled so its longer side fills `fill` of the
 * canvas, and centred. `size` is the SVG's pixel size.
 */
function frame(drawing, { size, background, fill, dy = 0, fillOverride }) {
  const [x, y, w, h] = drawing.viewBox;
  const scale = (size * fill) / Math.max(w, h);
  const tx = (size - w * scale) / 2 - x * scale;
  const ty = (size - h * scale) / 2 - y * scale + dy * size;
  const body = drawing.shapes.map((s) => shapeToSvg(s, fillOverride)).join("");
  const bg = background
    ? `<rect width="${size}" height="${size}" fill="${background}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}<g transform="translate(${tx} ${ty}) scale(${scale})">${body}</g></svg>`;
}

const generic = { group: "mixed", size: "medium", ears: "folded" };
const bust = drawDog({ ...generic, pose: "bust", expression: "attentive" });
// Exactly what the welcome screen draws: `<DogAvatar breed={null} pose="sit" />` — generic dog, attentive, blue collar.
const sit = drawDog({ ...generic, pose: "sit", expression: "attentive" });

const variants = {
  paper: () =>
    frame(bust, { size: 1024, background: PAPER, fill: 1.04, dy: 0.02 }),
  evergreen: () =>
    frame(bust, { size: 1024, background: EVERGREEN, fill: 1.04, dy: 0.02 }),
  sit: () => frame(sit, { size: 1024, background: PAPER, fill: 0.92, dy: 0.0 }),
};

for (const [name, make] of Object.entries(variants)) {
  if (only && only !== name) continue;
  writeFileSync(resolve(outDir, `icon-${name}.svg`), make());
}

// The full set for the chosen variant: iOS icon, Android adaptive layers, splash mark.
if (only && variants[only]) {
  const bg = only === "evergreen" ? EVERGREEN : PAPER;
  const fg = only === "sit" ? sit : bust;
  // Android adaptive: 108dp canvas, safe zone is the inner 66dp circle → keep the mark within ~0.56 of the side.
  writeFileSync(
    resolve(outDir, "android-icon-foreground.svg"),
    frame(fg, { size: 1024, background: null, fill: 0.5, dy: 0.0 }),
  );
  writeFileSync(
    resolve(outDir, "android-icon-background.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${bg}"/></svg>`,
  );
  // Monochrome: one-colour silhouette of the same mark, no background.
  writeFileSync(
    resolve(outDir, "android-icon-monochrome.svg"),
    frame(fg, {
      size: 1024,
      background: null,
      fill: 0.5,
      dy: 0.0,
      fillOverride: CHARCOAL,
    }),
  );
  // Splash mark: the same bust, smaller, on transparent — the splash background is the paper colour.
  writeFileSync(
    resolve(outDir, "splash-icon.svg"),
    frame(fg, { size: 1024, background: null, fill: 0.55 }),
  );
}
console.log(`wrote ${outDir}`);
