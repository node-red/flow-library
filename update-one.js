var settings = require("./settings");
var npmNodes = require("./lib/nodes");
var npmModules = require("./lib/modules");

npmModules.refreshModule('node-red-contrib-idm').then(function(results) {
console.log(results);
     results.forEach(function(res) {
         if (res.state === 'rejected') {
             console.log("Failed:",res.reason);
         } else if (res.value) {
             console.log("Updated:",res.value);
         }
     });

     npmNodes.close();
 });
