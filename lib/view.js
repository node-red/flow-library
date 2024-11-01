const db = require('./db')
const appUtils = require('./utils')

const defaultProjection = {
    _id: 1,
    name: 1,
    description: 1,
    summary: 1,
    updated_at: 1,
    tags: 1,
    keywords: 1,
    author: 1,
    maintainers: 1,
    gitOwners: 1,
    npmOwners: 1,
    type: 1,
    _rev: 1,
    'dist-tags.latest': 1,
    official: 1,
    downloads: 1,
    rating: 1
}
const summaryProjection = {
    _id: 1,
    summary: 1,
    name: 1,
    updated_at: 1,
    type: 1,
    'dist-tags.latest': 1,
    official: 1,
    rating: 1,
    downloads: 1,
    gitOwners: 1,
    npmOwners: 1
}

const DEFAULT_PER_PAGE = 15

let _typeCounts = null
let _typeCountLastUpdate = 0
const TYPE_COUNT_CACHE_AGE = 1000 * 60 * 10 // 10 minutes

async function getTypeCounts () {
    if (!_typeCounts || (Date.now() - _typeCountLastUpdate > TYPE_COUNT_CACHE_AGE)) {
        const docs = await db.flows.aggregate([
            { $match: { $or: [{ items: { $exists: false } }, { items: { $elemMatch: { $exists: true } } }] } },
            { $group: { _id: '$type', count: { $sum: 1 } } }
        ]).toArray()
        const result = {}
        docs.forEach(function (d) {
            result[d._id] = d.count
        })
        _typeCounts = result
        _typeCountLastUpdate = Date.now()
    }
    return _typeCounts
}

const _typeCache = {}

async function getThingType (id) {
    if (!id) {
        return null
    } else if (_typeCache[id]) {
        return _typeCache[id]
    }
    const docs = await module.exports.get({ _id: id }, null, { type: 1 })
    if (docs.length) {
        _typeCache[id] = docs[0].type
        return docs[0].type
    }
    return null
}

module.exports = {
    // db.getCollection('flows').aggregate([{$group:{_id:"$type",count: {$sum:1}}}])
    getForQuery: async function (query) {
        const sort = query.sort || 'recent'
        const perPage = Number(query.per_page) || DEFAULT_PER_PAGE
        const numPages = Number(query.num_pages) || 1
        const page = Number(query.page) || 1
        const skip = (page - 1) * perPage
        const view = query.view || 'full'

        const findQuery = {}
        const countQuery = {}
        let orderby = {}
        let collectionOwners
        let collectionItems
        if (query.collection) {
            const data = await db.flows.find({ _id: query.collection }).toArray()
            if (!data || data.length === 0) {
                throw new Error('Not found')
            }
            collectionOwners = data[0].gitOwners
            collectionItems = data[0].items || []
        } else {
            let includeCategories = true
            if (query.type) {
                if (typeof query.type === 'string' && query.type !== 'all') {
                    findQuery.type = query.type
                    includeCategories = (findQuery.type === 'node')
                } else if (Array.isArray(query.type)) {
                    if (query.type.length === 1) {
                        findQuery.type = query.type[0]
                        includeCategories = (findQuery.type === 'node')
                    } else if (query.type.length === 2) {
                        findQuery.type = { $in: query.type }
                        includeCategories = query.type.includes('node')
                    }// if length === 0 or 3, that is the same as 'all'
                }
            }
            // const typeNode = !findQuery.type || findQuery.type === 'node' || (Array.isArray(query.type) && query.type.indexOf('node') > -1)
            if (query.username || query.npm_username) {
                findQuery.$or = [{ gitOwners: query.username }, { npmOwners: query.npm_username || query.username }]
                countQuery.$or = findQuery.$or
            } else {
                if (includeCategories && query.category) {
                    const categories = Array.isArray(query.category) ? query.category : [query.category]
                    findQuery.categories = { $in: categories }
                    countQuery.categories = { $in: categories }
                }
                // General search - exclude empty collections
                findQuery.$or = [{ items: { $exists: false } }, { items: { $elemMatch: { $exists: true } } }]
                if (query.term) {
                    // Sanitize the query
                    const regex = new RegExp(query.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
                    findQuery.$and = [
                        { $or: findQuery.$or }, // non-empty collections
                        {
                            $or: [
                                { keywords: regex },
                                { 'owner.login': regex },
                                { _id: regex },
                                { name: regex },
                                { tags: regex },
                                { description: regex },
                                { gitOwners: regex },
                                { npmOwners: regex }
                            ]
                        }
                    ]
                    delete findQuery.$or
                }
            }

            switch (sort) {
            case 'alpha':
                orderby = { name: 1 }
                break
            case 'recent':
                orderby = { updated_at: -1 }
                break
            case 'rating':
                orderby = { rating: -1 }
                break
            case 'downloads':
                orderby = { 'downloads.week': -1 }
                break
            }

            // console.log("findQuery",JSON.stringify(findQuery));
        }
        let proj = defaultProjection
        if (view === 'summary') {
            proj = summaryProjection
        } else if (view === 'counts') {
            // Unused?
            // only counts, no data
            proj = null
        }

        if (collectionItems !== undefined) {
            findQuery._id = countQuery._id = { $in: collectionItems }
        }
        // console.log(JSON.stringify(findQuery));
        let dbQuery = db.flows.find(findQuery, proj)
        if (!query.collection) {
            dbQuery = dbQuery.sort(orderby)
        }
        const foundCount = await db.flows.countDocuments(findQuery)
        if (proj) {
            const docs = await dbQuery.skip(skip).limit(perPage * numPages).toArray()
            if (process.env.FLOW_ENV !== 'PRODUCTION') {
                console.log(findQuery, 'totalCount=' + foundCount, 'thisViewCount=' + docs.length)
            }
            const result = {
                count: foundCount,
                things: docs
            }
            if (collectionItems !== undefined) {
                const resultLookup = {}
                docs.forEach(function (d) {
                    resultLookup[d._id] = d
                })
                result.things = collectionItems.map(function (id) {
                    return resultLookup[id]
                }).slice(skip, skip + (perPage * numPages))
                result.collectionOwners = collectionOwners
            }
            return result
        } else {
            console.log('view.getForQuery called with view=counts')
            console.log(new Error().stack)
            return {
                count: foundCount
            }
        }
    },
    get: async function (query, orderby, proj) {
        query = query || {}
        if (!proj) {
            proj = defaultProjection
        }
        if (!orderby) {
            orderby = { updated_at: -1 }
        }

        const docs = await db.flows.find(query, { projection: proj }).sort(orderby).toArray()
        docs.forEach(function (d) {
            d.updated_formatted = appUtils.formatShortDate(d.updated_at)
        })
        return docs
    },
    getThingType,
    getTypeCounts,
    resetTypeCountCache: function () { _typeCounts = null },
    DEFAULT_PER_PAGE
}
