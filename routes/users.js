const express = require("express");
const mustache = require('mustache');
const appUtils = require("../lib/utils");
const db = require("../lib/db");
const templates = require("../lib/templates");
const viewster = require("../lib/view");
const users = require("../lib/users");
const app = express();
const https = require("https");


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

    db.users.find({_id:context.query.username},null,null,function(err,user) {
        if (user && user.length > 0) {
            context.user = user[0];
            if (user[0].npm_login && user[0].npm_login !== context.username) {
                context.query.npm_username = user[0].npm_login;
            }
        }
        res.send(mustache.render(templates.user, context, templates.partials));
    });
});

app.get("/settings", appUtils.csrfProtection(), function(req,res) {
    if (!req.session.accessToken) {
        res.writeHead(302, {
            Location: "/"
        });
        res.end();
        return;
    }
    var context = {};
    context.sessionuser = req.session.user;
    context.csrfToken = req.csrfToken();
    var username = req.session.user.login;
    users.get(username).then(function(user) {
        context.user = user;
        res.send(mustache.render(templates.userSettings, context, templates.partials));
    }).catch(err => {
        context.err = err;
        res.send(mustache.render(templates.userSettings, context, templates.partials));
    });
})

app.post("/settings/github-refresh", appUtils.csrfProtection(), function(req,res) {
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
app.post("/settings/npm-remove", appUtils.csrfProtection(), function(req,res) {
    if (!req.session.accessToken) {
        res.status(401).end();
        return;
    }
    var username = req.session.user.login;
    users.get(username).then(function(user) {
        user.npm_verified = false;
        user.npm_login = "";
        return users.update(user);
    }).then(user => {
        res.writeHead(303, {
            Location: "/settings"
        });
        res.end();
    }).catch(err => {
        console.log("Error updating user: " + err);
        res.status(400).end();
    });

});

app.post("/settings/npm-verify", appUtils.csrfProtection(), function(req,res) {
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
