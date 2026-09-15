import {
  BREEDS,
  MIXED_BREED_ID,
  type Breed,
  type BreedGroup,
  type BreedSize,
  type EarShape,
} from "./breeds";

/** What the avatar needs to draw a dog: never more than this, and always resolvable. */
export interface DogLook {
  group: BreedGroup;
  size: BreedSize;
  ears: EarShape;
  /** The dataset id when the exact breed is known, so the character can apply that breed's own overrides. */
  breedId?: string;
  /** How the look was decided — useful for the dev preview and for choosing real artwork later. */
  resolvedFrom: "breed" | "family" | "generic";
}

function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

/** The stored breed value (English name, id, or the Hebrew name) resolved to a dataset entry, if it is one. */
export function findBreed(value: string | null | undefined): Breed | null {
  if (!value) return null;
  const needle = normalise(value);
  if (!needle) return null;
  return (
    BREEDS.find(
      (breed) =>
        normalise(breed.id) === needle ||
        normalise(breed.en) === needle ||
        normalise(breed.he) === needle,
    ) ?? null
  );
}

/** The breed as the user should read it: localised when it is a known breed, as typed when it is not. */
export function breedDisplayName(
  value: string | null | undefined,
  locale: string,
): string | null {
  if (!value?.trim()) return null;
  const breed = findBreed(value);
  if (!breed) return value.trim();
  return locale.startsWith("he") ? breed.he : breed.en;
}

/**
 * Search, tolerant of either language and of partial words. Popular breeds lead an empty query; a query is ranked
 * by where it matches — a name that *starts* with it beats one that merely contains it.
 */
export function searchBreeds(query: string, limit = 40): Breed[] {
  const needle = normalise(query);
  if (!needle) {
    return [
      ...BREEDS.filter((breed) => breed.popular),
      ...BREEDS.filter((breed) => !breed.popular),
    ].slice(0, limit);
  }
  const scored = BREEDS.flatMap((breed) => {
    const en = normalise(breed.en);
    const he = normalise(breed.he);
    const score =
      en.startsWith(needle) || he.startsWith(needle)
        ? 0
        : en.split(" ").some((word) => word.startsWith(needle)) ||
            he.split(" ").some((word) => word.startsWith(needle))
          ? 1
          : en.includes(needle) || he.includes(needle)
            ? 2
            : null;
    return score === null ? [] : [{ breed, score }];
  });
  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        (b.breed.popular ? 1 : 0) - (a.breed.popular ? 1 : 0),
    )
    .map((entry) => entry.breed)
    .slice(0, limit);
}

/**
 * Family keywords for a free-typed breed that is not in the list — "lab mix", "some kind of shepherd" — so the
 * avatar can still look roughly right. Hebrew stems included for the same reason.
 */
const FAMILY_KEYWORDS: Array<[BreedGroup, RegExp]> = [
  [
    "sporting",
    /retriever|spaniel|pointer|setter|\blab\b|רטריבר|ספנייל|פוינטר|לברדור/,
  ],
  [
    "herding",
    /shepherd|collie|corgi|heeler|sheepdog|malinois|רועה|קולי|קורגי|מלינואה|כנעני/,
  ],
  [
    "hound",
    /hound|beagle|dachshund|whippet|greyhound|האונד|ביגל|תחש|גרייהאונד/,
  ],
  ["terrier", /terrier|pit ?bull|staff|amstaff|טרייר|פיטבול|אמסטף/],
  [
    "spitz",
    /husky|malamute|spitz|akita|shiba|samoyed|האסקי|מלמוט|אקיטה|שיבה|סמוייד/,
  ],
  [
    "working",
    /mastiff|schnauzer|boxer|rottweiler|dane|doberman|corso|מסטיף|שנאוצר|בוקסר|רוטוויילר|דוברמן|קורסו/,
  ],
  ["non_sporting", /poodle|bulldog|dalmatian|chow|פודל|בולדוג|דלמטי/],
  [
    "toy",
    /chihuahua|pug|maltese|pomeranian|yorkie|shih ?tzu|צ'יוואווה|פאג|מלטזי|פומרניאן|יורקי|שי צו/,
  ],
  ["mixed", /mix|mutt|cross|מעורב|בן כלאיים/],
];

/** What a group's typical dog looks like — the fallback when only the family is known. */
const GROUP_DEFAULT_LOOK: Record<BreedGroup, Omit<DogLook, "resolvedFrom">> = {
  sporting: { group: "sporting", size: "large", ears: "floppy" },
  herding: { group: "herding", size: "medium", ears: "pointed" },
  hound: { group: "hound", size: "medium", ears: "floppy" },
  working: { group: "working", size: "large", ears: "folded" },
  terrier: { group: "terrier", size: "small", ears: "folded" },
  toy: { group: "toy", size: "small", ears: "pointed" },
  non_sporting: { group: "non_sporting", size: "medium", ears: "floppy" },
  spitz: { group: "spitz", size: "medium", ears: "pointed" },
  mixed: { group: "mixed", size: "medium", ears: "folded" },
};

/**
 * The fallback hierarchy: exact breed → breed family → generic dog. Always returns something drawable, so a dog
 * with no breed set still has a face.
 */
export function lookFor(value: string | null | undefined): DogLook {
  const breed = findBreed(value);
  if (breed) {
    return {
      group: breed.group,
      size: breed.size,
      ears: breed.ears,
      breedId: breed.id,
      resolvedFrom: "breed",
    };
  }
  if (value?.trim()) {
    const needle = normalise(value);
    const family = FAMILY_KEYWORDS.find(([, pattern]) => pattern.test(needle));
    if (family) {
      return { ...GROUP_DEFAULT_LOOK[family[0]], resolvedFrom: "family" };
    }
  }
  return { ...GROUP_DEFAULT_LOOK[MIXED_BREED_ID], resolvedFrom: "generic" };
}
