import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Glyph, Row, Text, TextField, useTheme } from "@pawcue/ui";
import { BREEDS, MIXED_BREED_ID, type Breed } from "../dogs/breeds";
import { findBreed, lookFor, searchBreeds } from "../dogs/breed-lookup";
import { DogFace } from "./DogAvatar";
import { SectionHeader } from "./SectionHeader";

/** How many popular breeds sit in the Common grid beside Mixed breed and Not sure. */
const COMMON_COUNT = 6;
/** The Common grid: two columns, one gap. */
const GRID_COLUMNS = 2;

/**
 * Choosing a breed.
 *
 * Before a key is pressed: a grid of eight tiles — Mixed breed, Not sure, and the six breeds most owners are
 * looking for — each carrying the face that breed gives the dog, so the choice is also a preview. Beneath it,
 * every breed as an alphabetic list of rows. Typing filters the list in either language. Three honest escapes
 * are always present: Mixed breed is a real entry, Not sure clears the field, and a query that matches nothing
 * offers to keep the typed text, because a rare breed is not a wrong answer.
 *
 * Writes the breed's English name — the value the profile already stores — so nothing downstream changes.
 */
export function BreedPicker({
  value,
  onChange,
  inputTestID,
  /** The dog's name, for the sentence that explains a family fallback. */
  dogName,
  /** In an editor, the alphabetical list stays behind an "All breeds" row until asked for or searched. */
  compact = false,
}: {
  value: string;
  onChange: (next: string) => void;
  inputTestID: string;
  dogName?: string;
  compact?: boolean;
}) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const hebrew = i18n.language.startsWith("he");
  const [query, setQuery] = useState("");
  const [unsure, setUnsure] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  /**
   * The Common grid's tile width comes from the grid's own measured width: the container minus the gap, halved.
   * A percentage plus the tiles' selection margins came to 352pt inside a 350pt content width, so every tile
   * wrapped onto its own row (phase-10-native-acceptance.md, finding 1). Until the first layout reports, the
   * window minus the screen gutter stands in — the width the grid has everywhere it is drawn.
   */
  const gridGap = theme.space[3];
  const window = useWindowDimensions();
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const onGridLayout = useCallback((event: LayoutChangeEvent) => {
    setGridWidth(event.nativeEvent.layout.width);
  }, []);
  const tileWidth = Math.floor(
    ((gridWidth ?? window.width - 2 * theme.screenGutter) -
      gridGap * (GRID_COLUMNS - 1)) /
      GRID_COLUMNS,
  );

  const selected = useMemo(() => findBreed(value), [value]);
  const trimmed = query.trim();
  const results = useMemo(
    () => (trimmed ? searchBreeds(trimmed, 40) : []),
    [trimmed],
  );
  const exact = results.some(
    (breed) =>
      breed.en.toLowerCase() === trimmed.toLowerCase() || breed.he === trimmed,
  );
  const customSelected = Boolean(value.trim()) && selected === null;

  const nameOf = (breed: Breed) => (hebrew ? breed.he : breed.en);
  const secondaryOf = (breed: Breed) =>
    hebrew && breed.id !== MIXED_BREED_ID ? breed.en : undefined;

  const common = useMemo(() => {
    const mixed = BREEDS.find((b) => b.id === MIXED_BREED_ID);
    const popular = BREEDS.filter(
      (b) => b.popular && b.id !== MIXED_BREED_ID,
    ).slice(0, COMMON_COUNT);
    return mixed ? [mixed, ...popular] : popular;
  }, []);

  const alphabetical = useMemo(() => {
    const collator = new Intl.Collator(i18n.language);
    const sorted = [...BREEDS]
      .filter((b) => b.id !== MIXED_BREED_ID)
      .sort((a, b) => collator.compare(nameOf(a), nameOf(b)));
    const groups: Array<{ letter: string; breeds: Breed[] }> = [];
    for (const breed of sorted) {
      const letter = nameOf(breed).charAt(0).toUpperCase();
      const last = groups[groups.length - 1];
      if (last && last.letter === letter) last.breeds.push(breed);
      else groups.push({ letter, breeds: [breed] });
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

  const choose = (breed: Breed) => {
    setUnsure(false);
    onChange(breed.en);
    setQuery("");
  };

  /** What a free-typed value would resolve to, said in words: "Looks like a shepherd type…". */
  const familyHint = (() => {
    if (!trimmed || exact) return null;
    const look = lookFor(trimmed);
    if (look.resolvedFrom !== "family") return null;
    return t("fields.breed.familyHint", {
      family: t(`fields.breed.family.${look.group}`),
      name: dogName || t("common.nav.dog"),
    });
  })();

  return (
    <View style={{ gap: theme.space[5] }} testID={`${inputTestID}-picker`}>
      <TextField
        label={t("fields.breed.searchLabel")}
        value={query}
        onChangeText={(next) => {
          setQuery(next);
          if (next.trim()) setUnsure(false);
        }}
        placeholder={t("fields.breed.searchPlaceholder")}
        autoCapitalize="words"
        autoCorrect={false}
        leading={
          <Glyph name="search" size={20} color={theme.colors.text.secondary} />
        }
        trailing={
          query ? (
            <Pressable
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel={t("common.cta.clear")}
              hitSlop={12}
              style={{
                minHeight: 44,
                minWidth: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
              testID={`${inputTestID}-clear`}
            >
              <Glyph
                name="close"
                size={18}
                color={theme.colors.text.secondary}
              />
            </Pressable>
          ) : undefined
        }
        testID={inputTestID}
      />

      {/* The current answer, whatever it is, sits above the list so it is never lost while searching. */}
      {selected ? (
        <Row
          leading={<DogFace look={lookFor(selected.id)} size={28} />}
          title={nameOf(selected)}
          meta={secondaryOf(selected) ?? t("fields.breed.selected")}
          trailing={
            <Glyph name="close" size={20} color={theme.colors.text.secondary} />
          }
          separator={false}
          onPress={() => onChange("")}
          accessibilityLabel={nameOf(selected)}
          accessibilityHint={t("fields.breed.clear")}
          accessibilityState={{ selected: true }}
          testID={`${inputTestID}-selected`}
        />
      ) : customSelected ? (
        <Row
          leading={<DogFace look={lookFor(value)} size={28} />}
          title={value.trim()}
          meta={t("fields.breed.selected")}
          trailing={
            <Glyph name="close" size={20} color={theme.colors.text.secondary} />
          }
          separator={false}
          onPress={() => onChange("")}
          accessibilityLabel={value.trim()}
          accessibilityHint={t("fields.breed.clear")}
          accessibilityState={{ selected: true }}
          testID={`${inputTestID}-selected`}
        />
      ) : null}

      {trimmed ? (
        <View>
          <SectionHeader title={t("fields.breed.results")} />
          {!exact ? (
            <Row
              leading={<DogFace look={lookFor(trimmed)} size={28} />}
              title={t("fields.breed.useTyped", { text: trimmed })}
              {...(familyHint ? { meta: familyHint } : {})}
              trailing={
                <Glyph
                  name="plus"
                  size={20}
                  color={theme.colors.brand.primary}
                />
              }
              onPress={() => {
                setUnsure(false);
                onChange(trimmed);
                setQuery("");
              }}
              accessibilityLabel={t("fields.breed.useTyped", { text: trimmed })}
              testID={`${inputTestID}-use-typed`}
            />
          ) : null}
          {results
            .filter((breed) => breed.id !== selected?.id)
            .map((breed, index, list) => (
              <Row
                key={breed.id}
                leading={<DogFace look={lookFor(breed.id)} size={28} />}
                title={nameOf(breed)}
                {...(secondaryOf(breed) ? { meta: secondaryOf(breed) } : {})}
                separator={index < list.length - 1}
                onPress={() => choose(breed)}
                accessibilityLabel={nameOf(breed)}
                accessibilityState={{ selected: false }}
                testID={`${inputTestID}-option-${breed.id}`}
              />
            ))}
          {results.length === 0 ? (
            <Text
              variant="secondary"
              tone="secondary"
              style={{ paddingTop: theme.space[2] }}
            >
              {t("fields.breed.noResults")}
            </Text>
          ) : null}
        </View>
      ) : (
        <>
          <View>
            <SectionHeader title={t("fields.breed.common")} />
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: gridGap,
                paddingTop: theme.space[2],
              }}
              onLayout={onGridLayout}
              testID={`${inputTestID}-common`}
            >
              {common.map((breed) => (
                <BreedTile
                  key={breed.id}
                  label={nameOf(breed)}
                  face={<DogFace look={lookFor(breed.id)} size={56} />}
                  selected={selected?.id === breed.id}
                  width={tileWidth}
                  onPress={() => choose(breed)}
                  testID={`${inputTestID}-option-${breed.id}`}
                />
              ))}
              <BreedTile
                label={t("fields.breed.unknown")}
                face={<DogFace look={lookFor(null)} size={56} />}
                selected={unsure && !value.trim()}
                width={tileWidth}
                onPress={() => {
                  setUnsure(true);
                  onChange("");
                }}
                accessibilityHint={t("fields.breed.unknownHint")}
                testID={`${inputTestID}-unknown`}
              />
            </View>
          </View>

          <View>
            {expanded ? (
              <SectionHeader title={t("fields.breed.all")} />
            ) : (
              <Row
                title={t("fields.breed.all")}
                trailing={
                  <Glyph
                    name="chevron-end"
                    size={20}
                    color={theme.colors.text.secondary}
                  />
                }
                separator={false}
                onPress={() => setExpanded(true)}
                accessibilityLabel={t("fields.breed.all")}
                testID={`${inputTestID}-all`}
              />
            )}
            {expanded
              ? alphabetical.map((group) => (
                  <View key={group.letter}>
                    <Text
                      variant="caption"
                      tone="secondary"
                      style={{
                        paddingTop: theme.space[4],
                        paddingBottom: theme.space[1],
                      }}
                      accessibilityRole="header"
                    >
                      {group.letter}
                    </Text>
                    {group.breeds.map((breed, index) => (
                      <Row
                        key={breed.id}
                        leading={<DogFace look={lookFor(breed.id)} size={28} />}
                        title={nameOf(breed)}
                        {...(secondaryOf(breed)
                          ? { meta: secondaryOf(breed) }
                          : {})}
                        separator={index < group.breeds.length - 1}
                        onPress={() => choose(breed)}
                        accessibilityLabel={nameOf(breed)}
                        accessibilityState={{
                          selected: selected?.id === breed.id,
                        }}
                        testID={`${inputTestID}-row-${breed.id}`}
                      />
                    ))}
                  </View>
                ))
              : null}
          </View>
        </>
      )}
    </View>
  );
}

/**
 * One choice in the Common grid: the face and the name. The one card type — a standalone tappable object — with
 * selection shown as the brand edge plus a check, and announced as a radio.
 *
 * `width` is the tile's whole footprint in the grid. The selection margin is taken out of it rather than added
 * around it, so a row of two never outgrows the grid.
 */
function BreedTile({
  label,
  face,
  selected,
  width,
  onPress,
  accessibilityHint,
  testID,
}: {
  label: string;
  face: React.ReactNode;
  selected: boolean;
  width: number;
  onPress: () => void;
  accessibilityHint?: string;
  testID: string;
}) {
  const theme = useTheme();
  // Keeps content still when the border thickens on selection.
  const margin = selected ? 0 : theme.border.focus - theme.border.hairline;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected, checked: selected }}
      testID={testID}
      style={({ pressed }) => ({
        width: width - 2 * margin,
        margin,
        minHeight: theme.minTouchTarget,
        padding: theme.space[3],
        gap: theme.space[2],
        alignItems: "center",
        borderRadius: theme.radius.object,
        borderWidth: selected ? theme.border.focus : theme.border.hairline,
        borderColor: selected
          ? theme.colors.brand.primary
          : theme.colors.border.separator,
        backgroundColor: pressed
          ? theme.colors.surface.pressed
          : theme.colors.surface.raised,
      })}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {face}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.space[1],
        }}
      >
        {selected ? (
          <Glyph name="check" size={16} color={theme.colors.brand.primary} />
        ) : null}
        <Text
          variant="secondary"
          align="center"
          style={{ fontWeight: "600", flexShrink: 1 }}
          // A label inside a half-width tile: the same anti-clipping cap as the name input, so "Labrador"
          // wraps at the space rather than mid-word at the largest sizes. Not reading text.
          maxFontSizeMultiplier={1.6}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
