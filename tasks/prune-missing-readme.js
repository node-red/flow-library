// One off script to remove entries that are missing their README files

var settings = require("../config");
var npmNodes = require("../lib/nodes");
var npmModules = require("../lib/modules");
var db = require('../lib/db');
var when = require("when");

db.flows.find({$query:{readme:{$regex:/^ERROR: No README data found!/}}},{_id:1}).toArray(function(err,docs) {
    if (err) {
        console.log(err);
        return;
    }
    var promises = [];
    docs.forEach(function(r) {
        promises.push(npmNodes.remove(r._id));
    });
    when.settle(promises).then(function(results) {
        results.forEach(function(res) {
            if (res.state === 'rejected') {
                console.log("Failed:",res.reason);
            } else if (res.value) {
                console.log("Deleted:",res.value);
            }
        });
        db.close();
    })
});
