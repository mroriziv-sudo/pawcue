import { useMemo } from "react";
import { Animated, Image, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";
import { useIsRtl, useReducedMotion, useTheme } from "@pawcue/ui";
import { lookFor, type DogLook } from "../dogs/breed-lookup";
import {
  drawDog,
  type DogExpression,
  type DogPose,
  type DogProp,
  type Shape,
} from "../dogs/dog-art";
import { monthsSince } from "./BirthdatePicker";
import { Crossfade } from "./Crossfade";
import { DOG_MOTION, useDogMotion, type DogReaction } from "./dog-motion";

export type { DogExpression, DogPose, DogProp, DogReaction };

const AnimatedG = Animated.createAnimatedComponent(G);

/** Under a year the dog is drawn as a puppy; past nine, with a grey muzzle. */
const PUPPY_MONTHS = 12;
const SENIOR_MONTHS = 9 * 12;

export interface DogAvatarProps {
  breed: string | null | undefined;
  birthdate?: string | null;
  size?: number;
  /** Bust in rows and headers; a body pose where the moment carries emotion (phase-11-the-dog-at-work.md). */
  pose?: DogPose;
  expression?: DogExpression;
  /** The treat, the mat, the leash — declared here, never implied by a pose. Ignored on a bust. */
  props?: readonly DogProp[];
  /** A photo of the dog. Replaces the drawn bust; the body poses stay drawn, because a photo cannot pose. */
  photoUri?: string | null;
  /**
   * Something the dog reacts to — a counted rep (a wag and the happy face), completion (one bounce). A new `key`
   * fires it again; the reaction present when the avatar mounts fires too. Nothing unless the dog is a drawn
   * body pose of at least 120pt; under Reduce Motion only the expression changes.
   */
  reaction?: DogReaction | null;
  /** Read by assistive technology only when the dog is the subject; otherwise the avatar is decorative. */
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * The dog.
 *
 * Every dog in the app is this character: drawn from `dog-art.ts` through the breed hierarchy in `lookFor` —
 * exact breed where the dataset knows it, the breed family otherwise, a friendly mixed breed when nothing is
 * known — so a "lab mix" typed by hand still gets a retriever's face in a mixed coat. The bust sits on a paper
 * disc with a hairline ring; the scene stands on nothing.
 *
 * A photo, when the owner has added one, takes the bust's place: it is the dog's identity. The illustration
 * stays for every scene, because it can sit, rest and look puzzled, and a photo cannot.
 *
 * Under RTL the drawing is mirrored so the dog's asymmetries (the tail, the half-pricked ear) turn with the
 * layout and the character keeps looking toward the text beside it.
 *
 * A drawn body pose of at least 120pt is alive (phase-11-the-dog-at-work.md, "Motion"): it blinks every few
 * seconds, breathes, wags for a counted rep and bounces once on completion. Like the blink, an expression change
 * — including the rep reaction's happy face — is state, not a new drawing: only the eye/eyelid/face shapes swap,
 * in place, with no cross-fade and no opacity change on the rest of the dog. The breathing and the bounce are
 * transforms on one Animated.View around the whole avatar, on the native driver; the wag turns the tagged tail
 * group for 400ms on the JS thread. A bust, a photo and a smaller dog render exactly as they always did, with no
 * Animated wrapper at all. Under Reduce Motion the loops are off and a reaction is the expression change alone —
 * still an in-place swap, so it lands with nothing else moving.
 */
export function DogAvatar({
  breed,
  birthdate,
  size = 56,
  pose = "bust",
  expression = "attentive",
  props,
  photoUri,
  reaction,
  accessibilityLabel,
  testID,
}: DogAvatarProps) {
  const reduceMotion = useReducedMotion();
  const look = useMemo(() => lookFor(breed), [breed]);
  const months = birthdate ? monthsSince(birthdate) : null;
  const puppy = months !== null && months < PUPPY_MONTHS;
  const senior = months !== null && months >= SENIOR_MONTHS;

  const photo = Boolean(photoUri) && pose === "bust";
  // Only a drawn body at the scene sizes moves; the bust never does, and neither does a photo or a small dog.
  const alive = !photo && pose !== "bust" && size >= DOG_MOTION.minSize;
  const motion = useDogMotion({
    enabled: alive && !reduceMotion,
    reduceMotion,
    reaction,
  });
  // A rep is celebrated with the happy face whatever the caller asked for, and the caller's face comes back.
  const shown = alive && motion.celebrating ? "happy" : expression;

  /**
   * What the dog looks like structurally, as a key: a breed, an age, a pose, a prop change re-mounts the drawing
   * and cross-fades. Expression is deliberately not here — like the blink, an expression change is state, not a
   * new drawing: the eye/eyelid/face shapes below swap in place and every other shape keeps its identity and
   * its opacity. A whole-dog cross-fade on every expression change (including the rep reaction's happy face)
   * used to read as a flicker rather than the wag it was meant to accompany — found on the motion pass,
   * phase-11-the-dog-at-work.md.
   */
  const stateKey = [
    photo ? `photo:${photoUri}` : "drawn",
    look.breedId ?? look.group,
    look.ears,
    puppy ? "puppy" : senior ? "senior" : "adult",
    pose,
    props?.join(",") ?? "",
  ].join("|");

  const content = (
    <Crossfade stateKey={stateKey}>
      {photo && photoUri ? (
        <DogPhoto
          uri={photoUri}
          size={size}
          {...(accessibilityLabel ? { accessibilityLabel } : {})}
          {...(testID ? { testID } : {})}
        />
      ) : (
        <DogFace
          look={look}
          size={size}
          pose={pose}
          expression={shown}
          {...(props ? { props } : {})}
          puppy={puppy}
          senior={senior}
          blink={alive && motion.blink}
          {...(alive && !reduceMotion ? { wag: motion.wag } : {})}
          {...(accessibilityLabel ? { accessibilityLabel } : {})}
          {...(testID ? { testID } : {})}
        />
      )}
    </Crossfade>
  );

  if (!alive || reduceMotion) return content;
  return (
    <Animated.View
      testID={testID ? `${testID}-motion` : undefined}
      style={{
        // The paws stay on the ground: the dog grows up from where it stands, and lifts from there.
        transformOrigin: "50% 100%",
        transform: [{ translateY: motion.bounce }, { scale: motion.breath }],
      }}
    >
      {content}
    </Animated.View>
  );
}

/** The drawing for a resolved look — exported so the breed picker and the dev preview can show a face by look. */
export function DogFace({
  look,
  size,
  pose = "bust",
  expression = "attentive",
  props,
  puppy = false,
  senior = false,
  blink = false,
  wag,
  accessibilityLabel,
  testID,
}: {
  look: DogLook;
  size: number;
  pose?: DogPose;
  expression?: DogExpression;
  props?: readonly DogProp[];
  puppy?: boolean;
  senior?: boolean;
  /** Eyes closed for a blink: the eyelid arcs in place of the eyes, nothing else. */
  blink?: boolean;
  /** The tail's swing, −1 to 1. When given, the tail is drawn in a group that turns about the tail's root. */
  wag?: Animated.Value;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const rtl = useIsRtl();
  // Props are compared by value: a new array with the same objects is the same drawing.
  const propsKey = props?.join(",") ?? "";
  const drawing = useMemo(
    () =>
      drawDog({
        group: look.group,
        size: look.size,
        ears: look.ears,
        ...(look.breedId ? { breedId: look.breedId } : {}),
        puppy,
        senior,
        pose,
        expression,
        ...(propsKey ? { props: propsKey.split(",") as DogProp[] } : {}),
        blink,
      }),
    [
      look.group,
      look.size,
      look.ears,
      look.breedId,
      puppy,
      senior,
      pose,
      expression,
      propsKey,
      blink,
    ],
  );
  const [x, y, w, h] = drawing.viewBox;
  const bust = pose === "bust";
  const height = bust ? size : (size * h) / w;
  const decorative = !accessibilityLabel;

  return (
    <View
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? "no-hide-descendants" : "yes"}
      {...(accessibilityLabel
        ? {
            accessible: true,
            accessibilityRole: "image" as const,
            accessibilityLabel,
          }
        : {})}
      testID={testID}
      style={{
        width: size,
        height,
        ...(bust
          ? {
              borderRadius: size / 2,
              backgroundColor: theme.colors.background.base,
              borderWidth: theme.border.hairline,
              borderColor: theme.colors.border.separator,
              overflow: "hidden",
            }
          : {}),
        // The hairline sits outside the drawing, so the canvas is inset by it.
        ...(bust ? { padding: 0 } : {}),
      }}
    >
      <Svg
        width={bust ? size - 2 * theme.border.hairline : size}
        height={bust ? size - 2 * theme.border.hairline : height}
        viewBox={`${x} ${y} ${w} ${h}`}
        style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}
      >
        <G>
          {drawing.shapes.map((shape, index) =>
            wag && shape.part === "tail" && shape.kind === "path" ? (
              <AnimatedG
                key={index}
                transform={wagTransform(wag, shape.origin ?? [0, 0])}
              >
                {renderShape(shape, index)}
              </AnimatedG>
            ) : (
              renderShape(shape, index)
            ),
          )}
        </G>
      </Svg>
    </View>
  );
}

/** The tail's rotation about its root, ±14° at the ends of the swing, as the SVG transform string the group takes. */
function wagTransform(wag: Animated.Value, [x, y]: readonly [number, number]) {
  const deg = DOG_MOTION.wag.degrees;
  return wag.interpolate({
    inputRange: [-1, 1],
    outputRange: [`rotate(${-deg} ${x} ${y})`, `rotate(${deg} ${x} ${y})`],
  });
}

function renderShape(shape: Shape, index: number) {
  switch (shape.kind) {
    case "ellipse":
      return (
        <Ellipse
          key={index}
          cx={shape.cx}
          cy={shape.cy}
          rx={shape.rx}
          ry={shape.ry}
          fill={shape.fill}
          {...(shape.rotate
            ? { transform: `rotate(${shape.rotate} ${shape.cx} ${shape.cy})` }
            : {})}
        />
      );
    case "circle":
      return (
        <Circle
          key={index}
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill={shape.fill}
        />
      );
    case "path": {
      const origin = shape.origin ?? [0, 0];
      return (
        <Path
          key={index}
          d={shape.d}
          fill={shape.fill ?? "none"}
          {...(shape.stroke
            ? {
                stroke: shape.stroke,
                strokeWidth: shape.width ?? 2,
                strokeLinecap: "round" as const,
                strokeLinejoin: "round" as const,
              }
            : {})}
          {...(shape.rotate
            ? { transform: `rotate(${shape.rotate} ${origin[0]} ${origin[1]})` }
            : {})}
        />
      );
    }
  }
}

/** The owner's photo, cropped to the same disc and ring as the drawn bust. */
function DogPhoto({
  uri,
  size,
  accessibilityLabel,
  testID,
}: {
  uri: string;
  size: number;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const theme = useTheme();
  const decorative = !accessibilityLabel;
  return (
    <View
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? "no-hide-descendants" : "yes"}
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: theme.border.hairline,
        borderColor: theme.colors.border.separator,
        backgroundColor: theme.colors.background.base,
        overflow: "hidden",
      }}
    >
      <Image
        source={{ uri }}
        style={{ width: "100%", height: "100%" }}
        resizeMode="cover"
        {...(accessibilityLabel
          ? { accessible: true, accessibilityLabel }
          : { accessible: false })}
      />
    </View>
  );
}
