const { MongoClient } = require('mongodb')

const settings = require('../config')

const api = {
    init
}

async function init () {
    const collections = ['flows', 'nodes', 'users', 'tags', 'events', 'ratings']
    const client = new MongoClient(settings.mongo.url)
    await client.connect()
    const db = client.db()
    await db.command({ ping: 1 })

    api.close = async function () {
        return client.close()
    }

    collections.forEach(col => {
        api[col] = db[col] = db.collection(col)
    })
    console.log('Creating indexes')
    await db.flows.createIndex({ updated_at: -1 })
    await db.flows.createIndex({ keywords: 1 })
    await db.flows.createIndex({ 'maintainers.name': 1 })
    await db.flows.createIndex({ npmOwners: 1 })
    await db.flows.createIndex({ gitOwners: 1 })
    await db.flows.createIndex({ 'rating.score': -1, 'rating.count': -1 })
    await db.flows.createIndex({ 'downloads.week': -1 })

    await db.ratings.createIndex({ module: 1 })
    await db.ratings.createIndex({ user: 1, module: 1 })
    console.log('Done indexing')
}

// if (process.env.FLOW_ENV !== "PRODUCTION") {
//     collections.forEach(col => {
//         var collection = db[col];
//         for (var x in collection) {
//             if (typeof collection[x] === 'function' && !/^_/.test(x)) {
//                 db[col]["__"+x] = db[col][x];
//                 let origFunc = db[col][x];
//                 let signature = col+"."+x;
//                 db[col][x] = function() {
//                     console.log(" ",signature);//arguments[0]);
//                     return origFunc.apply(db[col],arguments);
//                 }
//             }
//         }
//     })
// }

module.exports = api
