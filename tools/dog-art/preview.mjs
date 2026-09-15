/**
 * Renders the dog character set to SVG and, on macOS, to a PNG contact sheet through Quick Look.
 *
 *   node tools/dog-art/preview.mjs [outDir]
 *
 * Development tooling only: it imports the same geometry module the app renders, so what this shows is what the
 * avatar draws. Nothing here ships.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const outDir = resolve(process.argv[2] ?? "/tmp/pawcue-dog-art");
mkdirSync(outDir, { recursive: true });

// Load the TypeScript module through Node's strip-types support.
const artUrl = pathToFileURL(resolve("apps/mobile/src/dogs/dog-art.ts")).href;
const { drawDog, FAMILY_ORDER, EXACT_BREEDS } = await import(artUrl);
const breedsUrl = pathToFileURL(resolve("apps/mobile/src/dogs/breeds.ts")).href;
const { BREEDS } = await import(breedsUrl);

function shapeToSvg(s) {
  const rot = (cx, cy) =>
    s.rotate ? ` transform="rotate(${s.rotate} ${cx} ${cy})"` : "";
  switch (s.kind) {
    case "ellipse":
      return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="${s.fill}"${rot(s.cx, s.cy)} />`;
    case "circle":
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill}" />`;
    case "path": {
      const o = s.origin ?? [0, 0];
      const stroke = s.stroke
        ? ` stroke="${s.stroke}" stroke-width="${s.width ?? 2}" stroke-linecap="round" stroke-linejoin="round"`
        : "";
      return `<path d="${s.d}" fill="${s.fill ?? "none"}"${stroke}${s.rotate ? ` transform="rotate(${s.rotate} ${o[0]} ${o[1]})"` : ""} />`;
    }
  }
}

function svg(drawing, size, circle) {
  const [x, y, w, h] = drawing.viewBox;
  const clip = circle
    ? `<clipPath id="c"><circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}" /></clipPath>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${(size * h) / w}" viewBox="${x} ${y} ${w} ${h}"><defs>${clip}</defs><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FAF8F4"/><g${circle ? ' clip-path="url(#c)"' : ""}>${drawing.shapes.map(shapeToSvg).join("")}</g></svg>`;
}

const columns = [
  { label: "bust", a: { pose: "bust", expression: "attentive" } },
  { label: "bust-28", a: { pose: "bust", expression: "attentive" }, size: 28 },
  { label: "scene", a: { pose: "scene", expression: "attentive" } },
  { label: "happy", a: { pose: "scene", expression: "happy" } },
  { label: "resting", a: { pose: "scene", expression: "resting" } },
  { label: "puzzled", a: { pose: "bust", expression: "puzzled" } },
  { label: "puppy", a: { pose: "bust", expression: "attentive", puppy: true } },
];
const sizes = {
  mixed: "medium",
  sporting: "large",
  herding: "large",
  hound: "medium",
  working: "large",
  terrier: "small",
  toy: "small",
  non_sporting: "small",
  spitz: "medium",
};
const earsOf = {
  mixed: "folded",
  sporting: "floppy",
  herding: "pointed",
  hound: "floppy",
  working: "folded",
  terrier: "folded",
  toy: "pointed",
  non_sporting: "pointed",
  spitz: "pointed",
};

const cell = 150;
const groupsPerSheet = 3;
const sheetW = columns.length * cell + 120;
const sheetH = groupsPerSheet * (cell + 40);
const sheets = [];
for (let start = 0; start < FAMILY_ORDER.length; start += groupsPerSheet) {
  sheets.push(FAMILY_ORDER.slice(start, start + groupsPerSheet));
}
// Exact breeds: bust and scene for each, six per sheet.
const breedRows = EXACT_BREEDS.map((id) =>
  BREEDS.find((b) => b.id === id),
).filter(Boolean);
for (let start = 0; start < breedRows.length; start += 6) {
  const rows = breedRows.slice(start, start + 6);
  const side = 6 * 130 + 40;
  let sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}"><rect width="100%" height="100%" fill="#FAF8F4"/>`;
  rows.forEach((breed, row) => {
    const y = row * 130;
    sheet += `<text x="8" y="${y + 70}" font-family="Helvetica" font-size="12" fill="#5C605E">${breed.id}</text>`;
    [
      ["bust", 100],
      ["scene", 110],
    ].forEach(([pose, size], i) => {
      const d = drawDog({
        group: breed.group,
        size: breed.size,
        ears: breed.ears,
        breedId: breed.id,
        pose,
        expression: "attentive",
      });
      const inner = svg(d, size, pose === "bust")
        .replace(/^<svg[^>]*>/, "")
        .replace(/<\/svg>$/, "");
      const [vx, vy, vw, vh] = d.viewBox;
      const h = (size * vh) / vw;
      sheet += `<svg x="${200 + i * 150}" y="${y + (130 - Math.min(h, 130)) / 2}" width="${size}" height="${h}" viewBox="${vx} ${vy} ${vw} ${vh}">${inner}</svg>`;
    });
  });
  sheet += "</svg>";
  const path = resolve(outDir, `breeds-${start / 6 + 1}.svg`);
  writeFileSync(path, sheet);
  try {
    execSync(`qlmanage -t -s 1200 -o "${outDir}" "${path}"`, {
      stdio: "ignore",
    });
    console.log(`wrote ${path}.png`);
  } catch {}
}

sheets.forEach((families, sheetIndex) => {
  // Quick Look scales the shorter side and crops the longer, so the sheet is padded to a square.
  const side = Math.max(sheetW, sheetH);
  let sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}"><rect width="100%" height="100%" fill="#FAF8F4"/>`;
  families.forEach((group, row) => {
    const y = row * (cell + 40);
    sheet += `<text x="8" y="${y + cell / 2}" font-family="Helvetica" font-size="14" fill="#5C605E">${group}</text>`;
    columns.forEach((col, i) => {
      const d = drawDog({
        group,
        size: sizes[group],
        ears: earsOf[group],
        ...col.a,
      });
      const isBust = col.a.pose === "bust";
      const size = col.size ?? (isBust ? 110 : 120);
      const inner = svg(d, size, isBust)
        .replace(/^<svg[^>]*>/, "")
        .replace(/<\/svg>$/, "");
      const [vx, vy, vw, vh] = d.viewBox;
      const x = 120 + i * cell + (cell - size) / 2;
      const h = (size * vh) / vw;
      sheet += `<svg x="${x}" y="${y + (cell - Math.min(h, cell)) / 2}" width="${size}" height="${h}" viewBox="${vx} ${vy} ${vw} ${vh}">${inner}</svg>`;
      if (row === 0)
        sheet += `<text x="${120 + i * cell + cell / 2}" y="${sheetH - 8}" font-family="Helvetica" font-size="12" fill="#5C605E" text-anchor="middle">${col.label}</text>`;
      // Individual files too.
      writeFileSync(
        resolve(outDir, `${group}-${col.label}.svg`),
        svg(d, 400, isBust),
      );
    });
  });
  sheet += "</svg>";
  const sheetPath = resolve(outDir, `sheet-${sheetIndex + 1}.svg`);
  writeFileSync(sheetPath, sheet);
  try {
    execSync(`qlmanage -t -s 1400 -o "${outDir}" "${sheetPath}"`, {
      stdio: "ignore",
    });
    console.log(`wrote ${sheetPath}.png`);
  } catch {
    console.log(`wrote ${sheetPath} (no Quick Look rasteriser available)`);
  }
});
