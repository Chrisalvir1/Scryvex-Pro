const Module = require('module');
const path = require('path');

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'typescript') {
        try {
            const paths = parent ? parent.paths : [];
            return require.resolve('typescript-js', { paths });
        } catch (e) {
            // Fallback if typescript-js is not installed locally
            return originalResolveFilename.apply(this, arguments);
        }
    }
    return originalResolveFilename.apply(this, arguments);
};
