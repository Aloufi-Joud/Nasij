// Web build (volunteer testing on a PC): Bluetooth and native maps don't exist in the browser
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const stubs = {
  'react-native-ble-plx': path.resolve(__dirname, 'src/web/ble-plx.ts'),
  'react-native-maps': path.resolve(__dirname, 'src/web/maps.tsx'),
};
config.resolver.resolveRequest = (context, name, platform) =>
  platform === 'web' && stubs[name]
    ? { type: 'sourceFile', filePath: stubs[name] }
    : context.resolveRequest(context, name, platform);

module.exports = config;
