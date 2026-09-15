import { useState } from "react";
import { Image, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Button,
  Clicker,
  Glyph,
  RepMarks,
  Row,
  SegmentedControl,
  StepDots,
  Text,
  TextField,
  ThemeProvider,
  TrailMark,
  VectorGlyph,
  useTheme,
  type GlyphName,
  type TrailState,
  type TypographyVariant,
} from "@pawcue/ui";
import { ScreenScroll, Section } from "../src/components/ScreenScroll";
import { SectionHeader } from "../src/components/SectionHeader";
import { BackControl } from "../src/components/BackControl";
import { EmptyState } from "../src/components/EmptyState";
import { DogAvatar, DogFace } from "../src/components/DogAvatar";
import { ClickerMark } from "../src/components/ClickerMark";
import { OptionTile } from "../src/components/OptionTile";
import { BirthdatePicker } from "../src/components/BirthdatePicker";
import { BreedPicker } from "../src/components/BreedPicker";
import { NavGlyph, type NavGlyphName } from "../src/components/NavGlyph";
import {
  JourneySkeleton,
  SkeletonGroup,
  TodaySkeleton,
} from "../src/components/Skeleton";
import { renderSystemSymbol } from "../src/components/SystemSymbol";
import { lookFor } from "../src/dogs/breed-lookup";
import { EXACT_BREEDS, FAMILY_ORDER } from "../src/dogs/dog-art";
import { BREEDS } from "../src/dogs/breeds";

/**
 * The design system, rendered: every colour role, type variant, control, mark, dog and screen state, in one
 * scrolling page, with a switch to view it all mirrored.
 *
 * Development-only. It cannot ship: the screen renders nothing outside `__DEV__`, and the only route to it is the
 * Settings diagnostics block, which is gated the same way. Nothing here has any effect on production state.
 */
export default function DevPreviewScreen() {
  const router = useRouter();
  const [rtl, setRtl] = useState(false);
  const [symbols, setSymbols] = useState(true);

  if (!__DEV__) return null;

  return (
    <ThemeProvider
      direction={rtl ? "rtl" : "ltr"}
      {...(symbols ? { renderGlyph: renderSystemSymbol } : {})}
    >
      <PreviewBody
        rtl={rtl}
        onRtl={setRtl}
        symbols={symbols}
        onSymbols={setSymbols}
        onBack={() => router.back()}
      />
    </ThemeProvider>
  );
}

const GLYPHS: GlyphName[] = [
  "check",
  "chevron-end",
  "chevron-start",
  "clock",
  "lock",
  "unlock",
  "play",
  "pause",
  "repeat",
  "alert",
  "plus",
  "minus",
  "close",
  "search",
  "undo",
  "photo",
  "clicker-glyph",
  "treat",
  "target",
];
const NAV: NavGlyphName[] = [
  "nav-today",
  "nav-train",
  "nav-progress",
  "nav-dog",
];
const TYPE: TypographyVariant[] = [
  "largeTitle",
  "headline",
  "title",
  "body",
  "bodyStrong",
  "secondary",
  "sectionLabel",
  "caption",
  "button",
  "displayNumeral",
];
const TRAIL: TrailState[] = [
  "next",
  "later",
  "current",
  "done",
  "locked",
  "paused",
];

function PreviewBody({
  rtl,
  onRtl,
  symbols,
  onSymbols,
  onBack,
}: {
  rtl: boolean;
  onRtl: (v: boolean) => void;
  symbols: boolean;
  onSymbols: (v: boolean) => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [reps, setReps] = useState(2);
  const [minutes, setMinutes] = useState<number | null>(10);
  const [sex, setSex] = useState<"female" | "male">("female");
  const [birthdate, setBirthdate] = useState("");
  const [breed, setBreed] = useState("");
  const [field, setField] = useState("");
  // The app icon stands in for an owner's photo; the preview has no library access and needs none.
  const samplePhoto = Image.resolveAssetSource(
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-argument
    require("../assets/icon.png"),
  ).uri;

  const colours: Array<[string, string]> = [
    ["Paper", theme.colors.background.base],
    ["Card", theme.colors.surface.raised],
    ["Ink", theme.colors.text.primary],
    ["Ink secondary", theme.colors.text.secondary],
    ["Separator", theme.colors.border.separator],
    ["Evergreen", theme.colors.brand.primary],
    ["Amber (reward)", theme.colors.accent.reward],
    ["Amber text", theme.colors.text.reward],
    ["Completed", theme.colors.status.completed],
    ["Completed text", theme.colors.text.completed],
    ["Destructive", theme.colors.status.error],
    ["Destructive text", theme.colors.text.error],
  ];

  return (
    <ScreenScroll testID="dev-preview" gap={theme.space[8]}>
      <View style={{ gap: theme.space[3] }}>
        <BackControl onPress={onBack} />
        <Text variant="headline" accessibilityRole="header">
          The field notebook
        </Text>
        <Row
          title="Mirror (RTL)"
          trailingInteractive
          trailing={
            <Switch
              value={rtl}
              onValueChange={onRtl}
              accessibilityLabel="Mirror"
            />
          }
        />
        <Row
          title="Platform symbols on iOS"
          meta="Off shows the design system's own vector marks."
          separator={false}
          trailingInteractive
          trailing={
            <Switch
              value={symbols}
              onValueChange={onSymbols}
              accessibilityLabel="Platform symbols"
            />
          }
        />
      </View>

      <Section>
        <SectionHeader title="Colour roles" />
        {colours.map(([label, value], index) => (
          <Row
            key={label}
            leading={
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: value,
                  borderWidth: theme.border.hairline,
                  borderColor: theme.colors.border.separator,
                }}
              />
            }
            title={label}
            meta={value}
            separator={index < colours.length - 1}
          />
        ))}
      </Section>

      <Section gap={theme.space[3]}>
        <SectionHeader title="Type" />
        {TYPE.map((variant) => (
          <Text key={variant} variant={variant}>
            {variant === "displayNumeral"
              ? "12"
              : `${variant} — the quick brown dog sits`}
          </Text>
        ))}
        <Text variant="body" tone="secondary">
          Secondary ink.
        </Text>
        <Text variant="body" tone="reward">
          Reward text.
        </Text>
        <Text variant="body" tone="completed">
          Completed text.
        </Text>
        <Text variant="body" tone="error">
          Destructive text.
        </Text>
      </Section>

      <Section gap={theme.space[3]}>
        <SectionHeader title="Buttons" />
        <Button label="Primary, lg" onPress={() => undefined} />
        <Button label="Primary, xl" size="xl" onPress={() => undefined} />
        <Button
          label="Secondary"
          variant="secondary"
          onPress={() => undefined}
        />
        <Button label="Tertiary" variant="tertiary" onPress={() => undefined} />
        <Button
          label="Destructive"
          variant="destructive"
          onPress={() => undefined}
        />
        <Button label="Disabled" disabled onPress={() => undefined} />
        <Button label="Loading" loading onPress={() => undefined} />
        <Button
          label="With a mark"
          icon={
            <Glyph name="play" size={20} color={theme.colors.text.onBrand} />
          }
          onPress={() => undefined}
        />
      </Section>

      <Section>
        <SectionHeader title="Rows" />
        <Row title="A plain row" meta="With a meta line." />
        <Row
          title="A pressable row"
          meta="Bleeds to the edge when pressed."
          trailing={
            <Glyph
              name="chevron-end"
              size={20}
              color={theme.colors.text.secondary}
            />
          }
          onPress={() => undefined}
          accessibilityLabel="A pressable row"
        />
        <Row
          leading={<TrailMark state="done" />}
          title="With a mark"
          meta="Done today."
          metaTone="completed"
          separator={false}
        />
      </Section>

      <Section>
        <SectionHeader title="Trail" />
        {TRAIL.map((state, index) => (
          <Row
            key={state}
            leading={<TrailMark state={state} label={String(index + 1)} />}
            connector={{ above: index > 0, below: index < TRAIL.length - 1 }}
            title={state}
            meta="About 3 minutes."
            separator={index < TRAIL.length - 1}
          />
        ))}
        <View style={{ paddingTop: theme.space[4], gap: theme.space[2] }}>
          <StepDots total={4} current={2} accessibilityLabel="Step 2 of 4" />
        </View>
      </Section>

      <Section gap={theme.space[3]}>
        <SectionHeader title="Fields" />
        <TextField
          label="Name"
          value={field}
          onChangeText={setField}
          placeholder="e.g. Luna"
        />
        <TextField
          label="Large"
          size="large"
          value={field}
          onChangeText={setField}
          placeholder="e.g. Luna"
        />
        <TextField
          label="With an error"
          value="soon"
          onChangeText={() => undefined}
          error="That date is in the future."
        />
        <TextField
          label="With a hint"
          value=""
          onChangeText={() => undefined}
          hint="Optional."
        />
      </Section>

      <Section gap={theme.space[3]}>
        <SectionHeader title="Onboarding controls" />
        <SegmentedControl
          options={[5, 10, 15, 20].map((v) => ({
            value: v,
            label: `${v} min`,
          }))}
          value={minutes}
          onChange={setMinutes}
          accessibilityLabel="Daily goal"
        />
        <View style={{ flexDirection: "row", gap: theme.space[3] }}>
          <OptionTile
            label="Girl"
            selected={sex === "female"}
            onPress={() => setSex("female")}
            testID="preview-sex-female"
          />
          <OptionTile
            label="Boy"
            selected={sex === "male"}
            onPress={() => setSex("male")}
            testID="preview-sex-male"
          />
        </View>
        <BirthdatePicker
          value={birthdate}
          onChange={setBirthdate}
          inputTestID="preview-birthdate"
        />
        <BreedPicker
          value={breed}
          onChange={setBreed}
          inputTestID="preview-breed"
          dogName="Luna"
        />
      </Section>

      <Section gap={theme.space[3]}>
        <SectionHeader title="Clicker" />
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: theme.space[4],
          }}
        >
          <Clicker
            size={132}
            onPress={() => undefined}
            accessibilityLabel="Clicker"
          />
          <Clicker
            size={96}
            onPress={() => undefined}
            accessibilityLabel="Clicker"
          />
          <ClickerMark size={40} />
        </View>
      </Section>

      <Section gap={theme.space[3]}>
        <SectionHeader title="Reps" />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space[4],
          }}
        >
          <Text
            variant="displayNumeral"
            tone={reps >= 5 ? "reward" : "primary"}
          >
            {String(reps)}
            <Text variant="title" tone="secondary">
              {" "}
              of 5
            </Text>
          </Text>
          <View style={{ flex: 1 }}>
            <RepMarks
              count={reps}
              target={5}
              accessibilityLabel={`${reps} of 5`}
            />
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: theme.space[2] }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Count it"
              variant="secondary"
              size="md"
              onPress={() => setReps((r) => Math.min(5, r + 1))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Undo"
              variant="tertiary"
              size="md"
              onPress={() => setReps((r) => Math.max(0, r - 1))}
            />
          </View>
        </View>
      </Section>

      <Section gap={theme.space[3]}>
        <SectionHeader title="Marks" />
        <Text variant="secondary" tone="secondary">
          Left: as rendered on this platform. Right: the design system's own
          vector path.
        </Text>
        {GLYPHS.map((name) => (
          <Row
            key={name}
            leading={<Glyph name={name} size={24} />}
            title={name}
            trailing={
              <VectorGlyph
                name={name}
                size={24}
                color={theme.colors.text.primary}
              />
            }
          />
        ))}
        <View
          style={{
            flexDirection: "row",
            gap: theme.space[6],
            paddingTop: theme.space[3],
          }}
        >
          {NAV.map((name) => (
            <View
              key={name}
              style={{ alignItems: "center", gap: theme.space[1] }}
            >
              <NavGlyph name={name} active />
              <NavGlyph name={name} active={false} />
            </View>
          ))}
        </View>
      </Section>

      <Section gap={theme.space[3]}>
        <SectionHeader title="The dog: generic and nine families" />
        {FAMILY_ORDER.map((group) => {
          const look = {
            ...lookFor(null),
            group,
            resolvedFrom: "family" as const,
          };
          const sample = BREEDS.find((b) => b.group === group);
          const fam = sample
            ? {
                group,
                size: sample.size,
                ears: sample.ears,
                resolvedFrom: "family" as const,
              }
            : look;
          return (
            <View
              key={group}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.space[4],
                paddingVertical: theme.space[2],
              }}
            >
              <DogFace look={fam} size={28} />
              <DogFace look={fam} size={56} />
              <DogFace look={fam} size={72} pose="scene" />
              <DogFace look={fam} size={72} pose="scene" expression="happy" />
              <DogFace look={fam} size={56} expression="puzzled" />
              <DogFace look={fam} size={56} puppy />
              <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
                {group}
              </Text>
            </View>
          );
        })}
      </Section>

      <Section gap={theme.space[3]}>
        <SectionHeader
          title="Exact breeds"
          trailing={String(EXACT_BREEDS.length)}
        />
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.space[3],
          }}
        >
          {EXACT_BREEDS.map((id) => (
            <View
              key={id}
              style={{ width: 88, alignItems: "center", gap: theme.space[1] }}
            >
              <DogFace look={lookFor(id)} size={64} />
              <Text variant="caption" tone="secondary" align="center">
                {id.replace(/_/g, " ")}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section gap={theme.space[3]}>
        <SectionHeader title="Photo, resting, senior" />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space[4],
          }}
        >
          <DogAvatar breed="Border Collie" photoUri={samplePhoto} size={72} />
          <DogAvatar
            breed="Border Collie"
            size={96}
            pose="scene"
            expression="resting"
          />
          <DogAvatar breed="Beagle" birthdate="2014-01-01" size={56} />
          <DogAvatar
            breed="Beagle"
            birthdate={new Date(Date.now() - 90 * 86_400_000)
              .toISOString()
              .slice(0, 10)}
            size={56}
          />
        </View>
      </Section>

      <Section gap={theme.space[3]}>
        <SectionHeader title="Today states" />
        <View
          style={{
            flexDirection: "row",
            gap: theme.space[4],
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1, gap: theme.space[2] }}>
            <Text variant="headline">
              {t("today.coach.new_skill", { name: "Luna", lesson: "Sit" })}
            </Text>
            <Text variant="secondary" tone="secondary">
              {t("today.planSize", { count: 3, minutes: 9 })}
            </Text>
          </View>
          <DogAvatar breed="Golden Retriever" size={96} />
        </View>
        <Button
          label={t("today.startLesson", { lesson: "Sit" })}
          onPress={() => undefined}
        />
        <SkeletonGroup accessibilityLabel="Loading">
          <TodaySkeleton />
        </SkeletonGroup>
        <EmptyState
          scene={
            <DogAvatar
              breed={null}
              size={120}
              pose="scene"
              expression="resting"
            />
          }
          title={t("today.allDoneTitle")}
          body={t("today.allDoneWith", {
            name: "Luna",
            lessons: "Sit and Down",
          })}
        />
      </Section>

      <Section gap={theme.space[3]}>
        <SectionHeader title="Journey skeleton" />
        <SkeletonGroup accessibilityLabel="Loading">
          <JourneySkeleton />
        </SkeletonGroup>
      </Section>
    </ScreenScroll>
  );
}
