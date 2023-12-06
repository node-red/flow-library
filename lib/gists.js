const util = require("util")
const settings = require("../config");
const github = require("./github");
const db = require("./db");
const users = require("./users");
const view = require("./view")

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
    util.log(`Request to refresh gist ${id}`)
    return new Promise((resolve,reject) => {
        getGist(id,{etag:1,tags:1,added_at:1}).then(function(gist) {
            const etag = process.env.FORCE_UPDATE? null:gist.etag;
            util.log(` - using etag ${etag}`)
            github.getGist(id,etag).then(function(data) {
                if (data == null) {
                    util.log(` - github returned null`)
                    // no update needed
                    db.flows.update({_id:id},{$set: {refreshed_at:Date.now()}},function(err) {
                        if (err) {
                            console.log(err);
                        }
                        reject(true);
                    });
                } else {
                    data.added_at = gist.added_at;
                    data.tags = gist.tags;
                    data.type = "flow";
                    resolve(addGist(data));
                }
            }).catch(function(err) {
                util.log(` - error during refresh - removing gist: ${err.toString()}`)
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

function generateSummary(desc) {
    var summary = (desc||"").split("\n")[0];
    var re = /!?\[(.*?)\]\(.*?\)/g;
    var m;
    while((m=re.exec(summary)) !== null) {
        summary = summary.substring(0,m.index)+m[1]+summary.substring(m.index+m[0].length);
    }

    if (summary.length > 150) {
        summary = summary.substring(0,150).split("\n")[0]+"...";
    }
    return summary;
}

async function addGist(data) {
    var originalFiles = data.files;
    if (!originalFiles['flow.json']) {
        throw new Error("Missing file flow.json");
    }
    if (originalFiles['flow.json'].truncated) {
        if (originalFiles['flow.json'].size < 300000) {
            originalFiles['flow.json'].content = await github.getGistFile(originalFiles['flow.json'].raw_url)
        } else {
            throw new Error("Flow file too big");
        }
    }
    if (!originalFiles['README.md']) {
        throw new Error("Missing file README.md");
    }
    if (originalFiles['README.md'].truncated) {
        if (originalFiles['README.md'].size < 300000) {
            originalFiles['README.md'].content = await github.getGistFile(originalFiles['README.md'].raw_url)
        } else {
            throw new Error("README file too big");
        }
    }
    data.flow = originalFiles['flow.json'].content;
    data.readme = originalFiles['README.md'].content;
    data.summary = generateSummary(data.readme);
    delete data.files;
    delete data.history;
    data.gitOwners = [
        data.owner.login
    ]

    delete data.rateLimit;

    data.type = "flow";
    data.refreshed_at = Date.now();
    data._id = data.id;

    db.flows.save(data,function(err,other) {
        if (err) {
            console.log(err,other);
            return;
        }
    });

    return users.ensureExists(data.owner.login).then(function() {
        view.resetTypeCountCache();
        return data.id;
    });
}

async function addGistById(id) {
    console.log("Add gist [",id,"]");
    return github.getGist(id).then(function(data) {
        data.added_at = Date.now();
        data.tags = [];
        view.resetTypeCountCache();
        return addGist(data);
    });
}

function removeGist(id) {
    return new Promise((resolve,reject) => {
        getGist(id).then(function(gist) {
            for (var i=0;i<gist.tags.length;i++) {
                db.tags.update({_id:gist.tags[i]},{$inc:{count:-1}});
            }
            db.tags.remove({count:{$lte:0}});
            db.flows.remove({id:id}, function(err) {
                view.resetTypeCountCache();
                resolve();
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
