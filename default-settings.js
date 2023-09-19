var path = require('path');

var settings = {
    port: 8080,
    github: {
        clientId: "",
        secret: "",
        authCallback: "http://localhost:8080/login/callback",
        accessToken: ""
    },
    mongo: {
        url: 'mongodb://mongo/flows'
    },
    session: {
        key: 'nr.sid',
        secret: 'giraffe'
    },
    admins: ["knolleary","dceejay"],
    twitter: {
        consumer_key: '',
        consumer_secret: '',
        access_token_key: '',
        access_token_secret: ''
    },
    mastodon: {
        url: '',
        token: ''
    },
    slack: {
        webhook: ''
    },
    modules: {
        block: []
    },
    aws: {
        iconBucket: "",
        accessKeyId: "",
        secretAccessKey: "",
        region: ""
    }
};

module.exports = settings;