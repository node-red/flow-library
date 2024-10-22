const db = require('../lib/db')
const npmModules = require('../lib/modules')
const npmNodes = require('../lib/nodes')
const name = process.argv[2]

if (!name) {
    console.log('Usage: node update-one.js <module>')
    process.exitCode = 1
    return
}
;(async function () {
    await db.init()
    const results = await npmModules.refreshModule(name)
    results.forEach(function (res) {
        if (res.state === 'rejected') {
            console.log('Failed:', res.reason)
        } else if (res.value) {
            console.log(res.value)
        } else {
            console.log('Nothing to do', res)
        }
    })
    npmNodes.close()
})()
