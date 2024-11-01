const db = require('../lib/db')
const viewster = require('../lib/view')

;(async function () {
    await db.init()
    try {
        const things = await viewster.get({ type: 'node' }, null, {
            _id: 1,
            updated_at: 1,
            'dist-tags.latest': 1,
            official: 1,
            description: 1,
            keywords: 1,
            types: 1,
            categories: 1
        })
        const modules = things.map(function (t) {
            return {
                id: t._id,
                version: t['dist-tags'].latest,
                description: t.description,
                updated_at: t.updated_at,
                types: t.types,
                keywords: t.keywords,
                categories: t.categories,
                url: 'https://flows.nodered.org/node/' + t._id
            }
        })

        console.log('{')
        console.log('   "name": "Node-RED Community catalogue",')
        console.log('   "updated_at": "' + (new Date()).toISOString() + '",')
        console.log('   "modules":')
        console.log(JSON.stringify(modules))
        console.log('}')
    } catch (err) {
        console.log(err)
        process.exitCode = 1
    } finally {
        await db.close()
    }
})()
