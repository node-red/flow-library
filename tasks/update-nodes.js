// This task is deprecated as update-all-from-npm.js does a better job of it
// In summary - the feed from libraries.io is more efficient to use as it tells
// us what has updated. But it often gets out of sync and misses updates.
// update-all-from-npm goes straight to npmjs, but has to check every single
// module - so we don't do it as often meaning it takes a bit longer for things
// to appear. But then, no-one's paying us to have things listed on the flow
// library instantly.

var settings = require("../config");
var npmNodes = require("../lib/nodes");
var npmModules = require("../lib/modules");

npmModules.refreshUpdated().then(function(results) {
    results.forEach(function(res) {
        if (res.state === 'rejected') {
            console.log("Failed:",res.reason);
        } else if (res.value) {
            console.log("Updated:",res.value);
        }
    });
}).otherwise(function(err) {
    console.log(err);
}).finally(function() {
    npmNodes.close();
});
