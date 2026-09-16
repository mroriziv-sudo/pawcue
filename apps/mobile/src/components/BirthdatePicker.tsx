import { useState } from "react";
import { Platform, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button, Glyph, Text, useTheme } from "@pawcue/ui";
import type { Dog } from "@pawcue/domain";

type DogSex = Dog["sex"];

/**
 * The dog's birthdate, two ways.
 *
 * Most owners know roughly how old their dog is and not the date, so the first thing offered is two native wheels
 * — years and months — with a sentence beneath that reads the choice back: "1 year and 3 months, born around
 * June 2025." Owners who do know the date swap to the platform's own date spinner, which orders day, month and
 * year the way the locale does and can only produce a real date. Both write the same `YYYY-MM-DD` string the
 * data model already stores.
 *
 * Both controls are the platform's: VoiceOver, Dynamic Type and RTL come for free, and neither needs a masked
 * text field that asks a Hebrew speaker to type a Latin date format.
 *
 * Validation stays in the domain (`validateField`); this only shapes the input.
 */

const MAX_YEARS = 20;
const EARLIEST = new Date(Date.UTC(1990, 0, 1));

export function BirthdatePicker({
  value,
  onChange,
  inputTestID,
  /** The dog's sex, when already known: Hebrew agrees "born" and "how old" with it. */
  sex,
  error,
  errorTestID,
}: {
  value: string;
  onChange: (next: string) => void;
  inputTestID: string;
  sex?: DogSex | undefined;
  error?: string;
  errorTestID?: string;
}) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const [exact, setExact] = useState(false);

  const ageMonths = monthsSince(value);
  const years = ageMonths === null ? 1 : Math.floor(ageMonths / 12);
  const months = ageMonths === null ? 0 : ageMonths % 12;

  const write = (nextYears: number, nextMonths: number) =>
    onChange(dateMonthsAgo(nextYears * 12 + nextMonths));

  const summary =
    ageMonths !== null
      ? t("fields.birthdate.summary", {
          age: ageLabel(ageMonths, t, sex),
          month: bornAround(value, i18n.language),
          ...genderContext(sex),
        })
      : null;

  return (
    <View style={{ gap: theme.space[4] }} testID={`${inputTestID}-picker`}>
      {exact ? (
        <View style={{ gap: theme.space[2] }}>
          <Text variant="secondary" tone="secondary">
            {t("fields.birthdate.exactLabel")}
          </Text>
          <View style={{ alignItems: "center" }}>
            <DateTimePicker
              value={parseIso(value) ?? new Date()}
              mode="date"
              display="spinner"
              locale={i18n.language}
              maximumDate={new Date()}
              minimumDate={EARLIEST}
              onChange={(_event, date) => {
                if (date) onChange(toIso(date));
              }}
              testID={`${inputTestID}-exact`}
            />
          </View>
        </View>
      ) : (
        <View style={{ gap: theme.space[2] }}>
          <Text variant="secondary" tone="secondary">
            {t("fields.birthdate.ageLabel", genderContext(sex))}
          </Text>
          <View style={{ flexDirection: "row", gap: theme.space[2] }}>
            <View style={{ flex: 1 }}>
              <Picker
                selectedValue={years}
                onValueChange={(next) => write(Number(next), months)}
                accessibilityLabel={t("fields.birthdate.yearsWheel")}
                itemStyle={{ color: theme.colors.text.primary }}
                testID={`${inputTestID}-years`}
              >
                {Array.from({ length: MAX_YEARS + 1 }, (_, n) => (
                  <Picker.Item
                    key={n}
                    label={t("fields.birthdate.years", { count: n })}
                    value={n}
                  />
                ))}
              </Picker>
            </View>
            <View style={{ flex: 1 }}>
              <Picker
                selectedValue={months}
                onValueChange={(next) => write(years, Number(next))}
                accessibilityLabel={t("fields.birthdate.monthsWheel")}
                itemStyle={{ color: theme.colors.text.primary }}
                testID={`${inputTestID}-months`}
              >
                {Array.from({ length: 12 }, (_, n) => (
                  <Picker.Item
                    key={n}
                    label={t("fields.birthdate.months", { count: n })}
                    value={n}
                  />
                ))}
              </Picker>
            </View>
          </View>
        </View>
      )}

      {/* The choice, read back as a sentence — or the error, which replaces it. */}
      {error ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.space[1],
          }}
          accessibilityRole="alert"
        >
          <Glyph name="alert" size={16} color={theme.colors.text.error} />
          <Text
            variant="secondary"
            tone="error"
            style={{ flex: 1 }}
            {...(errorTestID ? { testID: errorTestID } : {})}
          >
            {error}
          </Text>
        </View>
      ) : summary ? (
        <Text variant="body" testID={`${inputTestID}-summary`}>
          {summary}
        </Text>
      ) : null}

      <View style={{ alignItems: "flex-start" }}>
        <Button
          label={
            exact
              ? t("fields.birthdate.roughToggle")
              : t("fields.birthdate.exactToggle")
          }
          variant="tertiary"
          size="md"
          fullWidth={false}
          onPress={() => setExact((current) => !current)}
          testID={`${inputTestID}-exact-toggle`}
        />
      </View>
    </View>
  );
}

/**
 * The i18next `context` that makes Hebrew agree with the dog: "בת שנה" for a female dog, the default (masculine)
 * form otherwise and when the sex is not yet known. English carries no such variants and resolves to the base
 * key (phase-10-native-acceptance.md, finding 18).
 */
export function genderContext(sex: DogSex | null | undefined): {
  context?: "female";
} {
  return sex === "female" ? { context: "female" } : {};
}

/** "3 months old" below two years, whole years after — the Dog tab's own age strings. */
export function ageLabel(
  months: number,
  t: TFunction,
  sex?: DogSex | null,
): string {
  return months < 24
    ? t("dogTab.ageMonths", { count: months, ...genderContext(sex) })
    : t("dogTab.ageYears", {
        count: Math.floor(months / 12),
        ...genderContext(sex),
      });
}

/** The month a stored date falls in, in the user's language: "June 2025". */
function bornAround(value: string, locale: string): string {
  const parsed = parseIso(value);
  if (!parsed) return "";
  try {
    return parsed.toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return value;
  }
}

function parseIso(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(date: Date): string {
  // The spinner reports a local-midnight date; read the local fields so the day never shifts across UTC.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole calendar months from a `YYYY-MM-DD` date to today; null when the value is not a real date. */
export function monthsSince(
  value: string,
  today: Date = new Date(),
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const born = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  let months =
    (today.getUTCFullYear() - born.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - born.getUTCMonth());
  if (today.getUTCDate() < born.getUTCDate()) months -= 1;
  return months < 0 ? null : months;
}

/** Today minus N calendar months, as `YYYY-MM-DD`. */
export function dateMonthsAgo(
  months: number,
  today: Date = new Date(),
): string {
  const date = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth() - months,
      today.getUTCDate(),
    ),
  );
  // Setting a day that the target month lacks (31 May − 1 month) rolls forward; clamp to the month's last day.
  if (date.getUTCDate() !== today.getUTCDate()) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

/** Whether the platform draws its own wheel. Exported for the dev preview's note on Android. */
export const WHEELS_ARE_NATIVE = Platform.OS === "ios";
