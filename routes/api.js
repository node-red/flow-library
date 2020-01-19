var express = require("express");
var view = require("../lib/view");
var npmNodes = require("../lib/nodes");

var app = express();

/**
 * get flows and nodes that match query params
 */
app.get("/api/v1/search",function(req,res) {
    view.getForQuery(req.query).then(function(result) {
        res.json(result);
    })
});


app.get("/api/types/:type", function(req,res) {
    npmNodes.findTypes([req.params.type]).then(function(typeMap) {
        res.json(typeMap[req.params.type]||(npmNodes.CORE_NODES[req.params.type]?["@node-red/nodes"]:[]));
    }).catch(function(err) {
        console.log(err);
        res.send(400);

    });
})
app.post("/api/types", function(req,res) {
    var typeList = req.body.types || [];

    var result = {};

    if (Array.isArray(typeList)) {
        npmNodes.findTypes(typeList).then(function(typeMap) {
            typeList.forEach(function(t) {
                if (typeMap[t]) {
                    result[t] = typeMap[t]
                } else if (npmNodes.CORE_NODES[t]) {
                    result[t] = ["@node-red/nodes"];
                } else {
                    result[t] = [];
                }
            })
            res.json(result);
        });
    } else {
        res.end(400);
    }

})
module.exports = app;
