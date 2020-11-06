const https = require("https");
const settings = require("../config");
const defaultAccessToken = settings.github.accessToken;

function send(opts) {
    return new Promise((resolve, reject) => {
        var accessToken = opts.accessToken || defaultAccessToken;
        var method = (opts.method||"GET").toUpperCase();
        var path = opts.path;
        var headers = opts.headers || {};
        var body = opts.body;

        var _headers = {
            "user-agent": "node-red",
            "accept": "application/vnd.github.v3",
            "authorization": "token "+accessToken
        }
        if (body) {
            _headers['content-type'] = "application/json";
        }
        for (var h in headers) {
            _headers[h] = headers[h];
        }
        var options = {
            host: "api.github.com",
            port: 443,
            path: path,
            method: method,
            headers: _headers
        }
        //console.log("---------------");
        //console.log(options);
        //console.log("---------------");
        var req = https.request(options,function(res) {
            res.setEncoding("utf8");
            var data = "";
            res.on("data", function(chunk) {
                data += chunk;
            });
            res.on("end", function() {
                if (/^application\/json/.test(res.headers['content-type'])) {
                    data = JSON.parse(data);
                    data.etag = res.headers['etag'];
                    data.rateLimit = {
                        limit: res.headers['x-ratelimit-limit'],
                        remaining: res.headers['x-ratelimit-remaining'],
                        reset: res.headers['x-ratelimit-reset']
                    };
                }
                resolve({statusCode:res.statusCode,headers:res.headers,data:data});
            });
        });
        req.on("error", function(e) {
            console.log("problem with request: " + e.message);
            reject(e);
        });

        if (body) {
            req.write(JSON.stringify(body)+"\n");
        }
        req.end();
    });
}

function getSimple(path,lastEtag) {
    return new Promise((resolve,reject) => {
        var headers = {};
        if (lastEtag) {
            headers['If-None-Match'] = lastEtag;
        }
        send({path:path,headers:headers}).then(function(result) {
            if (lastEtag && result.statusCode == 304) {
                resolve(null);
            } else if (result.statusCode == 404) {
                reject(result);
            } else {
                resolve(result.data);
            }
        }).catch(function(er) { reject(er); });
    });
}

module.exports = {
    getAuthedUser: function(accessToken) {
        return new Promise((resolve,reject) => {
            send({path:"/user",accessToken:accessToken}).then(function(result) {
                resolve(result.data);
            }).catch(function(er) { reject(er); });
        });
    },
    getUser: function(user,lastEtag) {
        return getSimple("/users/"+user,lastEtag);
    },

    getGist: function(id,lastEtag) {
        return getSimple("/gists/"+id,lastEtag);
    },

    createGist: function(gistData,accessToken) {
        return new Promise((resolve,reject) => {
            send({path:"/gists",method:"POST",body:gistData,accessToken:accessToken}).then(function(result) {
                resolve(result.data);
            }).catch(function(er) { reject(er); });
        });
    },

    starGist: function(id,accessToken) {
        return new Promise((resolve,reject) => {
            send({path:"/gists/"+id+"/star",method:"PUT"}).then(function(result) {
                if (result.statusCode == 204) {
                    resolve();
                } else {
                    reject();
                }
            }).catch(function(er) { reject(er); });
        });
    },

    unstarGist: function(id,accessToken) {
        return new Promise((resolve,reject) => {
            send({path:"/gists/"+id+"/star",method:"DELETE"}).then(function(result) {
                if (result.statusCode == 204) {
                    resolve();
                } else {
                    reject();
                }
            }).catch(function(er) { reject(er); });
        });
    },

    isGistStarred: function(id,accessToken) {
        return new Promise((resolve,reject) => {
            send({path:"/gists/"+id+"/star",method:"GET"}).then(function(result) {
                if (result.statusCode == 204) {
                    resolve(true);
                } else {
                    reject(false);
                }
            }).catch(function(er) { reject(er); });
        });
    }

}
