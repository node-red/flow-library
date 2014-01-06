var settings = require("../settings");
var github = require("./github");

var when = require("when");
var fs = require("fs");
var path = require("path");

var mongojs = require('mongojs');

var db = mongojs(settings.mongo.url,["flows","users","tags"]);

var GIST_DIR = path.join(__dirname,"..","gists");

if (!fs.existsSync(GIST_DIR)) {
    fs.mkdirSync(GIST_DIR);
}

function getGist(id) {
    var defer = when.defer();
    db.flows.findOne({_id:id},function(err,data) {
        if (err||!data) {
            defer.reject();
        } else {
            defer.resolve(data);
        }
    });
    return defer.promise;
}


function refreshGist(id) {
    var defer = when.defer();
    getGist(id).then(function(gist) {
        github.getGist(id,gist.etag).then(function(data) {
            if (data == null) {
                // no update needed
                db.flows.update({_id:id},{$set: {refreshed_at:Date.now()}},function(err) {
                    if (err) {
                        console.log(err);
                    }
                    defer.reject(true);
                });
            } else {
                var p = path.join(GIST_DIR,id);
                fs.readdir(p,function(err,files) {
                    for (var i=0;i<files.length;i++) {
                        fs.unlinkSync(path.join(p,files[i]));
                    }
                    fs.rmdirSync(p);
                    defer.resolve(addGist(data,gist.tags));
                });
            }
        }).otherwise(function(err) {
            removeGist(id).then(function() {
                defer.reject(false);
            });
        });
    }).otherwise(function() {
        defer.reject(false);
    });
    
    return defer.promise;
}

function ensureUserExists(login) {
    var defer = when.defer();
    console.log("ensureUserExists:",login);
    db.users.findOne({_id:login},function(err,user) {
        if (user) {
            console.log(" - exists");
            defer.resolve();
        } else {
            console.log(" - not found");
            github.getUser(login).then(function(data) {
                data._id = data.login;
                db.users.save(data);
                defer.resolve();
            }).otherwise(function(err) {
                defer.reject(err);
            });
        }
    });
    return defer.promise;
}

function createGist(accessToken,gist,tags) {
    var defer = when.defer();
    github.createGist(gist,accessToken).then(function(data) {
        for (var i=0;i<tags.length;i++) {
            db.tags.update({_id:tags[i]},{$inc:{count:1}},{upsert:true});
        }
        data.added_at = Date.now();
        defer.resolve(addGist(data,tags));
    }).otherwise(function(err) {
        console.log("ERROR",err);
        defer.reject(err);
    });
    return defer.promise;
}

function addGist(data,tags) {
    var defer = when.defer();
    if (!data.files['flow.json']) {
        defer.reject("Missing file flow.json");
        return;
    }
    if (!data.files['README.md']) {
        defer.reject("Missing file README.md");
        return;
    }
    fs.mkdir(path.join(GIST_DIR,data.id),function(err) {
        if (err) {
            defer.reject(err);
        } else {
            var files = {};
            for (var fn in data.files) {
                var file = data.files[fn];
                var ffn = path.join(GIST_DIR,data.id,fn);  
                files[fn.replace(/\./g,"-")] = ffn;
                fs.writeFileSync(ffn,file.content,'utf8');
            }
            data.files = files;
            data.refreshed_at = Date.now();
            data._id = data.id;
            data.tags = tags||[];
            db.flows.save(data,function(err,other) {
                if (err) {
                    console.log(err,other);
                }
            });
            ensureUserExists(data.owner.login).then(function() {
                defer.resolve(data.id);
            }).otherwise(function() {
                defer.reject();
            });
        }
    });
    return defer.promise;
}

function addGistById(id) {
    console.log("Add gist [",id,"]");
    var defer = when.defer();
    github.getGist(id).then(function(data) {
        data.added_at = Date.now();
        defer.resolve(addGist(data,[]));
    }).otherwise(function(err) {
        defer.reject(err);
    });
    return defer.promise;
}

function removeGist(id) {
    var defer = when.defer();
    getGist(id).then(function(gist) {
        for (var i=0;i<gist.tags.length;i++) {
            db.tags.update({_id:gist.tags[i]},{$inc:{count:-1}});
        }
        db.tags.remove({count:{$lte:0}});

        var p = path.join(GIST_DIR,id);
        fs.readdir(p,function(err,files) {
            if (err) { 
                defer.resolve();
            } else {
                for (var i=0;i<files.length;i++) {
                    fs.unlinkSync(path.join(p,files[i]));
                }
                fs.rmdirSync(p);
                db.flows.remove({id:id});
                defer.resolve();
            }
        });
    });
    return defer.promise;
}

function getGistsForUser(userId) {
    var defer = when.defer();
    db.flows.find({'owner.login':userId},{id:1,description:1,'owner.login':true}, function(err,gists) {
        defer.resolve(gists);
    });
    return defer.promise;
}
function getGists(query) {
    var defer = when.defer();
    db.flows.find({$query:query,$orderby:{added_at:-1}},{id:1,description:1,'owner.login':true},function(err,gists) {
        defer.resolve(gists);
    });
    
    return defer.promise;
}

function getAllGists() {
    return getGists({});
}

function getUser(id) {
    var defer = when.defer();
    db.users.findOne({_id:id}, function(err,user) {
        if (user == null) {
            defer.reject();
        } else {
            defer.resolve(user);
        }
    });
    return defer.promise;
}


function updateTags(id,tags) {
    tags = tags||[];
    var defer = when.defer();
    getGist(id).then(function(gist) {
        var oldTags = gist.tags;
        
        for (var i=0;i<oldTags.length;i++) {
            if (tags.indexOf(oldTags[i]) == -1) {
                db.tags.update({_id:oldTags[i]},{$inc:{count:-1}});
            }
        }
        for (var i=0;i<tags.length;i++) {
            if (oldTags.indexOf(tags[i]) == -1) {
                db.tags.insert({_id:tags[i], count:1});
            }
        }
        db.tags.remove({count:{$lte:0}});

        db.flows.update({_id:id},{$set: {tags:tags}},function(err) {
            if (err) {
                defer.reject(err);
            } else {
                defer.resolve();
            }
        });
    }).otherwise(function(err) {
        console.log(err);
        defer.reject(err);
    });
    return defer.promise;
}
    
module.exports = {
    add: addGistById,
    refresh: refreshGist,
    remove: removeGist,
    updateTags: updateTags,
    get: getGist,
    getAll: getAllGists,
    getGists: getGists,
    getForUser: getGistsForUser,
    getUser: getUser,
    create: createGist,
}

//var repo = "https://gist.github.com/6c3b201624588e243f82.git";
//var sys = require('sys');
//var exec = require('child_process').exec;
//function puts(error, stdout, stderr) { sys.puts(stdout); sys.puts(stderr);  }
//exec("git clone "+repo, puts);
//


