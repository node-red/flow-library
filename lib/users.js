const db = require('./db')
const github = require('./github')

function extractGitHubInfo (data) {
    return {
        _id: data.login,
        login: data.login,
        avatar_url: data.avatar_url,
        name: data.name,
        bio: data.bio,
        html_url: data.html_url,
        etag: data.etag
    }
}

async function ensureExists (login, userData) {
    const user = await db.users.findOne({ _id: login })
    if (user) {
        return
    }
    if (!userData) {
        userData = await github.getUser(login)
    }
    const userRecord = extractGitHubInfo(userData)
    userRecord.npm_verified = false
    await db.users.insert(userRecord)
}

async function refreshUserGitHub (login) {
    const user = await db.users.findOne({ _id: login })
    if (user) {
        const data = await github.getUser(login)
        const userRecord = extractGitHubInfo(data)
        return update(userRecord)
    }
    throw new Error('User not found')
}

async function get (login) {
    return db.users.findOne({ _id: login })
}
function update (user) {
    return db.users.updateOne(
        { _id: user._id },
        { $set: user }
    )
}

async function checkAllExist (userList) {
    const docs = await db.users.find({ _id: { $in: userList } }, { projection: { _id: 1 } }).toArray()
    const matched = {}
    userList.forEach(u => { matched[u] = true })
    docs.forEach(d => {
        delete matched[d._id]
    })
    return Object.keys(matched)
}
module.exports = {
    get,
    ensureExists,
    update,
    refreshUserGitHub,
    checkAllExist
}
