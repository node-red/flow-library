const request = require('request')

const settings = require('../config')

const db = require('./db')

const icons = {
    module_report: ':warning: Report submitted: ',
    update: ':rocket: Updated: ',
    refresh_requested: ':mag: Refresh requested: ',
    error: ':boom: Error: ',
    reject: ':-1: Rejected module: ',
    remove: ':wastebasket: Removed module: ',
    started: ':coffee: Flow Library restarted',
    scorecard_added: ':clipboard: Scorecard: ',
    scorecard_failed: ':warning: Scorecard failed: '
}
const colors = {
    module_report: 'warning',
    update: 'good',
    refresh_requested: 'good',
    error: 'danger',
    reject: 'danger',
    remove: 'danger',
    scorecard_added: 'good',
    scorecard_failed: 'danger'

}

async function addEvent (event) {
    event.ts = Date.now()
    // console.log(JSON.stringify(event));
    try {
        await db.events.insertOne(event)
    } catch (err) {
        console.error('Error adding event', err.toString())
    }
    if (settings.slack && settings.slack.webhook) {
        try {
            let msg = icons[event.action] || ''

            if (event.module) {
                if (event.action === 'scorecard_added') {
                    msg += ' <http://flows.nodered.org/node/' + event.module + '/scorecard|' + event.module + '>'
                } else {
                    msg += ' <http://flows.nodered.org/node/' + event.module + '|' + event.module + '>'
                }
            } else if (event.action !== 'started') {
                msg = 'Flow library error'
            }

            if (event.version) {
                msg += ' (' + event.version + ')'
            }
            if (event.user) {
                msg += '   User: ' + '<http://github.com/' + event.user + '|' + event.user + '>'
            }
            const json = {
                attachments: [
                    {
                        color: colors[event.action] || '#999999',
                        fallback: msg,
                        pretext: msg,
                        fields: []
                    }
                ]
            }

            if (Object.prototype.hasOwnProperty.call(event, 'message') && event.action !== 'started') {
                json.attachments[0].text = ('' + event.message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            }
            const options = {
                url: settings.slack.webhook,
                method: 'POST',
                json
            }
            request(options, function (error, resp, body) {
                if (error) {
                    console.log(error)
                }
            })
        } catch (err2) {
            console.log(err2)
        }
    } else {
        console.log('Event:', JSON.stringify(event))
    }
}

async function getEvents () {
    // Return last 50 events...
    const docs = await db.events.find({}).sort({ ts: -1 }).limit(50).toArray()
    docs.forEach(d => {
        d.time = (new Date(d.ts)).toISOString()
    })
}

module.exports = {
    add: addEvent,
    get: getEvents
}
