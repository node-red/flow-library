var express = require("express");
var mustache = require('mustache');

var events = require("../lib/events");
var templates = require("../lib/templates");

var app = express();
app.get("/admin/log",function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    events.get().then(function(events) {
        context.events = events;
        res.send(mustache.render(templates.events,context,templates.partials));
    }).otherwise(function(err) {
        console.log(err);
        context.err = err;
        context.events = [];
        res.send(mustache.render(templates.events,context,templates.partials));
    });
});

module.exports = app;
