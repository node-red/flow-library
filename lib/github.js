const https = require('https')

const settings = require('../config')
const defaultAccessToken = settings.github.accessToken

function send (opts) {
    return new Promise((resolve, reject) => {
        const accessToken = opts.accessToken || defaultAccessToken
        const method = (opts.method || 'GET').toUpperCase()
        const path = opts.path
        const headers = opts.headers || {}
        const body = opts.body

        const _headers = {
            'user-agent': 'node-red',
            accept: 'application/vnd.github.v3',
            authorization: 'token ' + accessToken
        }
        if (body) {
            _headers['content-type'] = 'application/json'
        }
        for (const h in headers) {
            _headers[h] = headers[h]
        }
        const options = {
            host: 'api.github.com',
            port: 443,
            path,
            method,
            headers: _headers
        }
        // console.log("---------------");
        // console.log(options);
        // console.log("---------------");
        const req = https.request(options, function (res) {
            res.setEncoding('utf8')
            let data = ''
            res.on('data', function (chunk) {
                data += chunk
            })
            res.on('end', function () {
                if (/^application\/json/.test(res.headers['content-type'])) {
                    data = JSON.parse(data)
                    data.etag = res.headers.etag
                    data.rateLimit = {
                        limit: res.headers['x-ratelimit-limit'],
                        remaining: res.headers['x-ratelimit-remaining'],
                        reset: res.headers['x-ratelimit-reset']
                    }
                }
                resolve({ statusCode: res.statusCode, headers: res.headers, data })
            })
        })
        req.on('error', function (e) {
            console.log('problem with request: ' + e.message)
            reject(e)
        })

        if (body) {
            req.write(JSON.stringify(body) + '\n')
        }
        req.end()
    })
}

function getSimple (path, lastEtag) {
    return new Promise((resolve, reject) => {
        const headers = {}
        if (lastEtag) {
            headers['If-None-Match'] = lastEtag
        }
        console.log('github.getSimple', path)
        send({ path, headers }).then(function (result) {
            if (lastEtag && result.statusCode === 304) {
                resolve(null)
                return null
            } else if (result.statusCode === 404) {
                reject(result)
                return null
            } else {
                resolve(result.data)
                return null
            }
        }).catch(function (er) { reject(er) })
    })
}

function getGistFile (fileUrl) {
    return new Promise((resolve, reject) => {
        const req = https.get(fileUrl, function (res) {
            res.setEncoding('utf8')
            let data = ''
            res.on('data', function (chunk) {
                data += chunk
            })
            res.on('end', function () {
                resolve(data)
            })
        })
        req.on('error', function (e) {
            console.log('problem with request: ' + e.message)
            reject(e)
        })
        req.end()
    })
}

module.exports = {
    getGistFile,
    getAuthedUser: function (accessToken) {
        return new Promise((resolve, reject) => {
            send({ path: '/user', accessToken }).then(function (result) {
                resolve(result.data)
                return null
            }).catch(function (er) { reject(er) })
        })
    },
    getUser: function (user, lastEtag) {
        return getSimple('/users/' + user, lastEtag)
    },

    getGist: function (id, lastEtag) {
        return getSimple('/gists/' + id, lastEtag)
    },

    createGist: function (gistData, accessToken) {
        return new Promise((resolve, reject) => {
            send({ path: '/gists', method: 'POST', body: gistData, accessToken }).then(function (result) {
                resolve(result.data)
                return null
            }).catch(function (er) { reject(er) })
        })
    }
}
