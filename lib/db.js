var settings = require("../settings");

var mongojs = require('mongojs');

var db = mongojs(settings.mongo.url,["flows","nodes","users","tags"]);

db.flows.ensureIndex({updated_at:-1});

module.exports = db;

