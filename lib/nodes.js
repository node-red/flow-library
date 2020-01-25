const settings = require("../config");
const mongojs = require('mongojs');
const util = require("util");
const db = require("./db");
const request = require("request");
const fs = require("fs-extra");
const path = require("path");
const NODE_DIR = settings.nodeDir || path.join(__dirname,"../nodes");
//
fs.ensureDirSync(NODE_DIR);

const CORE_NODES = ["tab","subflow","batch","catch","change","comment","complete","csv","debug","delay","exec","file","file in","function","html","http in","http response","http proxy","http request","inject","json","link in","link out","mqtt in","mqtt out","mqtt-broker","range","sort","split","join","status","switch","tcp in","tcp out","tcp request","template","tls-config","trigger","udp in","udp out","unknown","watch","websocket in","websocket out","websocket-listener","websocket-client","xml","yaml"].reduce(function(o, v, i) {
  o[v] = 1;
  return o;
}, {});

function saveToDb(info) {
    return new Promise((resolve,reject) => {
        try {
            if (info) {
                info.type = "node";
                info.updated_at = info.time.modified;
                info.refresh_requested = 0;
                info.npmOwners = info.maintainers.map(function(m) { return m.name });
                util.log("saveToDb update",info._id)
                db.flows.update(
                    {_id:info._id},
                    info,
                    {upsert:true},
                    function(err) {
                        if (err) {
                            //console.log(err);
                            util.log("saveToDb update",info._id,"ERR",err.toString())
                            reject({name:info._id,error:err});
                        } else {
                            util.log("saveToDb update",info._id,"DONE")
                            resolve(info._id+" ("+info['dist-tags'].latest+")");
                        }
                    }
                );
            } else {
                // If the module was already downloaded, then this will get passed
                // null. Had it rejected, we would delete the module.
                resolve();
            }
        } catch(err) {
            util.log("!!!! saveToDb err",err)
            reject(err);
        }
    });
}
function update(id,info) {
    return new Promise((resolve,reject) => {
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
    return new Promise((resolve,reject) => {
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

    return new Promise((resolve,reject) => {
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
    return new Promise((resolve,reject) => {
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
    return new Promise((resolve,reject) => {
        if (types.length == 0) {
            resolve({});
        } else {
            var query = types.map(function(t) {
                return {types:t}
            });
            var result = {};
            db.flows.find({type:"node",$or:query},{_id:1,types:1},function(err,docs) {
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
    return new Promise((resolve,reject) => {
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
    return new Promise((resolve,reject) => {
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
function getSummary() {
    return new Promise((resolve,reject) => {
        db.flows.find({$query:{type:'node'}}, {_id:1,downloads:1,time:1})
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
    CORE_NODES:CORE_NODES,
    save: saveToDb,
    remove: removeFromDb,
    update: update,
    close: function() { db.close(); },
    get: get,
    getRequestedRefresh:getRequestedRefresh,
    findTypes:findTypes,
    getLastUpdateTime: getLastUpdateTime,
    getPopularByDownloads: getPopularByDownloads,
    getSummary: getSummary
}
