import { palette } from "@pawcue/ui";
import {
  COATS,
  EXACT_BREEDS,
  FAMILY_ORDER,
  drawDog,
  type DogExpression,
  type DogPose,
} from "../src/dogs/dog-art";
import { BREEDS } from "../src/dogs/breeds";
import { lookFor } from "../src/dogs/breed-lookup";

/**
 * The character, as geometry.
 *
 * These protect the promises the art direction made: every dog draws from one system, breeds are genuinely
 * different, natural coats never borrow a UI colour, and the fallback hierarchy always ends at a drawable dog.
 */

const POSES: DogPose[] = ["bust", "scene"];
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

  it("gives the scene a body and the bust only a head", () => {
    const bust = drawDog({
      group: "mixed",
      size: "medium",
      ears: "folded",
      pose: "bust",
    });
    const scene = drawDog({
      group: "mixed",
      size: "medium",
      ears: "folded",
      pose: "scene",
    });
    expect(scene.shapes.length).toBeGreaterThan(bust.shapes.length);
    // The bust window is square; the scene canvas is taller than it is wide.
    expect(bust.viewBox[2]).toBe(bust.viewBox[3]);
    expect(scene.viewBox[3]).toBeGreaterThan(scene.viewBox[2]);
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

  it("draws a white dog a shade darker than the paper it sits on", () => {
    expect(COATS.white.toUpperCase()).not.toBe(palette.warmIvory);
  });

  it("closes the eyes when resting and tilts the head when puzzled", () => {
    const attentive = drawDog({
      group: "sporting",
      size: "large",
      ears: "floppy",
    });
    const resting = drawDog({
      group: "sporting",
      size: "large",
      ears: "floppy",
      expression: "resting",
    });
    const puzzled = drawDog({
      group: "sporting",
      size: "large",
      ears: "floppy",
      expression: "puzzled",
    });
    const eyes = (d: typeof attentive) =>
      d.shapes.filter((s) => s.kind === "circle").length;
    expect(eyes(resting)).toBeLessThan(eyes(attentive));
    expect(puzzled.shapes.some((s) => "rotate" in s && s.rotate === 10)).toBe(
      true,
    );
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
