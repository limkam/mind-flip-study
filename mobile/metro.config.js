const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const exclusionList =
  require("metro-config/private/defaults/exclusionList").default ??
  require("metro-config/private/defaults/exclusionList");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Keep Metro from crawling the parent monorepo (fixes EMFILE on Linux without watchman).
config.watchFolders = [projectRoot];
config.resolver.blockList = exclusionList([
  new RegExp(
    `${monorepoRoot.replace(/[/\\]/g, "[/\\\\]")}[/\\\\](node_modules|dist|services|apps)([/\\\\].*)?`,
  ),
  /[/\\]\.git[/\\].*/,
  /[/\\]\.expo[/\\].*/,
]);

module.exports = config;
