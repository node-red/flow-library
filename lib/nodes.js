var settings = require("../config");
var mongojs = require('mongojs');

var db = require("./db");

var tar = require("tar");
var zlib = require("zlib");
var request = require("request");
var when = require("when");
var fs = require("fs-extra");
var path = require("path");

var NODE_DIR = settings.nodeDir || path.join(__dirname,"../nodes");
//
fs.ensureDirSync(NODE_DIR);

function saveToDb(info) {
    return when.promise(function(resolve,reject) {
        if (info) {
            info.type = "node";
            info.updated_at = info.time.modified;
            info.refresh_requested = 0;
            db.flows.update(
                {_id:info._id},
                info,
                {upsert:true},
                function(err) {
                    if (err) {
                        //console.log(err);
                        reject({name:info._id,error:err});
                    } else {
                        resolve(info._id+" ("+info['dist-tags'].latest+")");
                    }
                }
            );
        } else {
            // If the module was already downloaded, then this will get passed
            // null. Had it rejected, we would delete the module.
            resolve();
        }
    });
}
function update(id,info) {
    return when.promise(function(resolve,reject) {
        db.flows.update(
            {_id:id},
            {$set:info},
            function(err) {
                if (err) {
                    reject({name:id,error:err});
                } else {
                    resolve();
                }
            }
        );
    });
}
function removeFromDb(id) {
    return when.promise(function(resolve,reject) {
        db.flows.remove({_id:id},function(err) {
            if (err) {
                reject({name:id,error:err});
            } else {
                //var nodePath = path.join(NODE_DIR,id);
                //fs.removeSync(nodePath);
                resolve(id +" (deleted)");
            }
        });
    });
}

function get(name,projection) {
    var query = {};
    var proj = {};
    //var proj = {
    //    name:1,
    //    description:1,
    //    "dist-tags":1,
    //    time:1,
    //    author:1,
    //    keywords:1
    //};
    if (typeof name === "object") {
        proj = name;
    } else if (typeof name === "string") {
        query = {_id:name};
        if (typeof projection === "object") {
            proj = projection;
        }
    }

    query.type = "node";

    return when.promise(function(resolve,reject) {
        db.flows.find({$query:query},proj).sort({"time.modified":1}).toArray(function(err,docs) {
            if (err) {
                reject(err);
            } else {
                if (query._id) {
                    if (!docs[0]) {
                        reject(new Error('node not found:'+name));
                    } else {
                        docs[0].versions.latest = JSON.parse(docs[0].versions.latest);
                        resolve(docs[0]);
                    }
                } else {
                    resolve(docs);
                }
            }
        });
    });
}
function getRequestedRefresh() {
    return when.promise(function(resolve,reject) {
        db.flows.find({$query:{refresh_requested:true}},{_id:1,name:1}).toArray(function(err,docs) {
            if (err) {
                reject(err);
            } else {
                resolve(docs);
            }
        });
    });
}
function findTypes(types) {
    return when.promise(function(resolve,reject) {
        if (types.length == 0) {
            resolve({});
        } else {
            var query = types.map(function(t) {
                return {types:t}
            });
            var result = {};
            db.flows.find({$or:query},{_id:1,types:1},function(err,docs) {
                if (err) {
                    reject(err);
                } else {
                    docs.forEach(function(d) {
                        d.types.forEach(function(t) {
                            result[t] = result[t]||[];
                            result[t].push(d._id);
                        });
                    });
                    resolve(result);
                }
            });
        }
    });
}

function getLastUpdateTime(name) {
    var query = {type:'node'};
    if (name) {
        query['_id'] = name;
    }
    return when.promise(function(resolve,reject) {
        db.flows.find({$query:query},{_id:1,"time.modified":1,"updated_at":1}).sort({"time.modified":-1}).limit(1).toArray(function(err,docs) {
            if (err) {
                return reject(err);
            }
            if (docs.length === 1) {
                //console.log(docs[0].updated_at)
                return resolve((new Date(docs[0].updated_at)).getTime());
            }
            resolve(0);
        });
    });
}

function getPopularByDownloads() {
    return when.promise(function(resolve,reject) {
        db.flows.find({$query:{type:'node'}}, {_id:1,downloads:1})
            .sort( {"downloads.week":-1} )
            .limit(30)
            .toArray(function(err,docs) {
                if (err) {
                    reject(err);
                } else {
                    resolve(docs);
                }
            });
    });
}

var npmNodes = module.exports = {
    save: saveToDb,
    remove: removeFromDb,
    update: update,
    close: function() { db.close(); },
    get: get,
    getRequestedRefresh:getRequestedRefresh,
    findTypes:findTypes,
    getLastUpdateTime: getLastUpdateTime,
    getPopularByDownloads: getPopularByDownloads
}
