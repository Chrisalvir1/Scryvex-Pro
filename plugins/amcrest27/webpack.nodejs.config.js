const path = require('path');
const defaultConfig = require(process.env.SCRYPTED_DEFAULT_WEBPACK_CONFIG);

defaultConfig.resolve = defaultConfig.resolve || {};
defaultConfig.resolve.modules = [
    path.resolve(__dirname, 'node_modules'),
    ...(defaultConfig.resolve.modules || ['node_modules']),
];

module.exports = defaultConfig;
