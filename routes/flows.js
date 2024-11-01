const express = require('express')
const mustache = require('mustache')

const uuid = require('uuid')

const collections = require('../lib/collections')
const gister = require('../lib/gists')
const npmNodes = require('../lib/nodes')
const ratings = require('../lib/ratings')
const templates = require('../lib/templates')
const appUtils = require('../lib/utils')

const app = express()

app.post('/flow', async function (req, res) {
    if (req.session.accessToken) {
        const gistPost = {
            description: req.body.title,
            public: false,
            files: {
                'flow.json': {
                    content: req.body.flow
                },
                'README.md': {
                    content: req.body.description
                }
            }
        }
        try {
            const id = await gister.create(req.session.accessToken, gistPost, req.body.tags || [])
            res.send('/flow/' + id)
        } catch (err) {
            console.log('Error creating flow:', err)
            res.send(err)
        }
    } else {
        res.status(403).end()
    }
})

const checkFlowId = (req, res, next) => {
    if (!/^[a-zA-Z0-9]+$/.test(req.params.id)) {
        console.log(`404 [invalid flow id]: ${req.params.id}`, req.ip)
        res.status(404).send(mustache.render(templates['404'], { sessionuser: req.session.user }, templates.partials))
    } else {
        next()
    }
}

app.get('/flow/:id', checkFlowId, appUtils.csrfProtection(), function (req, res) { getFlow(req.params.id, null, req, res) })
app.get('/flow/:id/share', checkFlowId, appUtils.csrfProtection(), function (req, res) { getShareableFlow(req.params.id, null, req, res) })
app.get('/flow/:id/in/:collection', checkFlowId, appUtils.csrfProtection(), function (req, res) { getFlow(req.params.id, req.params.collection, req, res) })

function parseGistFlow (gist) {
    if (!gist.flow) {
        gist.flow = []
    } else if (gist.flow) {
        try {
            const nodes = JSON.parse(gist.flow)
            const nodeTypes = {}
            for (const n in nodes) {
                const node = nodes[n]
                nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1
            }
            gist.nodeTypes = []
            for (const nt in nodeTypes) {
                gist.nodeTypes.push({ type: nt, count: nodeTypes[nt] })
            }
            gist.nodeTypes.sort(function (a, b) {
                if (a.type in npmNodes.CORE_NODES && !(b.type in npmNodes.CORE_NODES)) {
                    return -1
                }
                if (!(a.type in npmNodes.CORE_NODES) && b.type in npmNodes.CORE_NODES) {
                    return 1
                }
                if (a.type > b.type) return 1
                if (a.type < b.type) return -1
                return 0
            })
            gist.flow = JSON.stringify(nodes)
            // For the flow viewer we need to embed the flow into JavaScript. If
            // the flow contains HTML it needs to be escaped. We don't rely on mustache
            // escaping as we need to be able to reverse the escaping and, well, I
            // couldn't get it to work.
            gist.escapedFlow = gist.flow.replace(/[&<>"]/g, c => { return { '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] })
            // replace any escaped quotes
                .replace(/\\/g, '\\\\').replace()
        } catch (err) {
            gist.flow = 'Invalid JSON'
        }
    }
    return gist.flow
}

async function getShareableFlow (id, collection, req, res) {
    try {
        const gist = await gister.get(id)
        gist.flow = parseGistFlow(gist)
        gist.isShare = true
        gist.minHeight = req.query.height || 450
        res.send(mustache.render(templates.gistShare, gist, templates.partials))
    } catch (err) {
        // TODO: better error logging without the full stack trace
        if (err) {
            console.log('Error loading flow:', id, err)
        }
        try {
            console.log(`404 [flow not found]: ${id}`, req.ip)
            res.status(404).send(mustache.render(templates['404'], { sessionuser: req.session.user }, templates.partials))
        } catch (err2) {
            console.log(err2)
        }
    }
}

async function getFlow (id, collection, req, res) {
    try {
        const gist = await gister.get(id)
        if (!gist) {
            const err = new Error()
            err.code = 404
            throw err
        }
        gist.sessionuser = req.session.user
        gist.csrfToken = req.csrfToken()
        gist.collection = collection
        gist.created_at_since = appUtils.formatDate(gist.created_at)
        gist.updated_at_since = appUtils.formatDate(gist.updated_at)
        gist.refreshed_at_since = appUtils.formatDate(gist.refreshed_at)
        gist.pageTitle = gist.description + ' (flow)'

        if (req.cookies.rateID) {
            if (gist.rating && !Object.prototype.hasOwnProperty.call(gist.rating, 'count')) {
                delete gist.rating
            } else {
                const userRating = await ratings.getUserRating(id, req.cookies.rateID)
                if (userRating) {
                    if (!gist.rating) {
                        gist.rating = {}
                    }
                    gist.rating.userRating = userRating.rating
                }
                if (gist.rating && Object.prototype.hasOwnProperty.call(gist.rating, 'score')) {
                    gist.rating.score = (gist.rating.score || 0).toFixed(1)
                }
            }
        }
        let collectionSiblings
        if (collection) {
            collectionSiblings = await collections.getSiblings(collection, id)
        }

        if (gist.created_at_since === gist.updated_at_since) {
            delete gist.updated_at_since
        }
        gist.owned = (gist.sessionuser &&
            (
                (gist.owner.login === gist.sessionuser.login) ||
                (gist.sessionuser.isAdmin)
            ))

        gist.nodeTypes = []
        gist.flow = parseGistFlow(gist)
        const typeMap = await npmNodes.findTypes(gist.nodeTypes.map(function (t) { return t.type }))
        const nodeTypes = gist.nodeTypes
        gist.nodeTypes = { core: [], other: [] }

        nodeTypes.forEach(function (t) {
            const type = typeMap[t.type]
            if (type) {
                if (type.length === 1) {
                    t.module = type[0]
                } else if (type.length > 1) {
                    t.moduleAlternatives = type
                }
            }
            if (t.type in npmNodes.CORE_NODES) {
                delete t.module
                gist.nodeTypes.core.push(t)
            } else {
                gist.nodeTypes.other.push(t)
            }
        })
        const content = await appUtils.renderMarkdown(gist.readme || 'Missing readme')
        gist.readme = content
        if (collection && collectionSiblings && collectionSiblings.length > 0) {
            gist.collectionName = collectionSiblings[0].name
            gist.collectionPrev = collectionSiblings[0].prev
            gist.collectionPrevType = collectionSiblings[0].prevType
            gist.collectionNext = collectionSiblings[0].next
            gist.collectionNextType = collectionSiblings[0].nextType
        }
        res.send(mustache.render(templates.gist, gist, templates.partials))
    } catch (err) {
        // TODO: better error logging without the full stack trace
        if (err && err.code !== 404) {
            console.log('Error loading flow:', id)
            console.log(err)
        }
        try {
            console.log(`404 [flow not found]: ${id}`, req.ip)
            res.status(404).send(mustache.render(templates['404'], { sessionuser: req.session.user }, templates.partials))
        } catch (err2) {
            console.log(err2)
        }
    }
}

async function verifyOwner (req, res, next) {
    if (!req.session.user) {
        res.status(403).end()
    } else if (req.session.user.isAdmin) {
        next()
    } else {
        try {
            const gist = await gister.get(req.params.id)
            if (gist.owner.login === req.session.user.login) {
                next()
            } else {
                res.status(403).end()
            }
        } catch (err) {
            res.status(403).end()
        }
    }
}

app.post('/flow/:id/tags', verifyOwner, async function (req, res) {
    try {
        await gister.updateTags(req.params.id, req.body.tags)
        res.status(200).end()
    } catch (err) {
        console.log('Error updating tags:', err)
        res.status(200).end()
    }
})

app.post('/flow/:id/refresh', verifyOwner, async function (req, res) {
    try {
        const result = await gister.refresh(req.params.id)
        if (result === null) {
            // No update needed
            res.status(304).end()
        } else {
            res.send('/flow/' + req.params.id)
        }
        return null
    } catch (err) {
        if (err.code === 404) {
            res.status(404).send(mustache.render(templates['404'], { sessionuser: req.session.user }, templates.partials))
        } else {
            console.log('Error refreshing gist', req.params.id, err.toString())
            // An error object
            res.status(405).send(err.toString())
        }
    }
})

app.post('/flow/:id/rate', checkFlowId, appUtils.csrfProtection(), async function (req, res) {
    const id = req.params.id
    let ccCookie = null
    try {
        ccCookie = JSON.parse(req.cookies.cc_cookie)
    } catch (e) {
        ccCookie = null
    }
    if (req.cookies.rateID) {
        await ratings.rateThing(id, req.cookies.rateID, Number(req.body.rating))
        res.writeHead(303, {
            Location: '/flow/' + id
        })
        res.end()
    } else if (ccCookie && ccCookie.level.includes('functionality')) {
        const rateID = uuid.v4()
        res.cookie('rateID', rateID, { maxAge: 31556952000 })
        await ratings.rateThing(id, rateID, Number(req.body.rating))
        res.writeHead(303, {
            Location: '/flow/' + id
        })
        res.end()
    } else {
        res.writeHead(303, {
            Location: '/flow/' + id
        })
        res.end()
    }
})

app.post('/flow/:id/delete', checkFlowId, appUtils.csrfProtection(), verifyOwner, async function (req, res) {
    try {
        await gister.remove(req.params.id)
        res.writeHead(303, {
            Location: '/'
        })
        res.end()
    } catch (err) {
        res.send(400, err).end()
    }
})

app.get('/add/flow', function (req, res) {
    if (!req.session.user) {
        return res.redirect('/add')
    }
    const context = {}
    context.sessionuser = req.session.user
    res.send(mustache.render(templates.addFlow, context, templates.partials))
})

module.exports = app
