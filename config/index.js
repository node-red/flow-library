try {
    module.exports = require("../settings.js");
} catch(err) {
    module.exports = require("../default-settings.js");
}
