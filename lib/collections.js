const crypto = require('crypto')

const db = require('./db')
const users = require('./users')
const view = require('./view')

async function createCollection (collection) {
    const collectionID = crypto.randomBytes(9).toString('base64').replace(/\//g, '-').replace(/\+/g, '_')
    const tags = collection.tags || []
    for (let i = 0; i < tags.length; i++) {
        await db.tags.updateOne({ _id: tags[i] }, { $inc: { count: 1 } }, { upsert: true })
    }
    collection.type = 'collection'
    collection._id = collectionID
    collection.updated_at = (new Date()).toISOString()
    collection.summary = generateSummary(collection.description)
    try {
        await db.flows.replaceOne({ _id: collectionID }, collection, { upsert: true })
    } finally {
        view.resetTypeCountCache()
    }
    return collectionID
}

async function removeCollection (id) {
    const collection = await getCollection(id)
    const tags = collection.tags || []
    const promises = []
    for (let i = 0; i < tags.length; i++) {
        promises.push(db.tags.updateOne({ _id: tags[i] }, { $inc: { count: -1 } }))
    }
    promises.push(db.tags.deleteMany({ count: { $lte: 0 } }))
    await Promise.all(promises)
    try {
        await db.flows.deleteOne({ _id: id })
    } finally {
        view.resetTypeCountCache()
    }
}

async function getCollection (id) {
    const data = await db.flows.find({ _id: id }).toArray()
    if (!data || data.length === 0) {
        throw new Error(`Collection ${id} not found`)
    }
    return data[0]
}

function generateSummary (desc) {
    let summary = (desc || '').split('\n')[0]
    const re = /\[(.*?)\]\(.*?\)/g
    let m
    while ((m = re.exec(summary)) !== null) {
        summary = summary.substring(0, m.index) + m[1] + summary.substring(m.index + m[0].length)
    }

    if (summary.length > 150) {
        summary = summary.substring(0, 150).split('\n')[0] + '...'
    }
    return summary
}

async function updateCollection (collection) {
    delete collection.type
    collection.updated_at = (new Date()).toISOString()
    const errors = {}
    if (Object.prototype.hasOwnProperty.call(collection, 'name')) {
        if (collection.name.trim().length < 10) {
            errors.name = 'Must be at least 10 characters'
        }
    }
    if (Object.prototype.hasOwnProperty.call(collection, 'description')) {
        if (collection.description.trim().length < 30) {
            errors.description = 'Must be at least 30 characters'
        }
        collection.summary = generateSummary(collection.description)
    }
    if (Object.prototype.hasOwnProperty.call(collection, 'gitOwners')) {
        const unmatched = await users.checkAllExist(collection.gitOwners)
        if (unmatched && unmatched.length > 0) {
            errors.owners = unmatched
        }
    }
    if (Object.keys(errors).length > 0) {
        throw errors
    }
    try {
        await db.flows.updateOne(
            { _id: collection._id },
            { $set: collection }
        )
    } catch (err) {
        console.log('Update collection', collection._id, 'ERR', err.toString())
        throw err
    }
    return collection._id
}

async function addItem (collectionId, itemId) {
    try {
        await db.flows.updateOne(
            { _id: collectionId },
            { $addToSet: { items: itemId } }
        )
    } catch (err) {
        console.log('Adding collection item', collectionId, itemId, 'ERR', err.toString())
        throw err
    }
    return collectionId
}

async function removeItem (collectionId, itemId) {
    try {
        await db.flows.updateOne(
            { _id: collectionId },
            { $pull: { items: itemId } }
        )
    } catch (err) {
        console.log('Remove collection item', collectionId, itemId, 'ERR', err.toString())
        throw err
    }
    return collectionId
}

async function getSiblings (collectionId, itemId) {
    const docs = db.flows.aggregate([
        { $match: { _id: collectionId } },
        {
            $project: {
                name: 1,
                items: 1,
                index: { $indexOfArray: ['$items', itemId] }
            }
        },
        {
            $project: {
                name: 1,
                items: 1,
                prevIndex: { $subtract: ['$index', 1] },
                nextIndex: { $add: ['$index', 1] }
            }
        },
        {
            $project: {
                name: 1,
                prev: { $cond: { if: { $gte: ['$prevIndex', 0] }, then: { $arrayElemAt: ['$items', '$prevIndex'] }, else: '' } },
                next: { $arrayElemAt: ['$items', '$nextIndex'] }
            }
        }
    ]).toArray()

    if (docs && docs.length > 0) {
        docs[0].prevType = await view.getThingType(docs[0].prev)
        docs[0].nextType = await view.getThingType(docs[0].next)
    } else {
        return docs
    }
}

module.exports = {
    get: getCollection,
    update: updateCollection,
    remove: removeCollection,
    create: createCollection,
    addItem,
    removeItem,
    getSiblings
}
