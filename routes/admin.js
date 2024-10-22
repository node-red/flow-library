const express = require('express')
const mustache = require('mustache')

const events = require('../lib/events')
const templates = require('../lib/templates')

const app = express()
app.get('/admin/log', async function (req, res) {
    const context = {}
    context.sessionuser = req.session.user
    try {
        context.events = await events.get()
        res.send(mustache.render(templates.events, context, templates.partials))
    } catch (err) {
        console.log(err)
        context.err = err
        context.events = []
        res.send(mustache.render(templates.events, context, templates.partials))
    }
})

module.exports = app
