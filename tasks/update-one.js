var settings = require("../config");
var npmNodes = require("../lib/nodes");
var npmModules = require("../lib/modules");
var name = process.argv[2];

if (!name) {
    console.log("Usage: node update-one.js <module>");
    process.exit(1);
}
npmModules.refreshModule(name).then(function(results) {
     results.forEach(function(res) {
         if (res.state === 'rejected') {
             console.log("Failed:",res.reason);
         } else if (res.value) {
             console.log("Updated:",res.value);
         }
     });

     npmNodes.close();
 });
