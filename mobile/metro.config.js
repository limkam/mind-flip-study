const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const exclusionList =
  require("metro-config/private/defaults/exclusionList").default ??
  require("metro-config/private/defaults/exclusionList");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Keep Metro watching project root & neutral shared directory.
config.watchFolders = [projectRoot, path.resolve(monorepoRoot, "shared")];
config.resolver.blockList = exclusionList([
  new RegExp(
    `${monorepoRoot.replace(/[/\\]/g, "[/\\\\]")}[/\\\\](node_modules|dist|services|apps)([/\\\\].*)?`,
  ),
  /[/\\]\.git[/\\].*/,
  /[/\\]\.expo[/\\].*/,
]);

module.exports = config;
