var settings = require("../settings");

var mongojs = require('mongojs');

var db = mongojs(settings.mongo.url,["flows","nodes","users","tags"]);

module.exports = db;

