var express = require("express");
var view = require("../lib/view");

var app = express();

/**
 * get flows and nodes that match query params
 */
app.get("/api/v1/search",function(req,res) {
    view.getForRequest(req).then(function(things) {
        res.json(things);
    })
});

module.exports = app;