// See api/webpack.config.js's resolve.alias entry for 'parse-css-color' for why this exists:
// satori imports parse-css-color as a real ESM default import, and webpack double-wraps the
// resulting ES module namespace object under interop, breaking satori's `.default(...)` call.
// A plain CommonJS re-export (with `.default` pointing at itself) sidesteps that entirely -
// webpack only ever applies a single interop wrapper to a CommonJS module.
const parseCSSColor = require('parse-css-color/dist/index.cjs.js');
module.exports = parseCSSColor;
module.exports.default = parseCSSColor;
