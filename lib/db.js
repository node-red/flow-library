var settings = require("../config");

var mongojs = require('mongojs');

var db = mongojs(settings.mongo.url,["flows","nodes","users","tags","events","ratings"]);

db.flows.ensureIndex({updated_at:-1});
db.flows.ensureIndex({keywords:1});
db.flows.ensureIndex({"maintainers.name":1});
db.flows.ensureIndex({"rating.score": -1,"rating.count":-1});
db.flows.ensureIndex({"downloads.week": -1});

db.ratings.ensureIndex({module:1});
db.ratings.ensureIndex({user: 1, module:1});

module.exports = db;
