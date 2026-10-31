const {getDefaultConfig} = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('csv')) config.resolver.assetExts.push('csv');
module.exports = config;
