const express = require('express')
const mustache = require('mustache')

const categories = require('../lib/categories')
const templates = require('../lib/templates')
const appUtils = require('../lib/utils')

const app = express()

/**
 * Page: Browse Categories
 */
app.get('/categories', async function (req, res) {
    const context = {}
    context.categories = await categories.getAll()
    context.sessionuser = req.session.user
    context.isAdmin = req.session.user?.isAdmin
    context.isModerator = req.session.user?.isModerator
    res.send(mustache.render(templates.categories, context, templates.partials))
})

/**
 * Page: Add Category
 */
app.get('/add/category', appUtils.requireRole('admin'), function (req, res) {
    if (!req.session.user) {
        return res.redirect('/add')
    }
    const context = {}
    context.sessionuser = req.session.user
    res.send(mustache.render(templates.addCategory, context, templates.partials))
})

/**
 * API: Add Category
 */
app.post('/categories', appUtils.requireRole('admin'), async function (req, res) {
    const collection = {
        name: req.body.title,
        description: req.body.description
    }
    try {
        const id = await categories.create(collection)
        res.send('/categories/' + id)
    } catch (err) {
        console.log('Error creating category:', err)
        res.send(err)
    }
})

/**
 * Page: Category view
 */
app.get('/categories/:category', async function (req, res) {
    const context = {}
    context.sessionuser = req.session.user
    context.isAdmin = req.session.user?.isAdmin
    context.isModerator = req.session.user?.isModerator
    context.query = {
        category: req.params.category,
        type: 'node',
        hideOptions: true,
        ignoreQueryParams: true
    }
    try {
        context.category = await categories.get(req.params.category)
        context.category.summary = await appUtils.renderMarkdown(context.category.summary)
        context.category.description = await appUtils.renderMarkdown(context.category.description)

        res.send(mustache.render(templates.category, context, templates.partials))
    } catch (err) {
        if (err) {
            console.log('error loading nodes:', err)
        }
        res.status(404).send(mustache.render(templates['404'], context, templates.partials))
    }
})

/**
 * Page: Edit Category
 */
app.get('/categories/:category/edit', appUtils.csrfProtection(), appUtils.requireRole('admin'), async function (req, res) {
    const context = {}
    context.csrfToken = req.csrfToken()
    context.sessionuser = req.session.user
    try {
        context.category = await categories.get(req.params.category)
        res.send(mustache.render(templates.addCategory, context, templates.partials))
        res.end()
    } catch (err) {
        console.log('err', err)
        res.sendStatus(400)
    }
})

/**
 * API: Edit Category
 */
app.put('/categories/:category', appUtils.csrfProtection(), appUtils.requireRole('admin'), async function (req, res) {
    const category = {
        _id: req.params.category
    }
    if (req.body.title) {
        category.name = req.body.title.trim()
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
        category.description = req.body.description
    }
    try {
        await categories.update(category)
        res.send('/categories/' + req.params.category)
    } catch (err) {
        console.log('Error updating category:', err)
        res.status(400).json(err)
    }
})

module.exports = app
