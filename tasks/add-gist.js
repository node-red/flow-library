const db = require('../lib/db')
const gists = require('../lib/gists')
const id = process.argv[2]

if (!id) {
    console.log('Usage: node add-gist.js <id>')
    process.exitCode = 1
    return
}

;(async function () {
    try {
        await gists.add(id)
        console.log('Success')
    } catch (err) {
        console.log(err)
    } finally {
        db.close()
    }
})()
