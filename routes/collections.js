const express = require('express')
const mustache = require('mustache')
const uuid = require('uuid')

const collections = require('../lib/collections')
const ratings = require('../lib/ratings')
const templates = require('../lib/templates')
const appUtils = require('../lib/utils')
const app = express()

function isCollectionOwned (collection, user) {
    for (let i = 0; i < collection.gitOwners.length; i++) {
        if (collection.gitOwners[i] === user) {
            return true
        }
    }
    return false
}

async function verifyOwner (req, res, next) {
    if (!req.session.user) {
        res.status(403).end()
    } else {
        try {
            const collection = await collections.get(req.params.id)
            if (isCollectionOwned(collection, req.session.user.login)) {
                next()
            } else {
                res.status(403).end()
            }
        } catch (err) {
            res.status(403).end()
        }
    }
}

app.get('/add/collection', function (req, res) {
    if (!req.session.user) {
        return res.redirect('/add')
    }
    const context = {}
    context.sessionuser = req.session.user
    res.send(mustache.render(templates.addCollection, context, templates.partials))
})

app.post('/collection', async function (req, res) {
    if (req.session.accessToken) {
        const collection = {
            gitOwners: [req.session.user.login],
            name: req.body.title,
            description: req.body.description,
            items: req.body.items || []
        }
        if (collection.items.length === 0) {
            collection.empty = true
        }

        try {
            const id = await collections.create(collection)
            res.send('/collection/' + id)
        } catch (err) {
            console.log('Error creating collection:', err)
            res.send(err)
        }
    } else {
        res.status(403).end()
    }
})

app.get('/collection/:id', appUtils.csrfProtection(), async function (req, res) {
    const context = {}
    const id = req.params.id
    context.sessionuser = req.session.user
    context.query = {
        type: 'node,flow',
        hideOptions: true,
        collection: req.params.id,
        ignoreQueryParams: true
    }
    try {
        const collection = await collections.get(req.params.id)
        context.collection = collection
        context.pageTitle = collection.name + ' (collection)'

        if (req.session.user && req.cookies.rateID) {
            if (collection.rating && !Object.prototype.hasOwnProperty.call(collection.rating, 'count')) {
                delete collection.rating
            } else {
                console.log(req.session.user)
                const userRating = await ratings.getUserRating(id, req.cookies.rateID)
                console.log('userRating', userRating)
                if (userRating) {
                    if (!collection.rating) {
                        collection.rating = {}
                    }
                    collection.rating.userRating = userRating.rating
                }
                if (collection.rating && Object.prototype.hasOwnProperty.call(collection.rating, 'score')) {
                    collection.rating.score = (collection.rating.score || 0).toFixed(1)
                }
            }
        }

        const content = await appUtils.renderMarkdown(collection.description)
        collection.description = content
        collection.updated_at_since = appUtils.formatDate(collection.updated_at)
        collection.item_count = collection.items.length
        if (collection.item_count > 0) {
            collection.item_count_label = collection.items.length + ' thing' + (collection.items.length === 1 ? '' : 's')
        }

        if (context.sessionuser) {
            context.owned = isCollectionOwned(collection, context.sessionuser.login)
        }
        context.csrfToken = req.csrfToken()
        res.send(mustache.render(templates.collection, context, templates.partials))
    } catch (err) {
        console.log(err)
        res.sendStatus(404)
    }
})

app.get('/collection/:id/edit', appUtils.csrfProtection(), verifyOwner, async function (req, res) {
    const context = {}
    context.csrfToken = req.csrfToken()
    context.sessionuser = req.session.user
    try {
        const collection = await collections.get(req.params.id)
        context.collection = collection
        res.send(mustache.render(templates.addCollection, context, templates.partials))
        res.end()
    } catch (err) {
        console.log('err', err)
        res.sendStatus(400)
    }
})

app.put('/collection/:id', appUtils.csrfProtection(), verifyOwner, async function (req, res) {
    if (req.session.accessToken) {
        const collection = {
            _id: req.params.id
        }
        if (req.body.title) {
            collection.name = req.body.title
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
            collection.description = req.body.description
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'items')) {
            collection.items = req.body.items
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'owners')) {
            collection.gitOwners = req.body.owners
            if (typeof collection.gitOwners === 'string') {
                collection.gitOwners = [collection.gitOwners]
            }
            if (collection.gitOwners.length === 0) {
                delete collection.gitOwners
            }
        }
        try {
            const id = await collections.update(collection)
            res.send('/collection/' + id)
        } catch (err) {
            console.log('Error updating collection:', err)
            res.status(400).json(err)
        }
    } else {
        res.status(403).end()
    }
})

app.post('/collection/:id/delete', appUtils.csrfProtection(), verifyOwner, async function (req, res) {
    try {
        await collections.remove(req.params.id)
        res.writeHead(303, {
            Location: '/'
        })
        res.end()
    } catch (err) {
        console.log('err', err)
        res.sendStatus(400)
    }
})

app.post('/collection/:id/add/:scope(@[^\\/]{1,})?/:thingId([^@][^\\/]{1,})', verifyOwner, async function (req, res) {
    let thingId = req.params.thingId
    if (req.params.scope) {
        thingId = req.params.scope + '/' + thingId
    }
    try {
        await collections.addItem(req.params.id, thingId)
        res.sendStatus(200).end()
    } catch (err) {
        console.log('err', err)
        res.sendStatus(400)
    }
})

app.post('/collection/:id/delete/:scope(@[^\\/]{1,})?/:thingId([^@][^\\/]{1,})', appUtils.csrfProtection(), verifyOwner, async function (req, res) {
    let thingId = req.params.thingId
    if (req.params.scope) {
        thingId = req.params.scope + '/' + thingId
    }
    try {
        await collections.removeItem(req.params.id, thingId)
        res.sendStatus(200).end()
    } catch (err) {
        console.log('err', err)
        res.sendStatus(400)
    }
})

app.post('/collection/:id/rate', appUtils.csrfProtection(), async function (req, res) {
    const id = req.params.id
    let ccCookie
    try {
        ccCookie = JSON.parse(req.cookies.cc_cookie)
    } catch (e) {
        ccCookie = false
    }
    if (req.cookies.rateID) {
        await ratings.rateThing(id, req.cookies.rateID, Number(req.body.rating))
        res.writeHead(303, {
            Location: '/collection/' + id
        })
        res.end()
    } else if (ccCookie && ccCookie.level.includes('functionality')) {
        const rateID = uuid.v4()
        res.cookie('rateID', rateID, { maxAge: 31556952000 })
        await ratings.rateThing(id, rateID, Number(req.body.rating))
        res.writeHead(303, {
            Location: '/collection/' + id
        })
        res.end()
    } else {
        res.writeHead(303, {
            Location: '/collection/' + id
        })
        res.end()
    }
})

module.exports = app
