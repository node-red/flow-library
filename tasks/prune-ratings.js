var when = require("when");
var settings = require("../config");
var modules = require("../lib/modules");
var npmNodes = require("../lib/nodes");

modules.pruneRatings().then(function(results) {
    results.forEach(function(res) {
        if (res.state === 'rejected') {
            console.log("Failed: ",res.reason);
        } else if (res.value) {
            console.log("Updated: "+res.value);
        }
    });

    npmNodes.close();
});
