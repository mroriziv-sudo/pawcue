/**
 * Emit the dog character as a transparent SVG for the store frames, from the app's own geometry.
 *   node --experimental-strip-types tools/store-screens/dog.mjs <pose> <expression> <props,comma> > out.svg
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { drawDog } = await import(
  pathToFileURL(resolve("apps/mobile/src/dogs/dog-art.ts")).href
);
const [pose = "sit", expression = "attentive", propsArg = ""] =
  process.argv.slice(2);
const props = propsArg ? propsArg.split(",") : [];
const d = drawDog({
  group: "mixed",
  size: "medium",
  ears: "folded",
  pose,
  expression,
  props,
});
const shape = (s) => {
  const rot = (cx, cy) =>
    s.rotate ? ` transform="rotate(${s.rotate} ${cx} ${cy})"` : "";
  if (s.kind === "ellipse")
    return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="${s.fill}"${rot(s.cx, s.cy)}/>`;
  if (s.kind === "circle")
    return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill}"/>`;
  const o = s.origin ?? [0, 0];
  const stroke = s.stroke
    ? ` stroke="${s.stroke}" stroke-width="${s.width ?? 2}" stroke-linecap="round" stroke-linejoin="round"`
    : "";
  return `<path d="${s.d}" fill="${s.fill ?? "none"}"${stroke}${s.rotate ? ` transform="rotate(${s.rotate} ${o[0]} ${o[1]})"` : ""}/>`;
};
const [x, y, w, h] = d.viewBox;
process.stdout.write(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}">${d.shapes.map(shape).join("")}</svg>`,
);
