// This task is deprecated as update-all-from-npm.js does a better job of it
var settings = require("../config");
var npmNodes = require("../lib/nodes");
var npmModules = require("../lib/modules");

npmModules.pruneRemoved().then(function(results) {
    results.forEach(function(res) {
        if (res.state === 'rejected') {
            console.log("Failed:",res.reason);
        } else if (res.value) {
            console.log("Updated:",res.value);
        }
    });

    npmNodes.close();
});
