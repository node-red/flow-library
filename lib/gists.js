const db = require('./db')
const github = require('./github')
const users = require('./users')
const view = require('./view')

async function getGist (id, projection) {
    projection = projection || {}
    return db.flows.findOne({ _id: id }, projection)
}

async function refreshGist (id) {
    console.log(`Request to refresh gist ${id}`)
    const gist = await getGist(id, { etag: 1, tags: 1, added_at: 1 })
    if (!gist) {
        const err = new Error('not_found')
        err.code = 404
        throw err
    }
    const etag = process.env.FORCE_UPDATE ? null : gist.etag
    console.log(` - using etag ${etag}`)
    try {
        const data = await github.getGist(id, etag)
        if (data == null) {
            console.log(' - github returned null')
            // no update needed
            await db.flows.updateOne({ _id: id }, { $set: { refreshed_at: Date.now() } })
            return null
        } else {
            data.added_at = gist.added_at
            data.tags = gist.tags
            data.type = 'flow'
            return addGist(data)
        }
    } catch (err) {
        console.log(` - error during refresh - removing gist: ${err.toString()}`)
        await removeGist(id)
        throw err
    }
}

async function createGist (accessToken, gist, tags) {
    try {
        const data = await github.createGist(gist, accessToken)
        for (let i = 0; i < tags.length; i++) {
            db.tags.updateOne({ _id: tags[i] }, { $inc: { count: 1 } }, { upsert: true })
        }
        data.added_at = Date.now()
        data.tags = tags
        data.type = 'flow'
        return addGist(data)
    } catch (err) {
        console.log('ERROR createGist', err)
        throw err
    }
}

function generateSummary (desc) {
    let summary = (desc || '').split('\n')[0]
    const re = /!?\[(.*?)\]\(.*?\)/g
    let m
    while ((m = re.exec(summary)) !== null) {
        summary = summary.substring(0, m.index) + m[1] + summary.substring(m.index + m[0].length)
    }

    if (summary.length > 150) {
        summary = summary.substring(0, 150).split('\n')[0] + '...'
    }
    return summary
}

async function addGist (data) {
    const originalFiles = data.files
    if (!originalFiles['flow.json']) {
        throw new Error('Missing file flow.json')
    }
    if (originalFiles['flow.json'].truncated) {
        if (originalFiles['flow.json'].size < 300000) {
            originalFiles['flow.json'].content = await github.getGistFile(originalFiles['flow.json'].raw_url)
        } else {
            throw new Error('Flow file too big')
        }
    }
    if (!originalFiles['README.md']) {
        throw new Error('Missing file README.md')
    }
    if (originalFiles['README.md'].truncated) {
        if (originalFiles['README.md'].size < 300000) {
            originalFiles['README.md'].content = await github.getGistFile(originalFiles['README.md'].raw_url)
        } else {
            throw new Error('README file too big')
        }
    }
    data.flow = originalFiles['flow.json'].content
    data.readme = originalFiles['README.md'].content
    data.summary = generateSummary(data.readme)
    delete data.files
    delete data.history
    data.gitOwners = [
        data.owner.login
    ]

    delete data.rateLimit

    data.type = 'flow'
    data.refreshed_at = Date.now()
    data._id = data.id

    await db.flows.replaceOne({ _id: data._id }, data, { upsert: true })

    await users.ensureExists(data.owner.login)

    view.resetTypeCountCache()
    return data.id
}

async function addGistById (id) {
    console.log('Add gist [', id, ']')
    const data = await github.getGist(id)
    data.added_at = Date.now()
    data.tags = []
    view.resetTypeCountCache()
    return addGist(data)
}

async function removeGist (id) {
    const gist = await getGist(id)
    if (gist) {
        const promises = []
        for (let i = 0; i < gist.tags.length; i++) {
            promises.push(db.tags.updateOne({ _id: gist.tags[i] }, { $inc: { count: -1 } }))
        }
        promises.push(db.tags.deleteMany({ count: { $lte: 0 } }))
        await Promise.all(promises)
        await db.flows.deleteOne({ _id: id })
        view.resetTypeCountCache()
    }
}

async function getGists (query) {
    query.type = 'flow'
    return db.flows.find(query, { sort: { refreshed_at: -1 }, projection: { id: 1, description: 1, tags: 1, refreshed_at: 1, 'owner.login': true } }).toArray()
}

async function getGistsForUser (userId) {
    return getGists({ 'owner.login': userId })
}
async function getGistsForTag (tag) {
    return getGists({ tags: tag })
}
async function getAllGists () {
    return getGists({})
}

async function getUser (id) {
    return db.users.findOne({ _id: id })
}

async function updateTags (id, tags) {
    tags = tags || []
    const gist = await getGist(id, { tags: 1, description: 1, 'files.README-md': 1, 'owner.login': 1 })
    if (!gist) {
        const err = new Error('not_found')
        err.code = 404
        throw err
    }

    const oldTags = gist.tags

    if (oldTags.length === tags.length) {
        let matches = true
        for (let i = 0; i < oldTags.length; i++) {
            if (tags.indexOf(oldTags[i]) === -1) {
                matches = false
                break
            }
        }
        if (matches) {
            return
        }
    }
    const promises = []

    for (let i = 0; i < oldTags.length; i++) {
        if (tags.indexOf(oldTags[i]) === -1) {
            promises.push(db.tags.updateOne({ _id: oldTags[i] }, { $inc: { count: -1 } }))
        }
    }
    for (let i = 0; i < tags.length; i++) {
        if (oldTags.indexOf(tags[i]) === -1) {
            promises.push(db.tags.updateOne({ _id: tags[i] }, { $inc: { count: 1 } }, { upsert: true }))
        }
    }
    promises.push(db.tags.deleteMany({ count: { $lte: 0 } }))
    promises.push(db.flows.updateOne({ _id: id }, { $set: { tags } }))
    return Promise.all(promises)
}

async function getTags (query) {
    return db.tags.find(query, { sort: { count: -1, _id: 1 } }).toArray()
}

function getAllTags () {
    return getTags({})
}

module.exports = {
    add: addGistById,
    refresh: refreshGist,
    remove: removeGist,
    updateTags,
    get: getGist,
    getAll: getAllGists,
    getGists,
    getForUser: getGistsForUser,
    getUser,
    create: createGist,
    getAllTags,
    getForTag: getGistsForTag
}

// var repo = "https://gist.github.com/6c3b201624588e243f82.git";
// var sys = require('sys');
// var exec = require('child_process').exec;
// function puts(error, stdout, stderr) { sys.puts(stdout); sys.puts(stderr);  }
// exec("git clone "+repo, puts);
//
