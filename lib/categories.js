const db = require('./db')
const { generateSummary } = require('./utils')

// Given they are largely static and there are not many, we can cache the category list
// to save hitting the DB for every page view
let categoryCache

async function refreshCategoryCache () {
    categoryCache = await db.categories.find().toArray()
    categoryCache.sort((a, b) => a.name.localeCompare(b.name))
}

function normaliseName (name) {
    return name.toLowerCase().replace(/[ /]+/g, '-').replace(/&/g, 'and')
}

async function createCategory (category) {
    category._id = normaliseName(category.name)
    category.updated_at = (new Date()).toISOString()
    category.summary = generateSummary(category.description)
    await db.categories.insertOne(category, { upsert: true })
    await refreshCategoryCache()
    return category._id
}

// async function removeCollection (id) {
//     const collection = await getCollection(id)
//     const tags = collection.tags || []
//     const promises = []
//     for (let i = 0; i < tags.length; i++) {
//         promises.push(db.tags.updateOne({ _id: tags[i] }, { $inc: { count: -1 } }))
//     }
//     promises.push(db.tags.deleteMany({ count: { $lte: 0 } }))
//     await Promise.all(promises)
//     try {
//         await db.flows.deleteOne({ _id: id })
//     } finally {
//         view.resetTypeCountCache()
//     }
// }

async function getCategories () {
    if (!categoryCache) {
        await refreshCategoryCache()
    }
    return categoryCache
}
async function getCategory (id) {
    const data = await db.categories.find({ _id: id }).toArray()
    if (!data || data.length === 0) {
        throw new Error(`Category ${id} not found`)
    }
    return data[0]
}

async function updateCategory (category) {
    category.updated_at = (new Date()).toISOString()
    if (Object.prototype.hasOwnProperty.call(category, 'description')) {
        category.summary = generateSummary(category.description)
    }
    try {
        await db.categories.updateOne(
            { _id: category._id },
            { $set: category }
        )
    } catch (err) {
        console.log('Update category', category._id, 'ERR', err.toString())
        throw err
    }
    await refreshCategoryCache()
    return category._id
}

module.exports = {
    getAll: getCategories,
    create: createCategory,
    get: getCategory,
    update: updateCategory
}
