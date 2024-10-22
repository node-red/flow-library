const express = require('express')

const npmNodes = require('../lib/nodes')
const view = require('../lib/view')

const app = express()

/**
 * get flows and nodes that match query params
 */
app.get('/api/v1/search', async function (req, res) {
    const result = await view.getForQuery(req.query)
    res.json(result)
})

app.get('/api/types/:type', async function (req, res) {
    try {
        const typeMap = await npmNodes.findTypes([req.params.type])
        res.json(typeMap[req.params.type] || (npmNodes.CORE_NODES[req.params.type] ? ['@node-red/nodes'] : []))
    } catch (err) {
        console.log(err)
        res.send(400)
    }
})
app.post('/api/types', async function (req, res) {
    const typeList = req.body.types || []

    const result = {}

    if (Array.isArray(typeList)) {
        const typeMap = await npmNodes.findTypes(typeList)
        typeList.forEach(function (t) {
            if (typeMap[t]) {
                result[t] = typeMap[t]
            } else if (npmNodes.CORE_NODES[t]) {
                result[t] = ['@node-red/nodes']
            } else {
                result[t] = []
            }
        })
        res.json(result)
    } else {
        res.end(400)
    }
})
module.exports = app
