const express = require("express");
const mustache = require('mustache');
const csrf = require('csurf');
const appUtils = require("../lib/utils");
const db = require("../lib/db");
const templates = require("../lib/templates");
const viewster = require("../lib/view");
const users = require("../lib/users");
const app = express();
const https = require("https");

const csrfProtection = csrf({ cookie: true });

app.get("/user/:username", function (req, res) {
    var context = {};
    context.sessionuser = req.session.user;
    context.username = req.params.username;
    context.query =  {
        id: Math.floor(Math.random()*16777215).toString(16),
        username: req.params.username,
        sort: "recent",
        type: ""
    }

    db.users.findOne({_id:context.query.username},function(err,user) {
        if (user) {
            context.user = user;
            // baseQuery.npm_username = user.npm_login;
        }
        // var promises = [];
        // promises.push(viewster.getForQuery(Object.assign({},baseQuery,{type:"flow"})).then(function (result) {
        //     context.flows = {
        //         type: "Flows",
        //         count: result.count,
        //         total: result.total,
        //         things: result.things||[]
        //     }
        // }));
        // promises.push(viewster.getForQuery(Object.assign({},baseQuery,{type:"node"})).then(function (result) {
        //     context.nodes = {
        //         type: "Nodes",
        //         count: result.count,
        //         total: result.total,
        //         things: result.things||[]
        //     }
        //     context.nodes.things.forEach(n => { n.isNode = true;})
        // }));
        // Promise.all(promises).then(function(results) {
        //     console.log(context);
        res.send(mustache.render(templates.user, context, templates.partials));
        // }).catch(function (err) {
        //     console.log(err);
        //     context.err = err;
        //     res.send(mustache.render(templates.user, context, templates.partials));
        // });
    });
});

app.get("/user/:username/:thing", function (req, res) {
    var context = {};
    context.sessionuser = req.session.user;
    context.username = req.params.username;

    var query = {
        type: req.params.thing.replace(/s$/,""),
        sort: req.query.sort
    }
    query.username = req.params.username;

    db.users.findOne({_id:query.username},function(err,user) {
        if (user) {
            context.user = user;
            query.npm_username = user.npm_login;
        }
        console.log("Q",query)
        viewster.getForQuery(query).then(function (result) {
            context.count = result.count;
            context.total = result.total;
            context.nextPage = appUtils.getNextPage(context.count, query);

            context.things = result.things||[];
            context.things.forEach(function(thing) {
                if (thing.type === 'node') {
                    thing.isNode = true;
                }
            })
console.log(context);
            res.send(mustache.render(templates.user, context, templates.partials));

        }).catch(function (err) {
            console.log(err);
            context.err = err;
            res.send(mustache.render(templates.user, context, templates.partials));
        });
    });
});

app.get("/settings", csrfProtection, function(req,res) {
    // if (!req.session.accessToken) {
    //     res.writeHead(302, {
    //         Location: "/"
    //     });
    //     res.end();
    //     return;
    // }
    var context = {};
    context.sessionuser = req.session.user;
    context.csrfToken = req.csrfToken();
    var username = "knolleary"; //req.session.user.login;
    users.get(username).then(function(user) {
        context.user = user;
        console.log(context.user);
        res.send(mustache.render(templates.userSettings, context, templates.partials));
    }).catch(err => {
        context.err = err;
        res.send(mustache.render(templates.userSettings, context, templates.partials));
    });
})

app.post("/settings/github-refresh", csrfProtection, function(req,res) {
    if (!req.session.accessToken) {
        res.status(401).end();
        return;
    }
    var username = req.session.user.login;
    users.refreshUserGitHub(username).then(function() {
        res.writeHead(303, {
            Location: "/settings"
        });
        res.end();
    }).catch(function(err) {
        console.log("Refresh github failed. ERR:",err);
        res.writeHead(303, {
            Location: "/settings"
        });
        res.end();
    });
});

app.post("/settings/npm-verify", csrfProtection, function(req,res) {
    if (!req.session.accessToken) {
        res.status(401).end();
        return;
    }
    var username = req.session.user.login;
    var token = req.body.token||"";
    var options = {
        host: "registry.npmjs.org",
        port: 443,
        path: "/-/npm/v1/user",
        method: "get",
        headers: {
            "Authorization": "Bearer "+token
        }
    }
    var request = https.request(options,function(response) {
        response.setEncoding("utf8");
        var data = "";
        response.on("data", function(chunk) {
            data += chunk;
        });
        response.on("end", function() {
            if (/^application\/json/.test(response.headers['content-type'])) {
                data = JSON.parse(data);
            }
            if (response.statusCode !== 200) {
                res.writeHead(303, {
                    Location: "/settings#npm-verify=fail"
                })
                res.end();
                return;
            }
            users.get(username).then(function(user) {
                user.npm_verified = true;
                user.npm_login = data.name;
                return users.update(user);
            }).then(user => {
                res.writeHead(303, {
                    Location: "/settings#npm-verify=success"
                });
                res.end();
            }).catch(err => {
                console.log("Error updating user: " + err);
                res.status(400).end();
            });
        });
    });
    request.on("error", function(e) {
        console.log("problem with request: " + e.message);
        res.status(400).end();
    });
    request.end();
});

module.exports = app;
