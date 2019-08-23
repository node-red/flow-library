const settings = require("../config");
const github = require("./github");
const fs = require("fs-extra");
const path = require("path");
const db = require("./db");
const users = require("./users");

const GIST_DIR = settings.gistDir;

fs.ensureDirSync(GIST_DIR);

function getGist(id,projection) {
    return new Promise((resolve,reject) => {
        projection = projection || {};
        db.flows.findOne({_id:id},projection,function(err,data) {
            if (err||!data) {
                reject();
            } else {
                resolve(data);
            }
        });
    });
}


function refreshGist(id) {
    return new Promise((resolve,reject) => {
        getGist(id,{etag:1,tags:1,added_at:1}).then(function(gist) {
            github.getGist(id,gist.etag).then(function(data) {
                if (data == null) {
                    // no update needed
                    db.flows.update({_id:id},{$set: {refreshed_at:Date.now()}},function(err) {
                        if (err) {
                            console.log(err);
                        }
                        reject(true);
                    });
                } else {
                    var p = path.join(GIST_DIR,id);
                    fs.readdir(p,function(err,files) {
                        if (!err) {
                            for (var i=0;i<files.length;i++) {
                                fs.unlinkSync(path.join(p,files[i]));
                            }
                        }
                        try {
                            fs.rmdirSync(p);
                        } catch(err) {
                        }
                        data.added_at = gist.added_at;
                        data.tags = gist.tags;
                        data.type = "flow";
                        resolve(addGist(data));
                    });
                }
            }).catch(function(err) {
                removeGist(id).then(function() {
                    reject(false);
                });
            });
        }).catch(function() {
            reject(false);
        });

    });
}

function createGist(accessToken,gist,tags) {
    return new Promise((resolve,reject) => {
        github.createGist(gist,accessToken).then(function(data) {
            for (var i=0;i<tags.length;i++) {
                db.tags.update({_id:tags[i]},{$inc:{count:1}},{upsert:true});
            }
            data.added_at = Date.now();
            data.tags = tags;
            data.type = "flow";

            resolve(addGist(data));
        }).catch(function(err) {
            console.log("ERROR",err);
            reject(err);
        });
    });
}

function addGist(data) {
    return new Promise((resolve,reject) => {
        if (!data.files['flow.json']) {
            reject("Missing file flow.json");
            return;
        }
        if (!data.files['README.md']) {
            reject("Missing file README.md");
            return;
        }
        fs.mkdir(path.join(GIST_DIR,data.id),function(err) {
            if (err) {
                reject(err);
            } else {
                var files = {};
                for (var fn in data.files) {
                    var file = data.files[fn];
                    var ffn = path.join(GIST_DIR,data.id,fn);
                    files[fn.replace(/\./g,"-")] = ffn;
                    if (file.truncated) {
                        // HTTP GET file.raw_url -> ffn
                    } else {
                        fs.writeFileSync(ffn,file.content,'utf8');
                    }
                }
                delete data.history;
                data.owner = {
                    login: data.owner.login,
                    avatar_url: data.owner.avatar_url
                }
                delete data.rateLimit;

                data.files = files;
                data.refreshed_at = Date.now();
                data._id = data.id;
                db.flows.save(data,function(err,other) {
                    if (err) {
                        console.log(err,other);
                    }
                });

                users.ensureExists(data.owner.login).then(function() {
                    resolve(data.id);
                }).catch(function() {
                    reject();
                });
            }
        });
    });
}

function addGistById(id) {
    console.log("Add gist [",id,"]");
    return new Promise((resolve,reject) => {
        github.getGist(id).then(function(data) {
            data.added_at = Date.now();
            data.tags = [];
            resolve(addGist(data));
        }).catch(function(err) {
            reject(err);
        });
    });
}

function removeGist(id) {
    return new Promise((resolve,reject) => {
        getGist(id).then(function(gist) {
            for (var i=0;i<gist.tags.length;i++) {
                db.tags.update({_id:gist.tags[i]},{$inc:{count:-1}});
            }
            db.tags.remove({count:{$lte:0}});

            var p = path.join(GIST_DIR,id);
            fs.readdir(p,function(err,files) {
                if (err) {
                    resolve();
                } else {
                    for (var i=0;i<files.length;i++) {
                        fs.unlinkSync(path.join(p,files[i]));
                    }
                    fs.rmdirSync(p);
                    db.flows.remove({id:id});
                    resolve();
                }
            });
        });
    });
}

function getGists(query) {
    return new Promise((resolve,reject) => {
        query.type = "flow";
        db.flows.find({$query:query,$orderby:{refreshed_at:-1}},{id:1,description:1,tags:1,refreshed_at:1,'owner.login':true},function(err,gists) {
            if (err) {
                return reject(err);
            }
            resolve(gists);
        });
    });
}

function getGistsForUser(userId) {
    return getGists({'owner.login':userId});
}
function getGistsForTag(tag) {
    return getGists({tags:tag});
}
function getAllGists() {
    return getGists({});
}

function getUser(id) {
    return new Promise((resolve,reject) => {
        db.users.findOne({_id:id}, function(err,user) {
            if (user == null) {
                reject();
            } else {
                resolve(user);
            }
        });
    });
}


function updateTags(id,tags) {
    tags = tags||[];
    return new Promise((resolve,reject) => {
        getGist(id,{tags:1,description:1,'files.README-md':1,'owner.login':1}).then(function(gist) {
            var oldTags = gist.tags;

            if (oldTags.length == tags.length) {
                var matches = true;
                for (var i=0;i<oldTags.length;i++) {
                    if (tags.indexOf(oldTags[i]) == -1) {
                        matches= false;
                        break;
                    }
                }
                if (matches) {
                    resolve();
                    return;
                }
            }

            for (var i=0;i<oldTags.length;i++) {
                if (tags.indexOf(oldTags[i]) == -1) {
                    db.tags.update({_id:oldTags[i]},{$inc:{count:-1}});
                }
            }
            for (var i=0;i<tags.length;i++) {
                if (oldTags.indexOf(tags[i]) == -1) {
                    db.tags.update({_id:tags[i]},{$inc:{count:1}},{upsert:true});
                }
            }
            db.tags.remove({count:{$lte:0}});

            db.flows.update({_id:id},{$set: {tags:tags}},function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });

        }).catch(function(err) {
            console.log(err);
            reject(err);
        });
    });
}


function getTags(query) {
    return new Promise((resolve,reject) => {
    db.tags.find({$query:query,$orderby:{count:-1,_id:1}},function(err,gists) {
        resolve(gists);
    });

    });
}
function getAllTags() {
    return getTags({});
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
    getAllTags: getAllTags,
    getForTag: getGistsForTag
}

//var repo = "https://gist.github.com/6c3b201624588e243f82.git";
//var sys = require('sys');
//var exec = require('child_process').exec;
//function puts(error, stdout, stderr) { sys.puts(stdout); sys.puts(stderr);  }
//exec("git clone "+repo, puts);
//
