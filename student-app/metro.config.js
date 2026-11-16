// The PDF viewer is native-only. On web (used for previews) it resolves to an
// empty module; viewer.tsx already copes with it being missing.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const NATIVE_ONLY = new Set(['react-native-pdf', 'react-native-blob-util']);

const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && NATIVE_ONLY.has(moduleName)) return { type: 'empty' };
  return (resolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
