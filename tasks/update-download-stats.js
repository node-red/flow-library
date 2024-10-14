const db = require('../lib/db')
const npmModules = require('../lib/modules')
const npmNodes = require('../lib/nodes')

;(async function () {
    await db.init()
    try {
        await npmModules.refreshDownloads()
    } catch (err) {
        console.log(err)
    } finally {
        await npmNodes.close()
    }
})()
