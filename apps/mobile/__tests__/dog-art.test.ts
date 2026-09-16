import { palette } from "@pawcue/ui";
import {
  COATS,
  EXACT_BREEDS,
  FAMILY_ORDER,
  TREAT_FILL,
  drawDog,
  type BodyPose,
  type DogAppearance,
  type DogExpression,
  type DogPose,
  type DogProp,
} from "../src/dogs/dog-art";
import { BREEDS } from "../src/dogs/breeds";
import { lookFor } from "../src/dogs/breed-lookup";

/**
 * The character, as geometry.
 *
 * These protect the promises the art direction made: every dog draws from one system, breeds are genuinely
 * different, natural coats never borrow a UI colour, and the fallback hierarchy always ends at a drawable dog —
 * and, since Phase 11 (docs/architecture/phase-11-the-dog-at-work.md), that every family has every pose, that
 * pose and expression are independent, that props are asked for and never implied, and that every shape is
 * tagged for the renderer that will move it.
 */

const BODY_POSES: BodyPose[] = ["sit", "down", "rest", "stand", "run"];
const POSES: DogPose[] = ["bust", ...BODY_POSES];
const PROPS: DogProp[] = ["treat", "mat", "leash"];
const EXPRESSIONS: DogExpression[] = [
  "attentive",
  "happy",
  "focused",
  "resting",
  "puzzled",
];

function fills(shapes: ReturnType<typeof drawDog>["shapes"]): string[] {
  return shapes.flatMap((shape) =>
    shape.kind === "path"
      ? [shape.fill, shape.stroke].filter((v): v is string => Boolean(v))
      : [shape.fill],
  );
}

describe("the family templates", () => {
  it("draw every family in every pose and expression, with and without the puppy modifier", () => {
    for (const group of FAMILY_ORDER) {
      for (const pose of POSES) {
        for (const expression of EXPRESSIONS) {
          for (const puppy of [false, true]) {
            const drawing = drawDog({
              group,
              size: "medium",
              ears: "folded",
              pose,
              expression,
              puppy,
            });
            expect(drawing.shapes.length).toBeGreaterThanOrEqual(6);
            expect(drawing.viewBox).toHaveLength(4);
          }
        }
      }
    }
  });

  it("gives the body poses a body and the bust only a head", () => {
    const bust = drawDog({
      group: "mixed",
      size: "medium",
      ears: "folded",
      pose: "bust",
    });
    expect(bust.shapes.some((shape) => shape.part === "body")).toBe(false);
    expect(bust.shapes.some((shape) => shape.part === "tail")).toBe(false);
    // The bust window is square; the scene canvas is taller than it is wide.
    expect(bust.viewBox[2]).toBe(bust.viewBox[3]);
    for (const pose of BODY_POSES) {
      const drawn = drawDog({
        group: "mixed",
        size: "medium",
        ears: "folded",
        pose,
      });
      expect(drawn.shapes.some((shape) => shape.part === "body")).toBe(true);
      expect(drawn.shapes.length).toBeGreaterThan(bust.shapes.length);
      expect(drawn.viewBox[3]).toBeGreaterThan(drawn.viewBox[2]);
    }
  });

  /**
   * Phase 10's `scene` was kept as an alias for one session so the wiring could move each call site to the pose
   * it meant. The doc assigned its removal to the motion session; a caller asking for it now is a mistake, and
   * the module says so rather than guessing a body.
   */
  it("no longer answers to `scene`: the alias is gone from the types and from the drawing", () => {
    expect(POSES).not.toContain("scene");
    const stale: DogAppearance = {
      group: "hound",
      size: "medium",
      ears: "floppy",
      // @ts-expect-error — `scene` is not a DogPose any more; this is what a stale JavaScript caller sends.
      pose: "scene",
    };
    expect(() => drawDog(stale)).toThrow(/scene/);
  });

  it("makes the nine families visibly different from one another", () => {
    const signatures = FAMILY_ORDER.map((group) =>
      JSON.stringify(
        drawDog({ group, size: "medium", ears: "folded", pose: "bust" }).shapes,
      ),
    );
    expect(new Set(signatures).size).toBe(FAMILY_ORDER.length);
  });

  it("never colours a dog with a UI colour", () => {
    const ui = new Set(Object.values(palette).map((hex) => hex.toUpperCase()));
    for (const group of FAMILY_ORDER) {
      for (const pose of POSES) {
        const drawing = drawDog({
          group,
          size: "large",
          ears: "pointed",
          pose,
        });
        for (const colour of fills(drawing.shapes)) {
          // The catchlight is the one legitimately white shape; white is not a UI accent.
          if (colour.toUpperCase() === palette.white) continue;
          expect(ui.has(colour.toUpperCase())).toBe(false);
        }
      }
    }
  });

  it("uses the amber reward role on the treat and nowhere else in the whole set", () => {
    expect(TREAT_FILL).toBe(palette.amber);
    const ui = new Set(Object.values(palette).map((hex) => hex.toUpperCase()));
    let amberShapes = 0;
    for (const group of FAMILY_ORDER) {
      for (const pose of BODY_POSES) {
        const drawing = drawDog({
          group,
          size: "medium",
          ears: "floppy",
          pose,
          props: PROPS,
        });
        for (const shape of drawing.shapes) {
          const colours = fills([shape]).map((c) => c.toUpperCase());
          if (colours.includes(palette.amber.toUpperCase())) {
            amberShapes += 1;
            expect(shape.part).toBe("prop");
          }
          if (shape.part !== "prop") {
            for (const colour of colours) {
              if (colour === palette.white) continue;
              expect(ui.has(colour)).toBe(false);
            }
          }
        }
      }
    }
    // One treat per drawing, nine families by five poses.
    expect(amberShapes).toBe(FAMILY_ORDER.length * BODY_POSES.length);
  });

  it("draws a white dog a shade darker than the paper it sits on", () => {
    expect(COATS.white.toUpperCase()).not.toBe(palette.warmIvory);
  });

  /**
   * Phase 10 tied the lying body to the `resting` expression; Phase 11 split them. `resting` closes the eyes in
   * every pose and nothing else; `rest` lies down whatever the face is doing. The tilt stays with `puzzled`.
   */
  it("closes the eyes when resting in every pose, lies down in `rest` with any face, and tilts when puzzled", () => {
    const base = { group: "sporting", size: "large", ears: "floppy" } as const;
    for (const pose of POSES) {
      const attentive = drawDog({ ...base, pose });
      const resting = drawDog({ ...base, pose, expression: "resting" });
      expect(attentive.shapes.filter((s) => s.part === "eye")).toHaveLength(2);
      expect(attentive.shapes.filter((s) => s.part === "eyelid")).toHaveLength(
        0,
      );
      expect(resting.shapes.filter((s) => s.part === "eye")).toHaveLength(0);
      expect(resting.shapes.filter((s) => s.part === "eyelid")).toHaveLength(2);
      // The body is the pose's, not the expression's.
      const bodyOf = (d: typeof attentive) =>
        d.shapes.filter((s) => s.part === "body" || s.part === "tail");
      expect(bodyOf(resting)).toEqual(bodyOf(attentive));
    }
    // `rest` is the lying body regardless of expression, and it is not the sitting body.
    const restBodies = EXPRESSIONS.map((expression) =>
      JSON.stringify(
        drawDog({ ...base, pose: "rest", expression }).shapes.filter(
          (s) => s.part === "body" || s.part === "tail",
        ),
      ),
    );
    expect(new Set(restBodies).size).toBe(1);
    expect(restBodies[0]).not.toBe(
      JSON.stringify(
        drawDog({ ...base, pose: "sit" }).shapes.filter(
          (s) => s.part === "body" || s.part === "tail",
        ),
      ),
    );
    const puzzled = drawDog({ ...base, expression: "puzzled" });
    expect(puzzled.shapes.some((s) => "rotate" in s && s.rotate === 10)).toBe(
      true,
    );
  });

  /**
   * For the motion session: a blink is the eyelid arcs in place of the eyes and nothing else, so the renderer
   * can toggle it on a timer without a cross-fade; the tail declares its root so the wag turns it about the
   * right point by tag, never by reading the path.
   */
  it("blinks by swapping only the eyes for the eyelids, never on a bust, and roots every tail", () => {
    const base = { group: "herding", size: "large", ears: "pointed" } as const;
    for (const pose of BODY_POSES) {
      for (const expression of EXPRESSIONS) {
        const open = drawDog({ ...base, pose, expression });
        const blink = drawDog({ ...base, pose, expression, blink: true });
        expect(blink.shapes.filter((s) => s.part === "eye")).toHaveLength(0);
        expect(blink.shapes.filter((s) => s.part === "eyelid")).toHaveLength(2);
        const rest = (d: typeof open) =>
          d.shapes.filter((s) => s.part !== "eye" && s.part !== "eyelid");
        expect(rest(blink)).toEqual(rest(open));
        const tail = open.shapes.find((s) => s.part === "tail");
        expect(tail?.kind).toBe("path");
        if (tail?.kind === "path") {
          expect(tail.origin).toBeDefined();
          // The root is where the path starts.
          const [x, y] = tail.origin ?? [NaN, NaN];
          expect(tail.d.startsWith(`M ${x} ${y} `)).toBe(true);
        }
      }
    }
    const bust = drawDog({ ...base, pose: "bust", blink: true });
    expect(bust.shapes.filter((s) => s.part === "eye")).toHaveLength(2);
    expect(bust.shapes.filter((s) => s.part === "eyelid")).toHaveLength(0);
  });

  it("tags every shape, with exactly one tail and two eyes on every body pose", () => {
    for (const group of FAMILY_ORDER) {
      for (const pose of POSES) {
        const drawing = drawDog({
          group,
          size: "medium",
          ears: "folded",
          pose,
        });
        for (const shape of drawing.shapes) expect(shape.part).toBeDefined();
        expect(drawing.shapes.filter((s) => s.part === "eye")).toHaveLength(2);
        expect(drawing.shapes.filter((s) => s.part === "tail")).toHaveLength(
          pose === "bust" ? 0 : 1,
        );
        expect(drawing.shapes.some((s) => s.part === "head")).toBe(true);
        expect(drawing.shapes.some((s) => s.part === "ear")).toBe(true);
      }
    }
  });

  it("draws props only when asked, tagged as props, in no coat colour, and never on a bust", () => {
    const coats = new Set(Object.values(COATS).map((hex) => hex.toUpperCase()));
    for (const group of FAMILY_ORDER) {
      for (const pose of BODY_POSES) {
        const bare = drawDog({ group, size: "medium", ears: "folded", pose });
        expect(bare.shapes.filter((s) => s.part === "prop")).toHaveLength(0);
        for (const prop of PROPS) {
          const withOne = drawDog({
            group,
            size: "medium",
            ears: "folded",
            pose,
            props: [prop],
          });
          const props = withOne.shapes.filter((s) => s.part === "prop");
          expect(props).toHaveLength(1);
          for (const colour of fills(props)) {
            expect(coats.has(colour.toUpperCase())).toBe(false);
          }
          // The dog itself is unchanged by the prop.
          expect(withOne.shapes.filter((s) => s.part !== "prop")).toEqual(
            bare.shapes,
          );
        }
        const all = drawDog({
          group,
          size: "medium",
          ears: "folded",
          pose,
          props: PROPS,
        });
        expect(all.shapes.filter((s) => s.part === "prop")).toHaveLength(3);
      }
      const bust = drawDog({
        group,
        size: "medium",
        ears: "folded",
        pose: "bust",
        props: PROPS,
      });
      expect(bust.shapes.filter((s) => s.part === "prop")).toHaveLength(0);
    }
  });

  it("carries the proportion overrides into every pose", () => {
    for (const id of [
      "beagle",
      "dachshund",
      "french_bulldog",
      "siberian_husky",
    ]) {
      const look = lookFor(id);
      for (const pose of POSES) {
        for (const puppy of [false, true]) {
          const drawn = drawDog({
            group: look.group,
            size: look.size,
            ears: look.ears,
            ...(look.breedId ? { breedId: look.breedId } : {}),
            pose,
            puppy,
            senior: !puppy,
          });
          expect(drawn.shapes.length).toBeGreaterThanOrEqual(6);
        }
      }
    }
  });
});

describe("exact breeds", () => {
  it("cover the popular breeds and every one resolves through the dataset", () => {
    expect(EXACT_BREEDS.length).toBeGreaterThanOrEqual(20);
    for (const id of EXACT_BREEDS) {
      const breed = BREEDS.find((b) => b.id === id);
      expect(breed?.id).toBe(id);
      expect(lookFor(id)).toMatchObject({ breedId: id, resolvedFrom: "breed" });
    }
  });

  it("differ from their family template without leaving the system", () => {
    const collie = lookFor("Border Collie");
    const family = drawDog({
      group: collie.group,
      size: collie.size,
      ears: collie.ears,
    });
    const exact = drawDog({
      group: collie.group,
      size: collie.size,
      ears: collie.ears,
      ...(collie.breedId ? { breedId: collie.breedId } : {}),
    });
    expect(JSON.stringify(exact.shapes)).not.toBe(
      JSON.stringify(family.shapes),
    );
    // Same construction: the same order of shape kinds, give or take a marking.
    expect(
      Math.abs(exact.shapes.length - family.shapes.length),
    ).toBeLessThanOrEqual(3);
  });

  it("fall back to the family for a breed with no overrides, and to the generic dog for nothing", () => {
    const rare = BREEDS.find((b) => !EXACT_BREEDS.includes(b.id));
    expect(rare).toBeDefined();
    const look = lookFor(rare!.id);
    expect(look.resolvedFrom).toBe("breed");
    const drawn = drawDog({
      group: look.group,
      size: look.size,
      ears: look.ears,
      ...(look.breedId ? { breedId: look.breedId } : {}),
    });
    const family = drawDog({
      group: look.group,
      size: look.size,
      ears: look.ears,
    });
    expect(JSON.stringify(drawn.shapes)).toBe(JSON.stringify(family.shapes));

    const generic = lookFor(null);
    expect(generic).toMatchObject({ group: "mixed", resolvedFrom: "generic" });
    expect(drawDog(generic).shapes.length).toBeGreaterThanOrEqual(8);
  });
});
