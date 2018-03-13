var express = require("express");
var mustache = require('mustache');

var viewster = require("../lib/view");
var templates = require("../lib/templates");

var app = express();

function queryFromRequest(req) {
    var query = Object.assign({}, req.query);
    query.page = Number(query.page) || 1;
    query.num_pages = Number(query.num_pages) || 1;
    query.page_size = Number(query.page_size) || viewster.DEFAULT_PER_PAGE;
    return query;
}

function nextPage(count, query) {
    return (count - viewster.DEFAULT_PER_PAGE * (query.page+query.num_pages-1)) > 0 ? query.page+1 : 0;
}

app.get("/", function (req, res) {
    var context = {};

    context.sessionuser = req.session.user;
    var query = queryFromRequest(req);
    query.view = "counts";
    context.query = query;
    context.prevPage = query.page - 1;

    viewster.getForQuery(query).then(function (result) {
        context.count = result.count;
        context.total = result.total;
        context.nextPage = nextPage(context.count, query);
        res.send(mustache.render(templates.index, context, templates.partials));
    }).otherwise(function (err) {
        console.log(err);
        context.err = err;
        res.send(mustache.render(templates.index, context, templates.partials));
    });
});

app.get("/things", function (req, res) {
    var response = {};
    var query = queryFromRequest(req);
    response.query = query;
    response.prevPage = query.page - 1;

    viewster.getForQuery(query).then(function (result) {
        response.count = result.count;
        response.total = result.total;
        response.nextPage = nextPage(response.count, query);
        var context = {
            things: result.things,
            toFixed: function() {
                return function(num, render) {
                    return parseFloat(render(num)).toFixed(1);
                }
            }
        };
        response.html = mustache.render(templates.partials._gistitems, context, templates.partials);
        res.json(response);
    }).otherwise(function (err) {
        console.log(err);
        response.err = err;
        res.json(response);
    });
});

module.exports = app;
