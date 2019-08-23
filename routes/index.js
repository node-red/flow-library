const express = require("express");
const mustache = require('mustache');
const db = require("../lib/db");
const viewster = require("../lib/view");
const templates = require("../lib/templates");
const appUtils = require("../lib/utils");

const querystring = require('querystring');

const app = express();



app.get("/", function (req, res) {
    var context = {};

    context.sessionuser = req.session.user;
    context.nodes = {
        type: 'node',
        per_page: context.sessionuser?6:3,
        hideOptions: true,
        ignoreQueryParams: true
    }
    context.flows = {
        type: 'flow',
        per_page: context.sessionuser?6:3,
        hideOptions: true,
        ignoreQueryParams: true
    }

    viewster.getTypeCounts().then(function(counts) {
        context.nodes.count = counts.node;
        context.flows.count = counts.flow;
        res.send(mustache.render(templates.index, context, templates.partials));
    });
});





function queryFromRequest(req) {
    var query = Object.assign({}, req.query);
    query.page = Number(query.page) || 1;
    query.num_pages = Number(query.num_pages) || 1;
    query.page_size = Number(query.page_size) || viewster.DEFAULT_PER_PAGE;
    return query;
}

function getNextPageQueryString(count, query) {
    var currentPage = parseInt(query.page) || 1;
    if (viewster.DEFAULT_PER_PAGE * currentPage < count) {
        return querystring.stringify(Object.assign({}, query,{page:currentPage+1}))
    }
    return null
}
function getPrevPageQueryString(count, query) {
    var currentPage = parseInt(query.page) || 1;
    if (currentPage > 1) {
        return querystring.stringify(Object.assign({}, query,{page:currentPage-1}))
    }
    return null
}

app.get("/things", function (req, res) {
    var response = {
        links: {
            self: "/things?"+querystring.stringify(req.query),
            prev: null,
            next: null
        },
        meta: {
            pages: {
                current: parseInt(req.query.page) || 1
            },
            results: {

            }
        }
    };
    var query = queryFromRequest(req);
    console.log(query);

    viewster.getForQuery(query).then(function (result) {
        result.things = result.things||[];
        result.things.forEach(function(thing) {
            if (thing.type === 'node') {
                thing.isNode = true;
            }
        })
        response.meta.results.count = result.count;
        response.meta.results.total = result.total;
        response.meta.pages.total =  Math.ceil(result.count/viewster.DEFAULT_PER_PAGE);
        var nextQS = getNextPageQueryString(result.count,req.query);
        var prevQS = getPrevPageQueryString(result.count,req.query);

        if (nextQS) {
            response.links.next = "/things?"+nextQS;
        }
        if (prevQS) {
            response.links.prev = "/things?"+prevQS;
        }
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
    }).catch(function (err) {
        console.log(err);
        response.err = err;
        res.json(response);
    });
});


app.get("/search", function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    context.fullsearch = true;
    var query = queryFromRequest(req);
    context.query = query;
    res.send(mustache.render(templates.search, context, templates.partials));
});

app.get("/add",function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    res.send(mustache.render(templates.add,context,templates.partials));
});
app.get("/add/node",function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    res.send(mustache.render(templates.addNode,context,templates.partials));
});

module.exports = app;
