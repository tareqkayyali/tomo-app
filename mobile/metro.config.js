// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Shim native-only modules on web so the bundler doesn't crash
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    // react-native-pager-view is native-only — provide an empty module on web
    if (moduleName === 'react-native-pager-view') {
      return {
        filePath: path.resolve(__dirname, 'src/shims/react-native-pager-view.web.js'),
        type: 'sourceFile',
      };
    }
  }

  // Fall back to default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
