const express = require('express')
const OAuth2 = require('oauth').OAuth2

const settings = require('../config')
const github = require('../lib/github')
const users = require('../lib/users')

const oauth = new OAuth2(settings.github.clientId, settings.github.secret, 'https://github.com/', 'login/oauth/authorize', 'login/oauth/access_token')

const app = express()

function login (req, res) {
    if (!req.session.accessToken) {
        if (req.query.return) {
            req.session.returnPath = req.query.return
        } else {
            delete req.session.returnPath
        }
        res.writeHead(303, {
            Location: oauth.getAuthorizeUrl({
                redirect_uri: settings.github.authCallback,
                scope: 'gist'
            })
        })
        res.end()
    } else {
        res.writeHead(302, {
            Location: req.query.return || '/'
        })
        res.end()
    }
}
function logout (req, res) {
    req.session.destroy(function (_) {
        res.redirect('/')
    })
}
function loginCallback (req, res) {
    if (!req.query.code) {
        res.writeHead(403)
        res.end()
        return
    }
    oauth.getOAuthAccessToken(req.query.code, {}, async function (err, accessToken, refreshToken) {
        if (err) {
            console.log(err)
            res.writeHead(500)
            res.end(err + '')
            return
        }
        if (!accessToken) {
            res.writeHead(403)
            res.end()
            return
        }
        req.session.accessToken = accessToken
        try {
            const user = await github.getAuthedUser(req.session.accessToken)
            await users.ensureExists(user.login, user)
            req.session.user = {
                login: user.login,
                avatar_url: user.avatar_url,
                url: user.html_url,
                name: user.name
            }
            res.writeHead(303, {
                Location: req.session.returnPath || '/'
            })
            res.end()
        } catch (err) {
            if (err) {
                res.writeHead(400)
                res.end(err + '')
            }
        }
    })
}

app.get('/login', login)
app.get('/logout', logout)
app.get('/login/callback', loginCallback)

module.exports = app
