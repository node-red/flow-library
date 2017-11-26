var when = require("when");
var https = require("https");
var settings = require("../config");

var defaultAccessToken = settings.github.accessToken;

function send(opts) {
    var defer = when.defer();
    
    var accessToken = opts.accessToken || defaultAccessToken;
    var method = (opts.method||"GET").toUpperCase();
    var path = opts.path;
    var headers = opts.headers || {};
    var body = opts.body;
    
    var _headers = {
        "user-agent": "node-red",
        "accept": "application/vnd.github.v3"
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
        path: path+'?access_token='+encodeURIComponent(accessToken),
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
                defer.resolve({statusCode:res.statusCode,headers:res.headers,data:data});
            });
    });
    req.on("error", function(e) {
            console.log("problem with request: " + e.message);
            defer.reject(e);
    });

    if (body) {
        req.write(JSON.stringify(body)+"\n");
    }
    req.end();
    
    return defer.promise;
}

function getSimple(path,lastEtag) {
    var defer = when.defer();
    var headers = {};
    if (lastEtag) {
        headers['If-None-Match'] = lastEtag;
    }
    send({path:path,headers:headers}).then(function(result) {
        if (lastEtag && result.statusCode == 304) {
            defer.resolve(null);
        } else if (result.statusCode == 404) {
            defer.reject(result);
        } else {
            defer.resolve(result.data);
        }
    }).otherwise(function(er) { defer.reject(er); });
    return defer.promise;
}

module.exports = {
    getAuthedUser: function(accessToken) {
        var defer = when.defer();
        send({path:"/user",accessToken:accessToken}).then(function(result) {
            defer.resolve(result.data);
        }).otherwise(function(er) { defer.reject(er); });
        return defer.promise;
    },
    getUser: function(user,lastEtag) {
        return getSimple("/users/"+user,lastEtag);
    },
    
    getGist: function(id,lastEtag) {
        return getSimple("/gists/"+id,lastEtag);
    },
    
    createGist: function(gistData,accessToken) {
        var defer = when.defer();
        send({path:"/gists",method:"POST",body:gistData,accessToken:accessToken}).then(function(result) {
            defer.resolve(result.data);
        }).otherwise(function(er) { defer.reject(er); });
        return defer.promise;        
    },
    
    starGist: function(id,accessToken) {
        var defer = when.defer();
        send({path:"/gists/"+id+"/star",method:"PUT"}).then(function(result) {
            if (result.statusCode == 204) {
                defer.resolve();
            } else {
                defer.reject();
            }
        }).otherwise(function(er) { defer.reject(er); });
        return defer.promise;        
    },
    
    unstarGist: function(id,accessToken) {
        var defer = when.defer();
        send({path:"/gists/"+id+"/star",method:"DELETE"}).then(function(result) {
            if (result.statusCode == 204) {
                defer.resolve();
            } else {
                defer.reject();
            }
        }).otherwise(function(er) { defer.reject(er); });
        return defer.promise;        
    },
    
    isGistStarred: function(id,accessToken) {
        var defer = when.defer();
        send({path:"/gists/"+id+"/star",method:"GET"}).then(function(result) {
            if (result.statusCode == 204) {
                defer.resolve(true);
            } else {
                defer.reject(false);
            }
        }).otherwise(function(er) { defer.reject(er); });
        return defer.promise;        
    }

}
