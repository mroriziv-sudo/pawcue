import { Platform } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import {
  STANDARD_GLYPHS,
  type GlyphName,
  type GlyphRenderer,
} from "@pawcue/ui";

/**
 * SF Symbols for the standard marks, on iOS.
 *
 * The design system's `Glyph` draws its own vector paths everywhere. On iOS the platform already draws a
 * checkmark, a chevron, a lock and a magnifier at exactly the weight users see in every other app, and they scale
 * with the system text size — so this renderer is injected through `ThemeProvider` and substitutes the platform
 * symbol for every *standard* name. Training marks (the clicker, the treat, a target) return `null` here and are
 * always drawn by the design system, on every platform.
 *
 * Direction is deliberately not handled here: `Icon` mirrors the registered directional marks itself, so the
 * physical `chevron.right` is requested and flipped by the same registry that flips the vector version.
 */
const SF_NAMES: Partial<Record<GlyphName, SFSymbol>> = {
  check: "checkmark",
  "chevron-end": "chevron.right",
  "chevron-start": "chevron.left",
  clock: "clock",
  lock: "lock",
  unlock: "lock.open",
  play: "play.fill",
  pause: "pause",
  repeat: "arrow.clockwise",
  alert: "exclamationmark.circle",
  plus: "plus",
  minus: "minus",
  close: "xmark",
  search: "magnifyingglass",
  undo: "arrow.uturn.backward",
  photo: "photo",
};

export const renderSystemSymbol: GlyphRenderer = ({ name, size, color }) => {
  if (Platform.OS !== "ios") return null;
  if (!STANDARD_GLYPHS.has(name as GlyphName)) return null;
  const symbol = SF_NAMES[name as GlyphName];
  if (!symbol) return null;
  return (
    <SymbolView
      name={symbol}
      size={size}
      tintColor={color}
      weight="medium"
      resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
    />
  );
};
