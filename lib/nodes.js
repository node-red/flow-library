const db = require('./db')

const CORE_NODES = ['inject', 'debug', 'complete', 'catch', 'status', 'link in', 'link out', 'link call', 'comment', 'unknown', 'function', 'switch', 'change', 'range', 'template', 'delay', 'trigger', 'exec', 'rbe', 'tls-config', 'http proxy', 'mqtt in', 'mqtt out', 'mqtt-broker', 'http in', 'http response', 'http request', 'websocket in', 'websocket out', 'websocket-listener', 'websocket-client', 'tcp in', 'tcp out', 'tcp request', 'udp in', 'udp out', 'csv', 'html', 'json', 'xml', 'yaml', 'split', 'join', 'sort', 'batch', 'file', 'file in', 'watch'].reduce(function (o, v, i) {
    o[v] = 1
    return o
}, {})

async function saveToDb (info) {
    try {
        if (info) {
            info.type = 'node'
            info.updated_at = info.time.modified
            info.npmOwners = info.maintainers.map(function (m) { return m.name })
            console.log('saveToDb update', info._id)
            await db.flows.updateOne(
                { _id: info._id },
                { $set: info },
                { upsert: true }
            )
            return info._id + ' (' + info['dist-tags'].latest + ')'
        } else {
            // If the module was already downloaded, then this will get passed
            // null. Had it rejected, we would delete the module.
        }
    } catch (err) {
        console.log('!!!! saveToDb err', err)
        throw err
    }
}

async function update (id, info) {
    return db.flows.updateOne({ _id: id }, { $set: info }, {})
}

function removeFromDb (id) {
    return db.flows.deleteOne({ _id: id })
}

async function get (name, projection) {
    let query = {}
    let proj = {}
    // var proj = {
    //    name:1,
    //    description:1,
    //    "dist-tags":1,
    //    time:1,
    //    author:1,
    //    keywords:1
    // };
    if (typeof name === 'object') {
        proj = name
    } else if (typeof name === 'string') {
        query = { _id: name }
        if (typeof projection === 'object') {
            proj = projection
        }
    }

    query.type = 'node'

    const docs = await db.flows.find(query, { projection: proj }).sort({ 'time.modified': 1 }).toArray()
    if (query._id) {
        if (!docs[0]) {
            const err = new Error('node not found:' + name)
            err.code = 'NODE_NOT_FOUND'
            throw err
        } else {
            if (docs[0].versions) {
                docs[0].versions.latest = JSON.parse(docs[0].versions.latest)
            }
            return docs[0]
        }
    } else {
        return docs
    }
}
async function findTypes (types) {
    if (types.length === 0) {
        return {}
    } else {
        const query = types.map(function (t) {
            return { types: t }
        })
        const result = {}
        const docs = await db.flows.find({ type: 'node', $or: query }, { _id: 1, types: 1 }).toArray()
        docs.forEach(function (d) {
            d.types.forEach(function (t) {
                try {
                    result[t] = result[t] || []
                    result[t].push(d._id)
                } catch (err) {
                    console.log('Unexpected error lib/nodes.findTypes', err)
                    console.log(' - known types:', Object.keys(t))
                    console.log(' - trying to add:', t)
                    console.log(' - from:', d._id)
                }
            })
        })
        return result
    }
}

async function getLastUpdateTime (name) {
    const query = { type: 'node' }
    if (name) {
        query._id = name
    }
    const docs = await db.flows.find(query, { projection: { _id: 1, 'time.modified': 1, updated_at: 1 } }).sort({ 'time.modified': -1 }).limit(1).toArray()
    if (docs.length === 1) {
        // console.log(docs[0].updated_at)
        return (new Date(docs[0].updated_at)).getTime()
    }
    return 0
}

function getPopularByDownloads () {
    return db.flows.find({ type: 'node' }, { projection: { _id: 1, downloads: 1 } })
        .sort({ 'downloads.week': -1 })
        .limit(30)
        .toArray()
}

function getSummary () {
    return db.flows.find({ type: 'node' }, { projection: { _id: 1, downloads: 1, time: 1 } }).toArray()
}

module.exports = {
    CORE_NODES,
    save: saveToDb,
    remove: removeFromDb,
    update,
    close: async function () { return db.close() },
    get,
    findTypes,
    getLastUpdateTime,
    getPopularByDownloads,
    getSummary
}
