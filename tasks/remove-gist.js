const db = require('../lib/db')
const gists = require('../lib/gists')

const id = process.argv[2]

if (!id) {
    console.log('Usage: node remove-gist.js <id>')
    process.exitCode = 1
    return
}

;(async function () {
    await db.init()
    try {
        await gists.remove(id)
    } catch (err) {
        console.log('Failed', err)
    }
    await db.close()
})()
