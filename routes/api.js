var express = require("express");
var view = require("../lib/view");

var app = express();

/**
 * get flows and nodes that match query params
 */
app.get("/api/v1/search",function(req,res) {
    view.getForQuery(req.query).then(function(result) {
        res.json(result);
    })
});

module.exports = app;