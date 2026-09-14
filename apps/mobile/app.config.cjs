const {
  assertProductionEnvironment,
  releaseHardeningRequested,
} = require("./plugins/withReleaseHardening.js");

assertProductionEnvironment();

module.exports = ({ config }) => ({
  ...config,
  name: config.name ?? "PawCue",
  slug: config.slug ?? "pawcue",
  plugins: [
    ...(config.plugins ?? []),
    [
      "./plugins/withReleaseHardening.js",
      { enabled: releaseHardeningRequested() },
    ],
  ],
});
