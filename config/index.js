try {
    module.exports = require("../settings.js");
} catch(err) {
    module.exports = require("../default-settings.js");
    if (process.env.NR_MAINTENANCE !== undefined) {
        module.exports.maintenance = true
    }
    module.exports.port = process.env.PORT || module.exports.port;
    module.exports.github.clientId = process.env.NR_GITHUB_CLIENTID || module.exports.github.clientId;
    module.exports.github.secret = process.env.NR_GITHUB_SECRET || module.exports.github.secret;
    module.exports.github.authCallback = process.env.NR_GITHUB_CALLBACK || module.exports.github.authCallback;
    module.exports.github.accessToken = process.env.NR_GITHUB_ACCESS_TOKEN || module.exports.github.accessToken;
    module.exports.mongo.url = process.env.NR_MONGO_URL || module.exports.mongo.url;
    module.exports.session.key = process.env.NR_SESSION_KEY || module.exports.session.key;
    module.exports.session.secret = process.env.NR_SESSION_SECRET || module.exports.session.secret;
    if (process.env.NR_ADMINS) {
        module.exports.admins = process.env.NR_ADMINS.split(",").map(t =>t.trim())
    }
    module.exports.twitter.consumer_key = process.env.NR_TWITTER_CONSUMER_KEY || module.exports.twitter.consumer_key;
    module.exports.twitter.consumer_secret = process.env.NR_TWITTER_CONSUMER_SECRET || module.exports.twitter.consumer_secret;
    module.exports.twitter.access_token_key = process.env.NR_TWITTER_ACCESS_TOKEN_KEY || module.exports.twitter.access_token_key;
    module.exports.twitter.access_token_secret = process.env.NR_TWITTER_ACCESS_TOKEN_SECRET || module.exports.twitter.access_token_secret;
    module.exports.slack.webhook = process.env.NR_SLACK_WEBHOOK || module.exports.slack.webhook;

    if (process.env.NR_MODULE_BLOCKLIST) {
        module.exports.modules.block = process.env.NR_MODULE_BLOCKLIST.split(",").map(t =>t.trim())
    }
    module.exports.aws.iconBucket = process.env.NR_AWS_BUCKET || module.exports.aws.iconBucket
    module.exports.aws.accessKeyId = process.env.NR_AWS_ACCESS_KEY_ID || module.exports.aws.accessKeyId
    module.exports.aws.secretAccessKey = process.env.NR_AWS_SECRET_ACCESS_KEY || module.exports.aws.secretAccessKey
    module.exports.aws.region = process.env.NR_AWS_REGION || module.exports.aws.region
}
