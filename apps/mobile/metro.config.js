// Metro configuration for a pnpm workspace.
//
// pnpm stores real packages under a virtual store and links them in, so Metro has to be told two things it can't
// infer: watch the repo root (workspace packages live outside this app's folder) and resolve modules from both
// node_modules trees. Without this, importing `@pawcue/ui` fails to resolve at bundle time.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// pnpm's symlinks are the point of its layout, so let Metro follow them rather than fighting it.
config.resolver.unstable_enableSymlinks = true;
// Hierarchical lookup stays ENABLED: disabling it stops Metro walking up to the hoisted root node_modules, which
// is exactly where pnpm places the Expo runtime peers that expo-router imports but does not declare.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
