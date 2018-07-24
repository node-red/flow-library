var when = require("when");
var settings = require("../config");
var npmNodes = require("../lib/nodes");
var npmModules = require("../lib/modules");
var events = require('../lib/events');

var toUpdate = [];

function processBatch() {
    console.log("processBatch",toUpdate.length,"to go");
    var handled = 0;
    var promises = [];
    while(promises.length < 10 && toUpdate.length > 0) {
        var name = toUpdate.shift();
        promises.push(npmModules.refreshModule(name));
    }
    return when.settle(promises).then(function() {
        if (toUpdate.length > 0) {
            return when.promise(function(resolve) {
                setTimeout(function() {
                    resolve(processBatch());
                },2000);
            });
        }
    });
}

npmModules.getAllNpmModules().then(function(allModules) {
    var allKnownModules = {};
    allModules.forEach(function(module) {
        allKnownModules[module.name] = module.version;
    });
    npmNodes.get({_id:1, "dist-tags.latest":1}).then(function(knownNodes) {
        var promises = [];
        var allKnownNodes = {};
        knownNodes.forEach(function(r) {
            allKnownNodes[r._id] = r['dist-tags'].latest;
            if (!allKnownModules.hasOwnProperty(r._id)) {
                promises.push(events.add({
                    "action": "remove",
                    "module": r._id,
                    "message": "Module not found on npm - manual review/remove required"
                }));
                // console.log("-",r._id);
                // // this module has been removed from npm
                // promises.push(npmNodes.remove(r._id).then(function() {
                //     return events.add({
                //         "action": "remove",
                //         "module": r._id,
                //         "message": "Module not found on npm"
                //     });
                // }));
            } else if (allKnownModules[r._id] !== allKnownNodes[r._id]) {
                // this module can be updated
                console.log(" ",r._id,allKnownNodes[r._id],"->",allKnownModules[r._id]);
                toUpdate.push(r._id);
                // promises.push(npmModules.refreshModule(r._id))
            }
        });
        allModules.forEach(function(module) {
            if (!allKnownNodes.hasOwnProperty(module.name)) {
                // new module to add
                console.log("+",module.name);
                toUpdate.push(module.name);
            }
        });

        processBatch().then(function() {
            npmNodes.close();
        });
    });
});
