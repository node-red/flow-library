var express = require("express");
var mustache = require('mustache');

var viewster = require("../lib/view");
var templates = require("../lib/templates");

var app = express();
app.get("/",function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    viewster.get().then(function(things) {
        context.things = things;
        res.send(mustache.render(templates.index,context,templates.partials));
    }).otherwise(function(err) {
        console.log(err);
        context.err = err;
        context.things = [];
        res.send(mustache.render(templates.index,context,templates.partials));
    });
});


module.exports = app;
