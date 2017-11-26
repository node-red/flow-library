
var settings = require("../config");
var mongojs = require('mongojs');

var db = mongojs(settings.mongo.url,["flows","users","tags"]);
db.flows.find({},function(err,flows) {
    console.log(JSON.stringify(flows));
    db.close();
});
