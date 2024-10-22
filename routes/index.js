const querystring = require('querystring')

const express = require('express')
const mustache = require('mustache')

const templates = require('../lib/templates')
const viewster = require('../lib/view')

const app = express()

function queryFromRequest (req) {
    const query = Object.assign({}, req.query)
    query.page = Number(query.page) || 1
    query.num_pages = Number(query.num_pages) || 1
    query.page_size = Number(query.page_size) || viewster.DEFAULT_PER_PAGE
    return query
}
function getNextPageQueryString (count, query) {
    const currentPage = parseInt(query.page) || 1
    if (viewster.DEFAULT_PER_PAGE * currentPage < count) {
        return querystring.stringify(Object.assign({}, query, { page: currentPage + 1 }))
    }
    return null
}
function getPrevPageQueryString (count, query) {
    const currentPage = parseInt(query.page) || 1
    if (currentPage > 1) {
        return querystring.stringify(Object.assign({}, query, { page: currentPage - 1 }))
    }
    return null
}

app.get('/', async function (req, res) {
    const context = {}

    context.sessionuser = req.session.user
    context.nodes = {
        type: 'node',
        per_page: context.sessionuser ? 6 : 3,
        hideOptions: true,
        hideNav: true,
        ignoreQueryParams: true
    }
    context.flows = {
        type: 'flow',
        per_page: context.sessionuser ? 6 : 3,
        hideOptions: true,
        hideNav: true,
        ignoreQueryParams: true
    }
    context.collections = {
        type: 'collection',
        per_page: context.sessionuser ? 6 : 3,
        hideOptions: true,
        hideNav: true,
        ignoreQueryParams: true
    }
    const counts = await viewster.getTypeCounts()
    context.nodes.count = counts.node
    context.flows.count = counts.flow
    context.collections.count = counts.collection

    res.send(mustache.render(templates.index, context, templates.partials))
})

app.get('/things', async function (req, res) {
    const response = {
        links: {
            self: '/things?' + querystring.stringify(req.query),
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
    }
    const query = queryFromRequest(req)

    try {
        const result = await viewster.getForQuery(query)
        result.things = result.things || []
        result.things.forEach(function (thing) {
            thing.isNode = thing.type === 'node'
            thing.isFlow = thing.type === 'flow'
            thing.isCollection = thing.type === 'collection'
        })
        response.meta.results.count = result.count
        response.meta.results.total = result.total
        response.meta.pages.total = Math.ceil(result.count / viewster.DEFAULT_PER_PAGE)
        const nextQS = getNextPageQueryString(result.count, req.query)
        const prevQS = getPrevPageQueryString(result.count, req.query)

        if (nextQS) {
            response.links.next = '/things?' + nextQS
        }
        if (prevQS) {
            response.links.prev = '/things?' + prevQS
        }
        const context = {
            things: result.things,
            toFixed: function () {
                return function (num, render) {
                    return parseFloat(render(num)).toFixed(1)
                }
            }
        }
        if (req.session.user) {
            context.showTools = {}
            if (result.collectionOwners) {
                for (let i = 0; i < result.collectionOwners.length; i++) {
                    if (result.collectionOwners[i] === req.session.user.login) {
                        context.showTools.ownedCollection = true
                        break
                    }
                }
            }
        }
        if (query.collection) {
            context.collection = query.collection
        }
        if (query.format !== 'json') {
            response.html = mustache.render(templates.partials._gistitems, context, templates.partials)
        } else {
            response.data = result.things
        }
        setTimeout(function () {
            res.json(response)
        }, 0)// 2000);
    } catch (err) {
        response.err = err
        res.json(response)
    }
})

app.get('/search', function (req, res) {
    const context = {}
    context.sessionuser = req.session.user
    context.fullsearch = true
    const query = queryFromRequest(req)
    context.query = query
    res.send(mustache.render(templates.search, context, templates.partials))
})

app.get('/add', function (req, res) {
    const context = {}
    context.sessionuser = req.session.user
    res.send(mustache.render(templates.add, context, templates.partials))
})

app.get('/inspect', function (req, res) {
    const context = {}
    res.send(mustache.render(templates.flowInspector, context, templates.partials))
})
module.exports = app
