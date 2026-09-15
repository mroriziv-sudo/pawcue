import type { BreedGroup, BreedSize, EarShape } from "./breeds";

/**
 * The dog character, as geometry.
 *
 * Every dog in the product is drawn from this one module: nine breed-family templates and a generic mixed
 * breed, each a set of flat two-value shapes (a coat and one darker or lighter marking) plus ink features. No
 * outlines, no gradients, no gloss — the style the art direction calls "a children's-book animal drawn for
 * adults". Breeds differ where owners recognise them: skull shape, muzzle length, ear set, one signature marking,
 * and in the scene pose the body's build and tail.
 *
 * This file is deliberately framework-free: it returns plain shapes that the avatar renders through
 * react-native-svg and a preview script serialises to SVG markup for the dev preview and for reviewing the art on
 * a desktop. The scene canvas is 120 × 150 with the head centred at (60, 52); the bust is the head cropped to a
 * circle.
 */

export type DogPose = "bust" | "scene";
export type DogExpression =
  "attentive" | "happy" | "focused" | "resting" | "puzzled";

export interface DogAppearance {
  group: BreedGroup;
  size: BreedSize;
  ears: EarShape;
  /** The exact breed, when known. Applies that breed's overrides to its family template. */
  breedId?: string;
  /** Under a year: bigger eyes, softer muzzle, floppier ears. */
  puppy?: boolean;
  /** Over nine years: a greyed muzzle. */
  senior?: boolean;
  pose?: DogPose;
  expression?: DogExpression;
  /** Faces toward the reading edge's text. Mirrored under RTL by the renderer. */
  collar?: string;
}

export type Shape =
  | {
      kind: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      fill: string;
      rotate?: number;
    }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string }
  | {
      kind: "path";
      d: string;
      fill?: string;
      stroke?: string;
      width?: number;
      rotate?: number;
      origin?: [number, number];
    };

export interface DogDrawing {
  /** x y w h */
  viewBox: [number, number, number, number];
  shapes: Shape[];
}

/** The scene canvas. */
export const SCENE = { w: 120, h: 150 } as const;
/** Where the head sits on it. */
const HEAD = { cx: 60, cy: 52 } as const;
/** The bust crop: a 112 × 112 window around the head, tall enough that erect ears are not clipped. */
export const BUST_BOX: [number, number, number, number] = [4, -8, 112, 112];

/** Natural coats. Never a UI colour. */
export const COATS = {
  cream: "#E9D8BC",
  gold: "#D6A55E",
  red: "#B56B3E",
  chocolate: "#6E4B34",
  black: "#2C2B2F",
  grey: "#7E8087",
  /** A hair darker than the paper it sits on, or a white dog has no edge. */
  white: "#E8E2D6",
  tan: "#C99C68",
  fawn: "#C8A67C",
  wheaten: "#D9C39A",
} as const;

export const COLLARS = {
  blue: "#3F6F8F",
  red: "#B4503C",
  green: "#3E6B52",
  amber: "#C58A2C",
  plum: "#7A4E7D",
  black: "#2C2B2F",
} as const;

const INK = "#24221F";
const TONGUE = "#D98B87";
const INNER_EAR = "#E3B8A8";

interface Template {
  coat: string;
  marking: string;
  /** Scales the ears; the toy and spitz families run smaller so a round head does not read as a cat. */
  earScale?: number;
  /** A rounded tuft on the crown — the poodle's topknot. */
  topknot?: boolean;
  /** The lighter face patch under the eyes and around the muzzle, if the family has one. */
  muzzlePatch: string | null;
  head: { rx: number; ry: number };
  muzzle: { rx: number; ry: number; dy: number };
  eyes: { dx: number; dy: number; r: number };
  ears: EarKind;
  markingKind: MarkingKind;
  body: { chest: number; legs: number; tail: TailKind; long?: boolean };
}

type EarKind =
  | "floppy"
  | "long"
  | "pointed"
  | "semi"
  | "folded"
  | "button"
  | "bat"
  | "mixed";
type MarkingKind =
  "solid" | "blaze" | "mask" | "cap" | "tanPoints" | "beard" | "spitzMask";
type TailKind = "plume" | "straight" | "curl" | "short";

const TEMPLATES: Record<BreedGroup, Template> = {
  sporting: {
    coat: COATS.gold,
    marking: "#B9873F",
    muzzlePatch: COATS.cream,
    head: { rx: 26, ry: 25 },
    muzzle: { rx: 14, ry: 10, dy: 11 },
    eyes: { dx: 11, dy: -5, r: 3.2 },
    ears: "floppy",
    markingKind: "solid",
    body: { chest: 26, legs: 30, tail: "plume" },
  },
  herding: {
    coat: COATS.tan,
    marking: COATS.black,
    muzzlePatch: null,
    head: { rx: 25, ry: 24 },
    muzzle: { rx: 13, ry: 11, dy: 13 },
    eyes: { dx: 10.5, dy: -5, r: 3.1 },
    ears: "pointed",
    markingKind: "cap",
    body: { chest: 25, legs: 32, tail: "straight" },
  },
  hound: {
    coat: COATS.tan,
    marking: COATS.chocolate,
    muzzlePatch: COATS.white,
    head: { rx: 25, ry: 26 },
    muzzle: { rx: 13, ry: 11, dy: 12 },
    eyes: { dx: 10.5, dy: -4, r: 3.4 },
    ears: "long",
    markingKind: "blaze",
    body: { chest: 24, legs: 22, tail: "straight", long: true },
  },
  working: {
    coat: COATS.black,
    marking: COATS.tan,
    muzzlePatch: null,
    head: { rx: 29, ry: 25 },
    muzzle: { rx: 16, ry: 9, dy: 12 },
    eyes: { dx: 12, dy: -5, r: 3.1 },
    ears: "folded",
    markingKind: "tanPoints",
    body: { chest: 29, legs: 30, tail: "short" },
  },
  terrier: {
    coat: COATS.grey,
    marking: "#DAD6CE",
    muzzlePatch: null,
    head: { rx: 24, ry: 25 },
    muzzle: { rx: 12, ry: 10, dy: 12 },
    eyes: { dx: 10, dy: -5, r: 3 },
    ears: "button",
    markingKind: "beard",
    body: { chest: 22, legs: 26, tail: "short" },
  },
  toy: {
    coat: COATS.cream,
    marking: "#CFB48C",
    muzzlePatch: null,
    earScale: 0.82,
    head: { rx: 27, ry: 25 },
    muzzle: { rx: 12, ry: 9, dy: 12 },
    eyes: { dx: 12, dy: -4, r: 3.9 },
    ears: "pointed",
    markingKind: "solid",
    body: { chest: 19, legs: 22, tail: "curl" },
  },
  non_sporting: {
    coat: COATS.fawn,
    marking: "#4B3F39",
    muzzlePatch: null,
    head: { rx: 28, ry: 24 },
    muzzle: { rx: 15, ry: 7.5, dy: 14 },
    eyes: { dx: 12.5, dy: -3, r: 3.4 },
    ears: "bat",
    markingKind: "mask",
    body: { chest: 27, legs: 22, tail: "short" },
  },
  spitz: {
    coat: COATS.grey,
    marking: COATS.white,
    muzzlePatch: null,
    earScale: 0.8,
    head: { rx: 26, ry: 24 },
    muzzle: { rx: 13, ry: 10, dy: 12 },
    eyes: { dx: 10.5, dy: -5, r: 3.1 },
    ears: "pointed",
    markingKind: "spitzMask",
    body: { chest: 26, legs: 30, tail: "curl" },
  },
  mixed: {
    coat: COATS.tan,
    marking: COATS.white,
    muzzlePatch: null,
    head: { rx: 26, ry: 24 },
    muzzle: { rx: 13, ry: 10, dy: 12 },
    eyes: { dx: 11, dy: -5, r: 3.3 },
    ears: "mixed",
    markingKind: "blaze",
    body: { chest: 25, legs: 28, tail: "plume" },
  },
};

/**
 * Exact breeds, as adjustments to their family template.
 *
 * Only the vocabulary the families already use — a coat, a marking kind, an ear kind, a proportion — so a Border
 * Collie is drawn by the same hand as the shepherd next to it rather than as a separate illustration. A breed
 * with no entry here draws as its family, which is the fallback the picker promises.
 */
const BREED_OVERRIDES: Record<string, Partial<Template>> = {
  labrador_retriever: {
    coat: COATS.wheaten,
    marking: "#C9AE7E",
    muzzlePatch: null,
    head: { rx: 27, ry: 24 },
    muzzle: { rx: 15, ry: 10, dy: 11 },
    body: { chest: 27, legs: 30, tail: "straight" },
  },
  golden_retriever: {
    coat: COATS.gold,
    marking: "#B9873F",
  },
  cocker_spaniel: {
    coat: "#C88A48",
    marking: "#9F6A32",
    ears: "long",
    head: { rx: 24, ry: 25 },
    muzzle: { rx: 12, ry: 11, dy: 12 },
  },
  german_shepherd: {},
  belgian_malinois: {
    coat: COATS.fawn,
    marking: "#4B3F39",
    markingKind: "mask",
    muzzle: { rx: 13, ry: 10, dy: 13 },
  },
  canaan_dog: {
    coat: COATS.cream,
    marking: COATS.tan,
    markingKind: "cap",
    body: { chest: 24, legs: 30, tail: "curl" },
  },
  border_collie: {
    coat: COATS.black,
    marking: COATS.white,
    markingKind: "blaze",
    muzzlePatch: COATS.white,
    ears: "semi",
    body: { chest: 24, legs: 30, tail: "plume" },
  },
  australian_shepherd: {
    coat: "#8E8A84",
    marking: COATS.white,
    markingKind: "blaze",
    ears: "folded",
    body: { chest: 25, legs: 30, tail: "short" },
  },
  pembroke_welsh_corgi: {
    coat: COATS.red,
    marking: COATS.white,
    markingKind: "blaze",
    muzzlePatch: null,
    head: { rx: 26, ry: 23 },
    body: { chest: 24, legs: 16, tail: "short", long: true },
  },
  beagle: {},
  dachshund: {
    coat: COATS.red,
    marking: COATS.chocolate,
    muzzlePatch: null,
    markingKind: "solid",
    head: { rx: 23, ry: 24 },
    muzzle: { rx: 12, ry: 12, dy: 14 },
    body: { chest: 23, legs: 16, tail: "straight", long: true },
  },
  rottweiler: {},
  boxer: {
    coat: COATS.fawn,
    marking: "#4B3F39",
    markingKind: "mask",
    ears: "folded",
    head: { rx: 27, ry: 25 },
    muzzle: { rx: 15, ry: 8, dy: 13 },
    body: { chest: 27, legs: 32, tail: "short" },
  },
  miniature_schnauzer: {},
  jack_russell_terrier: {
    coat: COATS.white,
    marking: COATS.tan,
    markingKind: "cap",
    ears: "button",
    head: { rx: 24, ry: 24 },
    muzzle: { rx: 12, ry: 9, dy: 12 },
    body: { chest: 21, legs: 24, tail: "straight" },
  },
  american_staffordshire_terrier: {
    coat: "#7A6B60",
    marking: COATS.white,
    markingKind: "blaze",
    ears: "folded",
    head: { rx: 28, ry: 24 },
    muzzle: { rx: 15, ry: 9, dy: 13 },
    body: { chest: 28, legs: 28, tail: "straight" },
  },
  american_pit_bull_terrier: {
    coat: COATS.fawn,
    marking: COATS.white,
    markingKind: "blaze",
    ears: "folded",
    head: { rx: 28, ry: 24 },
    muzzle: { rx: 15, ry: 9, dy: 13 },
    body: { chest: 28, legs: 28, tail: "straight" },
  },
  yorkshire_terrier: {
    coat: COATS.tan,
    marking: "#6F7380",
    ears: "pointed",
    head: { rx: 25, ry: 24 },
    muzzle: { rx: 10, ry: 8, dy: 12 },
    body: { chest: 17, legs: 18, tail: "short" },
  },
  cavalier_king_charles_spaniel: {
    coat: COATS.white,
    marking: "#A65A33",
    // Blenheim: chestnut over the ears and crown, a white blaze and muzzle.
    markingKind: "cap",
    ears: "long",
    head: { rx: 25, ry: 24 },
    muzzle: { rx: 11, ry: 9, dy: 12 },
    eyes: { dx: 11, dy: -4, r: 3.8 },
    body: { chest: 20, legs: 22, tail: "plume" },
  },
  chihuahua: {},
  pomeranian: {
    coat: "#D9924C",
    marking: "#C27B34",
    ears: "pointed",
    head: { rx: 29, ry: 26 },
    muzzle: { rx: 9, ry: 7, dy: 12 },
    body: { chest: 22, legs: 16, tail: "curl" },
  },
  maltese: {
    coat: COATS.white,
    marking: "#E4DED4",
    ears: "floppy",
    head: { rx: 26, ry: 25 },
    muzzle: { rx: 10, ry: 8, dy: 12 },
    body: { chest: 20, legs: 18, tail: "curl" },
  },
  shih_tzu: {
    coat: COATS.wheaten,
    marking: COATS.white,
    markingKind: "blaze",
    ears: "long",
    head: { rx: 27, ry: 25 },
    muzzle: { rx: 11, ry: 7, dy: 13 },
    body: { chest: 21, legs: 18, tail: "curl" },
  },
  pug: {
    coat: COATS.fawn,
    marking: "#4B3F39",
    markingKind: "mask",
    ears: "folded",
    head: { rx: 28, ry: 25 },
    muzzle: { rx: 13, ry: 7, dy: 13 },
    eyes: { dx: 12, dy: -3, r: 4 },
    body: { chest: 23, legs: 18, tail: "curl" },
  },
  french_bulldog: {},
  poodle: {
    coat: COATS.cream,
    marking: "#DCCBAA",
    markingKind: "solid",
    muzzlePatch: null,
    topknot: true,
    ears: "long",
    head: { rx: 25, ry: 26 },
    muzzle: { rx: 11, ry: 11, dy: 13 },
    body: { chest: 23, legs: 32, tail: "short" },
  },
  siberian_husky: {},
  shiba_inu: {
    coat: "#D98A45",
    marking: COATS.white,
    markingKind: "spitzMask",
    head: { rx: 25, ry: 23 },
    body: { chest: 23, legs: 26, tail: "curl" },
  },
};

/** Breeds with their own overrides — the dev preview lists them. */
export const EXACT_BREEDS: readonly string[] = Object.keys(
  BREED_OVERRIDES,
).filter((id) => Object.keys(BREED_OVERRIDES[id] ?? {}).length > 0);

// --------------------------------------------------------------------------------------------------------------

export function drawDog(appearance: DogAppearance): DogDrawing {
  const family = TEMPLATES[appearance.group];
  const override = appearance.breedId
    ? BREED_OVERRIDES[appearance.breedId]
    : undefined;
  const template: Template = override ? { ...family, ...override } : family;
  const pose = appearance.pose ?? "bust";
  const expression = appearance.expression ?? "attentive";
  const puppy = appearance.puppy ?? false;
  const collar = appearance.collar ?? COLLARS.blue;
  const shapes: Shape[] = [];

  const dark = isDark(template.coat);
  /** Features on a black coat need a lifted value or they vanish. */
  const feature = dark ? "#3A3A3F" : INK;

  const headScale = puppy ? 1.06 : 1;
  const resting = expression === "resting";
  const headCy = HEAD.cy + (resting && pose === "scene" ? 10 : 0);
  const head = {
    cx: HEAD.cx,
    cy: headCy,
    rx: template.head.rx * headScale,
    ry: template.head.ry * headScale * (puppy ? 1.04 : 1),
  };
  const tilt = expression === "puzzled" ? 10 : 0;
  const origin: [number, number] = [head.cx, head.cy];

  // Body first, so the head sits on it.
  if (pose === "scene") {
    shapes.push(...body(template, appearance, head, collar, resting));
  }

  // Ears behind the head.
  shapes.push(...ears(template, head, puppy, expression, tilt, origin));

  // Head.
  shapes.push({
    kind: "ellipse",
    cx: head.cx,
    cy: head.cy,
    rx: head.rx,
    ry: head.ry,
    fill: template.coat,
    rotate: tilt,
  });

  // Signature markings on the head.
  shapes.push(...markings(template, head, tilt, origin));

  // Muzzle patch.
  const muzzle = {
    cx: head.cx,
    cy: head.cy + template.muzzle.dy * (puppy ? 0.9 : 1),
    rx: template.muzzle.rx * (puppy ? 0.9 : 1),
    ry: template.muzzle.ry * (puppy ? 0.92 : 1),
  };
  if (template.muzzlePatch) {
    shapes.push({
      kind: "ellipse",
      cx: muzzle.cx,
      cy: muzzle.cy - 1,
      rx: muzzle.rx,
      ry: muzzle.ry,
      fill: appearance.senior ? COATS.white : template.muzzlePatch,
      rotate: tilt,
    });
  } else if (appearance.senior) {
    shapes.push({
      kind: "ellipse",
      cx: muzzle.cx,
      cy: muzzle.cy,
      rx: muzzle.rx * 0.9,
      ry: muzzle.ry * 0.8,
      fill: "#D9D4CB",
      rotate: tilt,
    });
  }

  // Eyes.
  const eyeR = template.eyes.r * (puppy ? 1.22 : 1);
  const eyeY = head.cy + template.eyes.dy;
  for (const side of [-1, 1] as const) {
    const ex = head.cx + side * template.eyes.dx;
    if (resting) {
      shapes.push({
        kind: "path",
        d: `M ${ex - eyeR} ${eyeY} q ${eyeR} ${eyeR * 0.9} ${eyeR * 2} 0`,
        stroke: feature,
        width: 1.8,
        rotate: tilt,
        origin,
      });
    } else {
      shapes.push({ kind: "circle", cx: ex, cy: eyeY, r: eyeR, fill: feature });
    }
    if (expression === "focused") {
      shapes.push({
        kind: "path",
        d: `M ${ex - eyeR * 1.3} ${eyeY - eyeR * 2.3} l ${side * -eyeR * 0.5 + eyeR * 2.6} ${eyeR * 0.8}`,
        stroke: feature,
        width: 1.6,
        rotate: tilt,
        origin,
      });
    }
  }

  // Nose: a soft triangle.
  const noseR = 4.4 * (puppy ? 0.9 : 1) * (template.muzzle.rx > 14 ? 1.15 : 1);
  const noseY = muzzle.cy - muzzle.ry * 0.45;
  shapes.push({
    kind: "path",
    d: `M ${head.cx - noseR} ${noseY - noseR * 0.6} h ${noseR * 2} q ${noseR * 0.2} 0 0 ${noseR * 0.5} l ${-noseR * 0.75} ${noseR * 1.05} q ${-noseR * 0.25} ${noseR * 0.25} ${-noseR * 0.5} 0 l ${-noseR * 0.75} ${-noseR * 1.05} q ${-noseR * 0.2} ${-noseR * 0.5} 0 ${-noseR * 0.5} z`,
    fill: feature,
    rotate: tilt,
    origin,
  });

  // Mouth.
  const mouthY = noseY + noseR * 1.2;
  if (expression === "happy") {
    shapes.push({
      kind: "path",
      d: `M ${head.cx - 7} ${mouthY} q 7 9 14 0 z`,
      fill: feature,
      rotate: tilt,
      origin,
    });
    shapes.push({
      kind: "ellipse",
      cx: head.cx,
      cy: mouthY + 4.2,
      rx: 3.6,
      ry: 3.2,
      fill: TONGUE,
      rotate: tilt,
    });
  } else {
    shapes.push({
      kind: "path",
      d: `M ${head.cx} ${mouthY} v 1.6 m 0 0 q -3.5 4 -6.5 0.6 m 6.5 -0.6 q 3.5 4 6.5 0.6`,
      stroke: feature,
      width: 1.5,
      rotate: tilt,
      origin,
    });
  }

  return {
    viewBox: pose === "scene" ? [0, 0, SCENE.w, SCENE.h] : BUST_BOX,
    shapes,
  };
}

// --------------------------------------------------------------------------------------------------------------

function ears(
  t: Template,
  head: { cx: number; cy: number; rx: number; ry: number },
  puppy: boolean,
  expression: DogExpression,
  tilt: number,
  origin: [number, number],
): Shape[] {
  const out: Shape[] = [];
  const earColor =
    t.markingKind === "cap" ||
    t.markingKind === "spitzMask" ||
    t.ears === "long"
      ? t.marking === COATS.white
        ? t.coat
        : t.marking
      : t.ears === "floppy"
        ? t.marking
        : t.coat;
  const relaxed = expression === "happy" || expression === "resting";
  const scale = (puppy ? 1.12 : 1) * (t.earScale ?? 1);
  // A pink inner ear on a black dog reads as a wound, not an ear.
  const innerEar = isDark(t.coat) ? null : INNER_EAR;
  const kind: EarKind =
    puppy && (t.ears === "pointed" || t.ears === "bat") ? "folded" : t.ears;

  const push = (side: -1 | 1, k: EarKind) => {
    const x = head.cx + side * head.rx * 0.78;
    const top = head.cy - head.ry * 0.62;
    switch (k) {
      case "pointed": {
        const spread = relaxed ? 6 : 0;
        const tipX = x + side * (12 + spread) * scale;
        const tipY = top - 26 * scale + spread * 1.5;
        out.push({
          kind: "path",
          d: `M ${x - side * 9} ${top + 4} Q ${tipX - side * 2} ${tipY - 6} ${tipX} ${tipY} Q ${x + side * 12} ${top + 6} ${x + side * 6} ${top + 14} z`,
          fill: earColor,
          rotate: tilt,
          origin,
        });
        if (innerEar) {
          out.push({
            kind: "path",
            d: `M ${x - side * 3} ${top + 6} Q ${tipX - side * 4} ${tipY} ${tipX - side * 1.5} ${tipY + 3} Q ${x + side * 7} ${top + 8} ${x + side * 4} ${top + 12} z`,
            fill: innerEar,
            rotate: tilt,
            origin,
          });
        }
        break;
      }
      case "bat": {
        out.push({
          kind: "ellipse",
          cx: x + side * 5,
          cy: top - 8 * scale,
          rx: 9 * scale,
          ry: 17 * scale,
          fill: earColor,
          rotate: tilt + side * 12,
        });
        out.push({
          kind: "ellipse",
          cx: x + side * 5,
          cy: top - 6 * scale,
          rx: 5 * scale,
          ry: 11 * scale,
          fill: INNER_EAR,
          rotate: tilt + side * 12,
        });
        break;
      }
      case "floppy": {
        out.push({
          kind: "ellipse",
          cx: x + side * 6,
          cy: head.cy + 6,
          rx: 8.5 * scale,
          ry: 20 * scale,
          fill: earColor,
          rotate: tilt + side * (relaxed ? 16 : 10),
        });
        break;
      }
      case "long": {
        out.push({
          kind: "ellipse",
          cx: x + side * 5,
          cy: head.cy + 16,
          rx: 8 * scale,
          ry: 24 * scale,
          fill: earColor,
          rotate: tilt + side * 6,
        });
        break;
      }
      case "folded": {
        out.push({
          kind: "path",
          d: `M ${x - side * 8} ${top + 6} Q ${x + side * 4} ${top - 14 * scale} ${x + side * 14} ${top - 4} Q ${x + side * 10} ${top + 8} ${x + side * 2} ${top + 12} z`,
          fill: earColor,
          rotate: tilt,
          origin,
        });
        break;
      }
      case "button": {
        out.push({
          kind: "path",
          d: `M ${x - side * 6} ${top + 4} Q ${x + side * 3} ${top - 8} ${x + side * 12} ${top + 1} Q ${x + side * 8} ${top + 10} ${x} ${top + 10} z`,
          fill: t.marking === "#DAD6CE" ? t.coat : earColor,
          rotate: tilt,
          origin,
        });
        break;
      }
      case "semi": {
        // Half-pricked: a short erect ear whose tip bends over.
        const tipX = x + side * 9 * scale;
        const tipY = top - 15 * scale;
        out.push({
          kind: "path",
          d: `M ${x - side * 9} ${top + 4} Q ${tipX - side * 6} ${tipY - 2} ${tipX} ${tipY} Q ${x + side * 14} ${tipY + 6} ${x + side * 6} ${top + 14} z`,
          fill: earColor,
          rotate: tilt,
          origin,
        });
        if (innerEar) {
          out.push({
            kind: "path",
            d: `M ${x - side * 3} ${top + 6} Q ${tipX - side * 5} ${tipY + 3} ${tipX - side * 1} ${tipY + 4} Q ${x + side * 8} ${tipY + 8} ${x + side * 4} ${top + 12} z`,
            fill: innerEar,
            rotate: tilt,
            origin,
          });
        }
        break;
      }
      case "mixed":
        break;
    }
  };

  if (kind === "mixed") {
    // The generic dog: one ear folded, one half up — the charm of a mixed breed.
    push(-1, "folded");
    push(1, relaxed ? "folded" : "semi");
  } else if (
    expression === "puzzled" &&
    (kind === "pointed" || kind === "folded")
  ) {
    push(-1, "folded");
    push(1, kind === "pointed" ? "pointed" : "semi");
  } else {
    push(-1, kind);
    push(1, kind);
  }
  return out;
}

function markings(
  t: Template,
  head: { cx: number; cy: number; rx: number; ry: number },
  tilt: number,
  origin: [number, number],
): Shape[] {
  const out: Shape[] = [];
  switch (t.markingKind) {
    case "blaze":
      // A stripe of white down the face into a white muzzle.
      out.push({
        kind: "path",
        d: `M ${head.cx - 2.5} ${head.cy - head.ry + 1} q 2.5 -1.5 5 0 l 4.5 ${head.ry * 0.95} q -7 6 -14 0 z`,
        fill: t.marking,
        rotate: tilt,
        origin,
      });
      break;
    case "cap":
      // A shepherd's dark saddle over the top of the head, leaving the muzzle and cheeks tan.
      out.push({
        kind: "path",
        d: `M ${head.cx - head.rx * 0.98} ${head.cy - 9} q ${head.rx} ${-head.ry * 1.6} ${head.rx * 1.96} 0 q ${-head.rx * 0.3} ${-3} ${-head.rx * 0.6} ${-1} q ${-head.rx * 0.38} ${6} ${-head.rx * 0.76} 0 q ${-head.rx * 0.3} ${-2} ${-head.rx * 0.6} ${1} z`,
        fill: t.marking,
        rotate: tilt,
        origin,
      });
      break;
    case "mask":
      // A dark mask over a short, wide muzzle: flatter than it is tall, with the jowls falling either side.
      out.push({
        kind: "path",
        d: `M ${head.cx - t.muzzle.rx - 4} ${head.cy + t.muzzle.dy - 4} q ${t.muzzle.rx + 4} ${-t.muzzle.ry - 4} ${(t.muzzle.rx + 4) * 2} 0 q 1 ${t.muzzle.ry + 6} ${-(t.muzzle.rx + 4)} ${t.muzzle.ry + 7} q ${-(t.muzzle.rx + 5)} -1 ${-(t.muzzle.rx + 4)} ${-(t.muzzle.ry + 7)} z`,
        fill: t.marking,
        rotate: tilt,
        origin,
      });
      break;
    case "tanPoints":
      // Two brow dots and a tan muzzle on a black dog — the rottweiler's points, and nothing on the cheeks.
      for (const side of [-1, 1] as const) {
        out.push({
          kind: "circle",
          cx: head.cx + side * t.eyes.dx,
          cy: head.cy + t.eyes.dy - 8,
          r: 2.6,
          fill: t.marking,
        });
      }
      out.push({
        kind: "ellipse",
        cx: head.cx,
        cy: head.cy + t.muzzle.dy + 1,
        rx: t.muzzle.rx * 0.95,
        ry: t.muzzle.ry * 0.9,
        fill: t.marking,
        rotate: tilt,
      });
      break;
    case "beard": {
      // A terrier's beard and brows in the lighter value.
      out.push({
        kind: "ellipse",
        cx: head.cx,
        cy: head.cy + t.muzzle.dy + 6,
        rx: t.muzzle.rx + 2,
        ry: t.muzzle.ry + 1,
        fill: t.marking,
        rotate: tilt,
      });
      for (const side of [-1, 1] as const) {
        out.push({
          kind: "ellipse",
          cx: head.cx + side * t.eyes.dx,
          cy: head.cy + t.eyes.dy - 6.5,
          rx: 5.5,
          ry: 2.6,
          fill: t.marking,
          rotate: tilt + side * -12,
        });
      }
      break;
    }
    case "spitzMask":
      // The husky's white face: a mask around the eyes and down the muzzle, leaving a grey cap.
      out.push({
        kind: "path",
        d: `M ${head.cx - head.rx * 0.9} ${head.cy + 2} q ${head.rx * 0.35} ${-14} ${head.rx * 0.9} ${-6} q ${head.rx * 0.55} ${-8} ${head.rx * 0.9} ${6} q 0 ${head.ry * 0.85} ${-head.rx * 0.9} ${head.ry * 0.95} q ${-head.rx * 0.9} ${-2} ${-head.rx * 0.9} ${-head.ry * 0.95} z`,
        fill: t.marking,
        rotate: tilt,
        origin,
      });
      break;
    case "solid":
      break;
  }
  if (t.topknot) {
    out.push({
      kind: "ellipse",
      cx: head.cx,
      cy: head.cy - head.ry * 0.92,
      rx: head.rx * 0.5,
      ry: head.ry * 0.36,
      fill: t.coat,
      rotate: tilt,
    });
  }
  return out;
}

function body(
  t: Template,
  a: DogAppearance,
  head: { cx: number; cy: number; rx: number; ry: number },
  collar: string,
  resting: boolean,
): Shape[] {
  const out: Shape[] = [];
  const sizeScale = a.size === "small" ? 0.85 : a.size === "large" ? 1.08 : 1;
  const puppyScale = a.puppy ? 0.8 : 1;
  const s = sizeScale * puppyScale;
  const chest = t.body.chest * s;
  const legs = t.body.legs * s;
  const bodyTop = head.cy + head.ry - 6;

  if (resting) {
    // Lying down: a long low body, front legs stretched forward past the chest, tail resting.
    const cy = bodyTop + 26;
    out.push({
      kind: "path",
      d: tailPath(t.body.tail, head.cx + chest * 1.3, cy + 4, true),
      stroke: t.coat,
      width: 6.5 * s,
    });
    out.push({
      kind: "ellipse",
      cx: head.cx + 10,
      cy,
      rx: chest * 1.5,
      ry: chest * 0.62,
      fill: t.coat,
    });
    if (t.markingKind === "cap") {
      out.push({
        kind: "ellipse",
        cx: head.cx + 16,
        cy: cy - chest * 0.25,
        rx: chest * 1.05,
        ry: chest * 0.3,
        fill: t.marking,
      });
    }
    for (const dx of [-22, -6]) {
      out.push({
        kind: "ellipse",
        cx: head.cx + dx,
        cy: cy + chest * 0.48,
        rx: 15 * s,
        ry: 5.5 * s,
        fill: t.coat,
      });
      out.push({
        kind: "ellipse",
        cx: head.cx + dx - 11 * s,
        cy: cy + chest * 0.5,
        rx: 6.5 * s,
        ry: 4.5 * s,
        fill: t.muzzlePatch ?? t.coat,
      });
    }
    out.push(collarShape(head, collar, 6));
    return out;
  }

  if (t.body.long) {
    // The long-low build: a horizontal barrel, short legs at both ends, the tail off the far end.
    const barrelCy = bodyTop + chest * 0.7;
    const barrelRx = chest * 1.35;
    const barrelRy = chest * 0.62;
    out.push({
      kind: "path",
      d: tailPath(t.body.tail, head.cx + barrelRx * 0.95, barrelCy - 2, false),
      stroke: t.coat,
      width: 6 * s,
    });
    out.push({
      kind: "ellipse",
      cx: head.cx + chest * 0.35,
      cy: barrelCy,
      rx: barrelRx,
      ry: barrelRy,
      fill: t.coat,
    });
    if (t.markingKind === "blaze" || t.muzzlePatch) {
      out.push({
        kind: "ellipse",
        cx: head.cx - chest * 0.1,
        cy: barrelCy + barrelRy * 0.35,
        rx: chest * 0.55,
        ry: barrelRy * 0.5,
        fill: t.marking === COATS.black ? t.coat : (t.muzzlePatch ?? t.marking),
      });
    }
    for (const lx of [
      head.cx - chest * 0.55,
      head.cx - chest * 0.15,
      head.cx + chest * 1.05,
      head.cx + chest * 1.4,
    ]) {
      out.push({
        kind: "path",
        d: `M ${lx - 4 * s} ${barrelCy + barrelRy * 0.6} h ${8 * s} v ${legs} h ${-8 * s} z`,
        fill: t.coat,
      });
      out.push({
        kind: "ellipse",
        cx: lx,
        cy: barrelCy + barrelRy * 0.6 + legs,
        rx: 6 * s,
        ry: 3.8 * s,
        fill: t.muzzlePatch ?? t.coat,
      });
    }
    out.push(collarShape(head, collar, 0));
    return out;
  }

  // Sitting, three-quarter front. Haunch behind, torso, front legs, tail.
  const torsoCy = bodyTop + chest * 0.85;
  out.push({
    kind: "path",
    d: tailPath(
      t.body.tail,
      head.cx + chest * 0.95,
      torsoCy + chest * 0.55,
      false,
    ),
    stroke: t.coat,
    width: 6.5 * s,
  });
  out.push({
    kind: "ellipse",
    cx: head.cx + chest * 0.62,
    cy: torsoCy + chest * 0.45,
    rx: chest * 0.78,
    ry: chest * 0.62,
    fill: t.coat,
  });
  out.push({
    kind: "ellipse",
    cx: head.cx,
    cy: torsoCy,
    rx: chest,
    ry: chest * 0.9,
    fill: t.coat,
  });
  if (t.markingKind === "cap") {
    out.push({
      kind: "path",
      d: `M ${head.cx - chest * 0.6} ${torsoCy - chest * 0.6} q ${chest * 0.6} ${-chest * 0.4} ${chest * 1.5} ${chest * 0.2} q ${-chest * 0.2} ${chest * 0.9} ${-chest * 0.9} ${chest * 0.85} q ${-chest * 0.5} ${-chest * 0.6} ${-chest * 0.6} ${-chest * 1.05} z`,
      fill: t.marking,
    });
  }
  if (
    t.markingKind === "blaze" ||
    t.markingKind === "spitzMask" ||
    t.muzzlePatch
  ) {
    // A lighter chest.
    out.push({
      kind: "ellipse",
      cx: head.cx,
      cy: torsoCy + chest * 0.15,
      rx: chest * 0.42,
      ry: chest * 0.55,
      fill:
        t.markingKind === "solid"
          ? (t.muzzlePatch ?? t.coat)
          : t.marking === COATS.black
            ? t.coat
            : t.marking,
    });
  }
  if (t.markingKind === "tanPoints") {
    out.push({
      kind: "ellipse",
      cx: head.cx,
      cy: torsoCy + chest * 0.2,
      rx: chest * 0.35,
      ry: chest * 0.4,
      fill: t.marking,
    });
  }
  // Front legs.
  for (const side of [-1, 1] as const) {
    const lx = head.cx + side * chest * 0.42;
    out.push({
      kind: "path",
      d: `M ${lx - 4.5 * s} ${torsoCy} h ${9 * s} v ${legs} h ${-9 * s} z`,
      fill: t.coat,
    });
    out.push({
      kind: "ellipse",
      cx: lx + side * 1,
      cy: torsoCy + legs,
      rx: 7 * s,
      ry: 4.2 * s,
      fill:
        t.markingKind === "tanPoints" ? t.marking : (t.muzzlePatch ?? t.coat),
    });
  }
  out.push(collarShape(head, collar, 0));
  return out;
}

function tailPath(
  kind: TailKind,
  x: number,
  y: number,
  lying: boolean,
): string {
  switch (kind) {
    case "plume":
      return lying ? `M ${x} ${y} q 14 2 20 -10` : `M ${x} ${y} q 16 -4 14 -22`;
    case "straight":
      return lying ? `M ${x} ${y} q 12 4 22 -4` : `M ${x} ${y} q 12 -10 10 -26`;
    case "curl":
      return lying
        ? `M ${x} ${y} q 12 -6 8 -16`
        : `M ${x} ${y} q 10 -14 -4 -22 q -8 -4 -12 4`;
    case "short":
      return lying ? `M ${x} ${y} q 6 0 8 -4` : `M ${x} ${y} q 6 -6 4 -12`;
  }
}

function collarShape(
  head: { cx: number; cy: number; rx: number; ry: number },
  collar: string,
  dy: number,
): Shape {
  const y = head.cy + head.ry - 2 + dy;
  return {
    kind: "path",
    d: `M ${head.cx - head.rx * 0.72} ${y} q ${head.rx * 0.72} ${9} ${head.rx * 1.44} 0`,
    stroke: collar,
    width: 5,
  };
}

function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 90;
}

/** The nine families, in the order the dev preview and the breed grid show them. */
export const FAMILY_ORDER: readonly BreedGroup[] = [
  "mixed",
  "sporting",
  "herding",
  "hound",
  "working",
  "terrier",
  "toy",
  "non_sporting",
  "spitz",
];
