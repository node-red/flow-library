var express = require("express");
const users = require("../lib/users");
var github = require("../lib/github");
var settings = require('../config');
var OAuth2 = require("oauth").OAuth2;
var oauth = new OAuth2(settings.github.clientId, settings.github.secret, "https://github.com/", "login/oauth/authorize", "login/oauth/access_token");

var app = express();

function login(req,res) {
    if (!req.session.accessToken) {
        if (req.query.return) {
            req.session.returnPath = req.query.return;
        } else {
            delete req.session.returnPath;
        }
        res.writeHead(303, {
            Location: oauth.getAuthorizeUrl({
                redirect_uri: settings.github.authCallback,
                scope: "gist"
            })
        });
        res.end();
        return;
    } else {
        res.writeHead(302, {
            Location: req.query.return||"/"
        });
        res.end();
        return;
    }
}
function logout(req,res) {
    req.session.destroy(function(err) {
        res.redirect('/');
    })
}
function loginCallback(req,res) {
    if (!req.query.code) {
        res.writeHead(403);
        res.end();
        return;
    }
    oauth.getOAuthAccessToken(req.query.code, {}, function (err, access_token, refresh_token) {
        if (err) {
            console.log(err);
            res.writeHead(500);
            res.end(err + "");
            return;
        }
        if (!access_token) {
            res.writeHead(403);
            res.end();
            return;
        }
        req.session.accessToken = access_token;

        github.getAuthedUser(req.session.accessToken).then(function(user) {
            return users.ensureExists(user.login,user).then(function() {
                req.session.user = {
                    login: user.login,
                    avatar_url: user.avatar_url,
                    url: user.html_url,
                    name: user.name
                };
                res.writeHead(303, {
                    Location: req.session.returnPath||"/"
                });
                res.end();
            });
        }).catch(function(err) {
            if (err) {
                res.writeHead(err.code);
                res.end(err + "");
            }
        });
    });
}

app.get("/login",login);
app.get("/logout",logout);
app.get("/login/callback",loginCallback);

module.exports = app;
