var express = require("express");
var mustache = require('mustache');

var viewster = require("../lib/view");
var templates = require("../lib/templates");

var app = express();

app.get("/", function (req, res) {
    var context = {};

    context.sessionuser = req.session.user;
    var query = Object.assign({}, req.query);
    query.page = Number(query.page) || 1;
    query.view = "counts";
    context.query = query;

    viewster.getForQuery(query).then(function (result) {
        context.count = result.count || 0;
        context.total = result.total || 0;
        context.prevPage = query.page - 1;
        context.nextPage = (context.count - viewster.DEFAULT_PER_PAGE * query.page) > 0 ? query.page+ 1 : 0;
        res.send(mustache.render(templates.index, context, templates.partials));
    }).otherwise(function (err) {
        console.log(err);
        context.err = err;
        context.things = [];
        res.send(mustache.render(templates.index, context, templates.partials));
    });
});

app.get("/things", function (req, res) {
    var response = {};
    var query = Object.assign({}, req.query);

    query.page = Number(query.page) || 1;

    viewster.getForQuery(query).then(function (result) {
        response.count = result.count || 0;
        response.total = result.total || 0;
        response.query = query;
        response.prevPage = query.page - 1;
        response.nextPage = (response.count - viewster.DEFAULT_PER_PAGE * query.page) > 0 ? query.page+ 1 : 0;
        var context = {
            things: result.things
        };
        response.html = mustache.render(templates.partials._gistitems, context, templates.partials);
        res.json(response);
    }).otherwise(function (err) {
        console.log(err);
        context.err = err;
        context.things = [];
        res.send(mustache.render(templates.index, context, templates.partials));
    });
});

module.exports = app;
