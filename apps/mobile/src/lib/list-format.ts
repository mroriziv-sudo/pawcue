import type { TFunction } from "i18next";

/**
 * Joins names into one sentence fragment — "Sit", "Sit and Down", "Sit, Down and Come" — through translated
 * patterns rather than string concatenation, so Hebrew gets its own conjunction ("שב ושכב") and no locale ever
 * sees an English "and".
 *
 * Intentionally not `Intl.ListFormat`: Hermes does not ship it on every platform the app targets, and two
 * patterns cover every list this product renders.
 */
export function joinNames(names: readonly string[], t: TFunction): string {
  const items = names.filter((name) => name.trim().length > 0);
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  const last = items[items.length - 1]!;
  const head = items
    .slice(0, -1)
    .reduce(
      (acc, name) => (acc ? t("common.list.more", { a: acc, b: name }) : name),
      "",
    );
  return t("common.list.pair", { a: head, b: last });
}
