var settings = require("../settings");

var mongojs = require('mongojs');

var db = mongojs(settings.mongo.url,["flows","nodes","users","tags"]);

db.flows.ensureIndex({updated_at:-1});
db.flows.ensureIndex({keywords:1});
db.flows.ensureIndex({"maintainers.name":1});

module.exports = db;
