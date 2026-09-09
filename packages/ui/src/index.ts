// Tokens — the design system's source of truth in code. DESIGN_SYSTEM.md is its source of truth on paper.
export * from "./tokens/color";
export * from "./tokens/typography";
export * from "./tokens/spacing";
export * from "./tokens/radius";
export * from "./tokens/elevation";
export * from "./tokens/motion";
export * from "./tokens/sound";
export * from "./tokens/haptics";
export * from "./tokens/layout";
export * from "./tokens/icon-mirroring";
export * from "./tokens/theme";

// Accessibility foundations.
export * from "./a11y/contrast";
export * from "./a11y/direction";
export * from "./a11y/useReducedMotion";

// Theme context.
export * from "./theme/ThemeProvider";

// Style resolvers — exported so screens can compose without re-deriving token maths.
export * from "./primitives/styles/text-styles";
export * from "./primitives/styles/button-styles";
export * from "./primitives/styles/card-styles";

// Primitives.
export * from "./primitives/Text";
export * from "./primitives/PressableScale";
export * from "./primitives/Button";
export * from "./primitives/Card";
export * from "./primitives/Icon";
