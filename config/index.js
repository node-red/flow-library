try {
    module.exports = require("../settings.js");
} catch(err) {
    module.exports = require("../default-settings.js");
}

if (process.env.NR_MONGO_URL) {
    module.exports.mongo.url = process.env.NR_MONGO_URL;
}