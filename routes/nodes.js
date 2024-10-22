const fs = require('fs')
const path = require('path')

const express = require('express')
const mustache = require('mustache')

const uuid = require('uuid')
const validatePackage = require('validate-npm-package-name')

const settings = require('../config')
const categories = require('../lib/categories')
const collections = require('../lib/collections')
const events = require('../lib/events')
const npmModules = require('../lib/modules')
const npmNodes = require('../lib/nodes')
const ratings = require('../lib/ratings')
const templates = require('../lib/templates')
const appUtils = require('../lib/utils')

const app = express()

const iconCache = {}

app.get('/nodes', async function (req, res) {
    const context = {}
    context.sessionuser = req.session.user
    try {
        const nodes = await npmNodes.getPopularByDownloads()
        context.nodes = nodes
        res.send(mustache.render(templates.nodes, context, templates.partials))
    } catch (err) {
        if (err) {
            console.log('error loading nodes:', err)
        }
        res.status(404).send(mustache.render(templates['404'], context, templates.partials))
    }
})

app.get('/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})', appUtils.csrfProtection(), function (req, res) {
    getNode(req.params.id, req.params.scope, null, req, res)
})
app.get('/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/in/:collection', appUtils.csrfProtection(), function (req, res) {
    getNode(req.params.id, req.params.scope, req.params.collection, req, res)
})

async function getNode (id, scope, collection, req, res) {
    if (scope) {
        id = scope + '/' + id
    }
    const isValid = validatePackage(id)
    if (!isValid.validForNewPackages && !isValid.validForOldPackages) {
        console.log(`404 [invalid package name]: ${id}`)
        res.status(404).send(mustache.render(templates['404'], { sessionuser: req.session.user }, templates.partials))
        return
    }
    try {
        const node = await npmNodes.get(id)
        node.sessionuser = req.session.user
        node.isAdmin = node.sessionuser && req.session.user.isAdmin
        node.isModerator = req.session.user?.isModerator
        node.Admins = settings.admins
        node.csrfToken = req.csrfToken()
        node.pageTitle = req.params.id + ' (node)'

        prepareScorecard(node)

        if (req.query.m) {
            try {
                node.message = Buffer.from(req.query.m, 'base64').toString()
            } catch (err) {}
        }

        node.updated_at_since = appUtils.formatDate(node.updated_at)
        iconCache[id] = {}
        node.types = []
        node.collection = collection

        if (req.cookies.rateID) {
            if (node.rating && !Object.prototype.hasOwnProperty.call(node.rating, 'count')) {
                delete node.rating
            } else {
                const userRating = await ratings.getUserRating(id, req.cookies.rateID)
                if (userRating) {
                    if (!node.rating) {
                        node.rating = {}
                    }
                    node.rating.userRating = userRating.rating
                }
                if (node.rating && Object.prototype.hasOwnProperty.call(node.rating, 'score')) {
                    node.rating.score = (node.rating.score || 0).toFixed(1)
                }
            }
        } else {
            if (node.rating) {
                node.rating.score = (node.rating.score || 0).toFixed(1)
            }
        }
        let collectionSiblings
        if (collection) {
            collectionSiblings = await collections.getSiblings(collection, id)
        }

        for (const n in node.versions.latest['node-red'].nodes) {
            const def = node.versions.latest['node-red'].nodes[n]
            // console.log(n);
            delete def.types.__errors__
            for (const t in def.types) {
                // console.log("-",n);
                def.types[t].name = t
                if (def.types[t].icon) {
                    if (/^font-awesome\//.test(def.types[t].icon)) {
                        def.types[t].iconFA = def.types[t].icon.substring(13)
                    } else if (!def.types[t].iconUrl) {
                        // Legacy nodes that have their icons stored locally
                        // and not uploaded to The Bucket
                        def.types[t].iconUrl = ('/icons/' + id + '/' + t).replace(/ /g, '%20')
                        const iconPath = path.join(__dirname, '../public/icons/', def.types[t].icon)
                        if (fs.existsSync(iconPath)) {
                            iconCache[id][t] = path.resolve(iconPath)
                        }
                    }
                }
                def.types[t].hasInputs = (def.types[t].inputs > 0)
                def.types[t].hasOutputs = (def.types[t].outputs > 0)
                if (def.types[t].category === 'config') {
                    delete def.types[t].color
                }

                node.types.push(def.types[t])
                // console.log(def.types[t]);
            }
        }
        // console.log(node);
        node.readme = node.readme || ''

        const content = await appUtils.renderMarkdown(node.readme)
        node.readme = content.replace(/^<h1 .*?<\/h1>/gi, '')
        if (node.repository && node.repository.url && /github\.com/.test(node.repository.url)) {
            let m
            const repo = node.repository.url
            let rawUrl
            let repoUrl
            if ((m = /git@github.com:(.*)\.git$/.exec(repo))) {
                rawUrl = 'https://raw.githubusercontent.com/' + m[1] + '/master/'
                repoUrl = 'https://github.com/' + m[1] + '/blob/master/'
                m = null
            } else if ((m = /https:\/\/github.com\/(.*)\.git/.exec(repo))) {
                rawUrl = 'https://raw.githubusercontent.com/' + m[1] + '/master/'
                repoUrl = 'https://github.com/' + m[1] + '/blob/master/'
                m = null
            } else if ((m = /https:\/\/github.com\/(.*)/.exec(repo))) {
                rawUrl = 'https://raw.githubusercontent.com/' + m[1] + '/master/'
                repoUrl = 'https://github.com/' + m[1] + '/blob/master/'
                m = null
            } else if ((m = /git:\/\/github.com\/(.*)\.git$/.exec(repo))) {
                rawUrl = 'https://raw.githubusercontent.com/' + m[1] + '/master/'
                repoUrl = 'https://github.com/' + m[1] + '/blob/master/'
                m = null
            }
            const re = /(<img .*?src="(.*?)")/gi

            while ((m = re.exec(node.readme)) !== null) {
                if (!/^https?:/.test(m[2])) {
                    const newImage = m[1].replace('"' + m[2] + '"', '"' + rawUrl + m[2] + '"')
                    node.readme = node.readme.substring(0, m.index) +
                                    newImage +
                                    node.readme.substring(m.index + m[1].length)
                }
            }

            if ((m = /(github.com\/.*?\/.*?)($|\.git$|\/.*$)/.exec(repo))) {
                node.githubUrl = 'https://' + m[1]
            }

            const linksRE = /(<a href="([^#].*?)")/gi
            while ((m = linksRE.exec(node.readme)) !== null) {
                if (!/^https?:/.test(m[2])) {
                    const targetUrl = /\.md$/i.test(m[2]) ? repoUrl : rawUrl
                    node.readme = node.readme.substring(0, m.index) + `<a href="${targetUrl}/${m[2]}"` + node.readme.substring(m.index + m[1].length)
                }
            }
        } else {
            const re = /(<img .*?src="(.*?)")/gi
            let m
            while ((m = re.exec(node.readme)) !== null) {
                if (!/^http/.test(m[2])) {
                    node.readme = node.readme.substring(0, m.index) +
                                    '<img src=""' +
                                    node.readme.substring(m.index + m[1].length)
                }
            };
        }
        if (collection && collectionSiblings && collectionSiblings.length > 0) {
            node.collectionName = collectionSiblings[0].name
            node.collectionPrev = collectionSiblings[0].prev
            node.collectionPrevType = collectionSiblings[0].prevType
            node.collectionNext = collectionSiblings[0].next
            node.collectionNextType = collectionSiblings[0].nextType
        }
        if (node.isAdmin || node.isModerator) {
            node.allCategories = await categories.getAll()
            if (node.categories) {
                const nodeCategories = new Set()
                node.categories.forEach(cat => nodeCategories.add(cat))
                node.allCategories = node.allCategories.map(cat => {
                    if (nodeCategories.has(cat._id)) {
                        return { selected: true, ...cat }
                    }
                    return cat
                })
            }
        }

        res.send(mustache.render(templates.node, node, templates.partials))
    } catch (err) {
        if (err) {
            if (err.code === 'NODE_NOT_FOUND') {
                console.log(`404 [node not found]: ${id}`, req.ip)
            } else {
                console.log('error loading node:', err)
            }
        }
        res.status(404).send(mustache.render(templates['404'], { sessionuser: req.session.user }, templates.partials))
    }
};

app.get('/icons/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/:type', function (req, res) {
    let id = req.params.id
    if (req.params.scope) {
        id = req.params.scope + '/' + id
    }
    const type = req.params.type
    if (iconCache[id] && iconCache[id][type]) {
        res.sendFile(iconCache[id][type])
    } else {
        res.sendFile(path.resolve(path.join(__dirname, '../public/icons/arrow-in.png')))
    }
})

app.get('/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/refresh', appUtils.csrfProtection(), function (req, res) {
    res.status(400).send('This end point is no longer used. If you are calling it directly - update to use POST /add/node instead')
})

app.post('/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/report', appUtils.csrfProtection(), function (req, res) {
    let id = req.params.id
    if (req.params.scope) {
        id = req.params.scope + '/' + id
    }
    const isValid = validatePackage(id)
    if (!isValid.validForNewPackages && !isValid.validForOldPackages) {
        res.status(404).send()
        return
    }

    if (req.session.user) {
        events.add({
            action: 'module_report',
            module: id,
            message: req.body.details,
            user: req.session.user.login
        })
    }
    res.writeHead(303, {
        Location: '/node/' + id
    })
    res.end()
})

app.post('/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/rate', appUtils.csrfProtection(), async function (req, res) {
    let id = req.params.id
    let ccCookie
    try {
        ccCookie = JSON.parse(req.cookies.cc_cookie)
    } catch (e) {
        ccCookie = false
    }
    if (req.params.scope) {
        id = req.params.scope + '/' + id
    }
    const isValid = validatePackage(id)
    if (!isValid.validForNewPackages && !isValid.validForOldPackages) {
        res.status(404).send()
        return
    }

    if (req.cookies.rateID) {
        await ratings.rateThing(id, req.cookies.rateID, Number(req.body.rating))
        res.writeHead(303, {
            Location: '/node/' + id
        })
        res.end()
    } else if (ccCookie && ccCookie.level.includes('functionality')) {
        const rateID = uuid.v4()
        res.cookie('rateID', rateID, { maxAge: 31556952000 })
        await ratings.rateThing(id, rateID, Number(req.body.rating))
        res.writeHead(303, {
            Location: '/node/' + id
        })
        res.end()
    } else {
        res.writeHead(303, {
            Location: '/node/' + id
        })
        res.end()
    }
})

app.post('/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/category', appUtils.csrfProtection(), async function (req, res) {
    let id = req.params.id
    if (req.params.scope) {
        id = req.params.scope + '/' + id
    }
    const isValid = validatePackage(id)
    if (!isValid.validForNewPackages && !isValid.validForOldPackages) {
        res.status(404).send()
        return
    }
    if (req.session.user?.isAdmin || req.session.user?.isModerator) {
        let categories = req.body.category || []
        if (!Array.isArray(categories)) {
            categories = [categories]
        }
        await npmNodes.update(id, { categories })
    }
    res.writeHead(303, {
        Location: '/node/' + id
    })
    res.end()
})

app.get('/add/node', appUtils.csrfProtection(), function (req, res) {
    const context = {}
    context.sessionuser = req.session.user
    context.csrfToken = req.csrfToken()
    res.send(mustache.render(templates.addNode, context, templates.partials))
})

app.delete('/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})', appUtils.csrfProtection(), appUtils.requireRole('admin'), async function (req, res) {
    let id = req.params.id
    if (req.params.scope) {
        id = req.params.scope + '/' + id
    }
    const isValid = validatePackage(id)
    if (!isValid.validForNewPackages && !isValid.validForOldPackages) {
        res.status(404).send()
        return
    }
    try {
        await npmNodes.remove(id)
        res.writeHead(303, {
            Location: '/'
        })
        res.end()
    } catch (err) {
        res.status(400).send()
    }
})

app.post('/add/node', appUtils.csrfProtection(), async function (req, res) {
    const context = {}
    context.sessionuser = req.session.user
    let name = req.body.module
    if (name) {
        name = name.trim()
        const isValid = validatePackage(name)
        if (!isValid.validForNewPackages) {
            res.status(400).send('Invalid module name')
            return
        }
        const results = await npmModules.refreshModule(name)
        console.log(results)
        results.forEach(function (result) {
            if (result.state === 'rejected') {
                res.status(400).send(result.reason.toString())
            } else if (result.value) {
                res.send('/node/' + name + '?m=' + Buffer.from(result.value).toString('base64'))
            } else {
                res.status(400).send('Module already at latest version')
            }
        })
    } else {
        res.status(400).send('Invalid module name')
    }
})

app.get('/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/scorecard', appUtils.csrfProtection(), async function (req, res) {
    let id = req.params.id
    if (req.params.scope) {
        id = req.params.scope + '/' + id
    }
    const isValid = validatePackage(id)
    if (!isValid.validForNewPackages) {
        res.status(400).send('Invalid module name')
        return
    }
    try {
        const node = await npmNodes.get(id)
        node.sessionuser = req.session.user
        node.csrfToken = req.csrfToken()
        node.pageTitle = req.params.id + ' (node)'

        prepareScorecard(node)

        res.send(mustache.render(templates.scorecard, node, templates.partials))
    } catch (err) {
        if (err) {
            if (err.code === 'NODE_NOT_FOUND') {
                console.log(`404 [scorecard]: ${id}`, req.ip)
            } else {
                console.log('error loading node scorecard:', err)
            }
        }
        res.status(404).send(mustache.render(templates['404'], { sessionuser: req.session.user }, templates.partials))
    }
})

function prepareScorecard (node) {
    if (node.scorecard) {
        if (node.scorecard.N01 && node.scorecard.N01.nodes) {
            node.scorecard.N01.nodes = [...new Set(node.scorecard.N01.nodes)]
            node.scorecard.N01.nodes.sort()
        }
        const summary = {
            pass: 0,
            fail: 0,
            warn: 0
        }
        for (const [rule, result] of Object.entries(node.scorecard)) {
            if (rule !== 'package') {
                if (result.test) {
                    result.pass = true
                    summary.pass++
                } else {
                    if (['P01', 'P04', 'P05', 'D02'].includes(rule)) {
                        result.fail = true
                        summary.fail++
                    } else {
                        result.warn = true
                        summary.warn++
                    }
                }
            }
        }
        node.scorecard.summary = summary
    }
}

module.exports = app
