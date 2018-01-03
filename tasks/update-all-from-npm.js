var settings = require("../config");
var npmNodes = require("../lib/nodes");
var npmModules = require("../lib/modules");
var events = require('../lib/events');

npmModules.getAllNpmModules().then(function(allModules) {
    var allKnownModules = {};
    allModules.forEach(function(module) {
        allKnownModules[module.name] = module.version;
    });
    npmNodes.get({_id:1, "dist-tags.latest":1}).then(function(knownNodes) {
        var allKnownNodes = {};
        knownNodes.forEach(function(r) {
            allKnownNodes[r._id] = r['dist-tags'].latest;
            if (!allKnownModules.hasOwnProperty(r._id)) {
                console.log("-",r._id);
                // this module has been removed from npm
                //     promises.push(npmNodes.remove(r._id).then(function() {;
                //         return events.add({
                //             "action": "remove",
                //             "module": r._id,
                //             "message": "Module not found on npm"
                //         });
                //     }));
            } else if (allKnownModules[r._id] !== allKnownNodes[r._id]) {
                // this module can be updated
                console.log(" ",r._id,allKnownNodes[r._id],"->",allKnownModules[r._id]);
            }
        });
        allModules.forEach(function(module) {
            if (!allKnownNodes.hasOwnProperty(module.name)) {
                // new module to add
                console.log("+",module.name);
            }
        });
        // resolve(when.settle(promises));
        npmNodes.close();
    });
});
