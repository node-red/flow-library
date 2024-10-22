const db = require('../lib/db')
const gists = require('../lib/gists')

const id = process.argv[2]

if (!id) {
    console.log('Usage: node refresh-gist.js <id>')
    process.exitCode = 1
    return
}

;(async function () {
    await db.init()
    try {
        const result = await gists.refresh(id)
        if (result === null) {
            console.log('No update needed')
        } else {
            console.log('Updated')
        }
    } catch (err) {
        console.log(err)
    }
    await db.close()
})()
