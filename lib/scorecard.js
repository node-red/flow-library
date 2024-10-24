const crypto = require('crypto')

const fs = require('fs-extra')
const nodereddev = require('node-red-dev')

const events = require('./events')
const npmNodes = require('./nodes')

function scorecard (packagename, version, nodePath) {
    const fileid = crypto.randomBytes(4).toString('hex')
    console.log('Running scorecard', packagename, version, nodePath)
    try {
        const pkg = fs.readJsonSync(nodePath + '/package.json')
        console.log(' - Scorecard package.json:', pkg.name, pkg.version)
    } catch (err) {
        console.log(' - Error checking packaging:', err)
    }
    nodereddev.run(['validate', '-p', nodePath, '-o', `${nodePath}/../${fileid}.json`, '-e', 'true'])
        // eslint-disable-next-line n/no-extraneous-require
        .then(require('@oclif/command/flush'))
        .then(() => {
            const card = fs.readJsonSync(`${nodePath}/../${fileid}.json`)
            return npmNodes.update(packagename, { scorecard: card }).then(() => card)
        }).then((card) => {
        // fs.removeSync(nodePath+'/../..');
            let message = 'Result: '

            const keys = Object.keys(card)
            keys.sort(function (A, B) {
                if (A[0] !== B[0]) {
                // Reverse order of the groups - P, N, D
                    return B.localeCompare(A)
                } else {
                // Numerical order within the group
                    return A.substring(1).localeCompare(B.substring(1))
                }
            })

            for (const rule of keys) {
                if (rule !== 'package') {
                    const result = card[rule]
                    if (result.test) {
                        message += ':white_check_mark: '
                    } else {
                        if (['P01', 'P04', 'P05', 'D02'].includes(rule)) {
                            message += ':x: '
                        } else {
                            message += ':warning: '
                        }
                    }
                }
            }
            events.add({
                action: 'scorecard_added',
                module: packagename,
                version,
                message
            })
            return null
        })
        .catch((error) => {
            console.log(error.message)
            events.add({
                action: 'scorecard_failed',
                module: packagename,
                version,
                message: error.message
            })
        // fs.removeSync(nodePath+'/../..');
        })
}

module.exports = {
    scorecard
}
