var settings = require("./settings");
var npmNodes = require("./lib/nodes");
var npmModules = require("./lib/modules");

// npmModules.getUpdatedModules(Date.now()-600000000).then(function(res) {
//     console.log(res.map(function(r) { return r.name}));
// }).otherwise(function(err) {
//     console.log(err.stack);
// })
// npmModules.refreshUpdatedSince(Date.now()-600000000).then(function(results) {
//     results.forEach(function(res) {
//         if (res.state === 'rejected') {
//             console.log("Failed:",res.reason);
//         } else if (res.value) {
//             console.log("Updated:",res.value);
//         }
//     });
//     npmNodes.close();
// })

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

// npmModules.refreshModule('node-red-contrib-mopidy').then(function(results) {
//     results.forEach(function(res) {
//         if (res.state === 'rejected') {
//             console.log("Failed:",res.reason);
//         } else if (res.value) {
//             console.log("Updated:",res.value);
//         }
//     });
//
//     npmNodes.close();
// });
