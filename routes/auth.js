var express = require("express");

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
        res.writeHead(200);
        res.end(JSON.stringify(req.session.user));
        return;
    }
}
function logout(req,res) {
    delete req.session.accessToken;
    res.redirect('/');
}
function loginCallback(req,res) {
    oauth.getOAuthAccessToken(req.query.code, {}, function (err, access_token, refresh_token) {
        if (err) {
            console.log(err);
            res.writeHead(500);
            res.end(err + "");
            return;
        }
        req.session.accessToken = access_token;

        github.getAuthedUser(req.session.accessToken).then(function(user) {
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
        }).otherwise(function(err) {
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
