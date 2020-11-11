var settings = require("../config");
var npmNodes = require("../lib/nodes");
var npmModules = require("../lib/modules");

npmModules.refreshDownloads().then(() =>{}).catch(function(err) {
    console.log(err);
}).then(function() {
    npmNodes.close();
});
