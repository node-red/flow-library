const acorn = require('acorn');
const walk = require("acorn/dist/walk");
const settings = require("../config");
const request = require("request");
const fs = require("fs-extra");
const path = require("path");
const tar = require("tar");
const vm = require("vm");
const Twitter = require('twitter');
const util = require("util");
const npmNodes = require('./nodes');
const events = require('./events');
const ratings = require('./ratings');
const aws = require("./aws");

const twitterClient = new Twitter(settings.twitter);

const NODE_DIR = settings.nodeDir || path.join(__dirname,"../nodes");
//
fs.ensureDirSync(NODE_DIR);

var blockList = [];
if (settings.modules && settings.modules.block && Array.isArray(settings.modules.block)) {
    blockList = settings.modules.block;
}

async function getModuleInfo(name) {
    return new Promise((resolve,reject) => {
        try {
            name = name.replace("/","%2F");
            util.log(name,"getModuleInfo sending request","http://registry.npmjs.org/"+name);
            request("http://registry.npmjs.org/"+name, {timeout: 5000}, function(err,resp,body) {
                if (err) {
                    util.log(name,"getModuleInfo request error",err.toString())
                    err.doNotRemove = true;
                    reject(err);
                } else {
                    try {
                        var response = JSON.parse(body);
                        util.log(name,"getModuleInfo request succeeded")
                        resolve(response);
                    } catch(err2) {
                        util.log(name,"getModuleInfo request failed",err2.toString());
                        util.log("\n\n\n------------")
                        util.log(body);
                        util.log("------------\n\n\n")
                        reject(err2);
                    }
                }
            });
        }catch(err) {
            util.log(name,"getModuleInfo ERROR",err.toString);
            reject(err);
        }
    });
}

function checkVersionKnown(name,version) {
    var nodePath = path.join(NODE_DIR,name);
    var tarfile = path.join(nodePath,name+"-"+version+".tgz");
    return fs.existsSync(tarfile);
}

async function getLatestVersion(name, knownVersion) {
    if (blockList.indexOf(name) !== -1) {
        throw new Error(name+" : on the block list");
    }
    let info = await getModuleInfo(name);
    if (knownVersion && info['dist-tags'].latest === knownVersion && !process.env.FORCE_UPDATE) {
        // Already handled this version
        return Promise.resolve(null);
    }
    return new Promise((resolve,reject) => {
        try {
            var nodePath = path.join(NODE_DIR,name);
            if (!info.hasOwnProperty(['dist-tags'])) {
                util.log(name,'no stable')
                return reject(name+": no stable published version");
            }
            var latest = info['dist-tags'].latest;

            var keywords = info.versions[latest].keywords || [];
            if (keywords.indexOf("node-red") === -1) {
                return reject(name+"@"+latest+": missing 'node-red' keyword");
            }
            // FIX for when dist-tags contains versions with '.' in them that mongo
            // cannot store
            info['dist-tags'] = {latest:latest};
            var tarballUrl = info.versions[latest].dist.tarball;
            var tarfile = path.join(nodePath,path.basename(tarballUrl));

            var packagePath = path.join(nodePath,"package");
            async function completeUpdate() {
                util.log(name,'completeUpgrade done')
                delete info.versions;
                var moduleInfo;
                try {
                    moduleInfo =  await examineModule(name);
                } catch(err) {
                    events.add({
                        action:"reject",
                        module: name,
                        version: latest,
                        message:err.toString()
                    });
                    return reject(name+": "+err.toString())
                } finally {
                    try {
                        fs.removeSync(nodePath);
                    } catch(err2) {}
                }
                if (!moduleInfo) {
                    util.log(name,'missing node-red property')
                    return reject(name+": no node-red property in package.json");
                }
                info.types = moduleInfo.types;
                delete moduleInfo.types;
                info.versions = {latest:JSON.stringify(moduleInfo)};
                info.time = {
                    modified: info.time.modified,
                    created: info.time.created,
                    latest:info.time[latest]
                };
                if (info.repository && info.repository.url && info.repository.url.indexOf("https://github.com/node-red/") == 0) {
                    info.official = true;
                }
                if (info.readme === 'ERROR: No README data found!') {
                    events.add({
                        action:"reject",
                        module: name,
                        version: latest,
                        message:"Missing README"
                    });
                    return reject(name+": missing README");
                }

                //FIX for node-red-contrib-idm - their 'users' field contains a '.' which
                // mongo doesn't like. As we don't use it, just delete the field.
                delete info.users;
                util.log(name,'completeUpgrade done')
                resolve(info);
            }
            if (fs.existsSync(tarfile)) {
                //Force update ...
                if (process.env.FORCE_UPDATE) {
                    return completeUpdate();
                }
                util.log(name,'tarball exists - resolve null')
                return resolve(null);
            } else {
                fs.ensureDirSync(nodePath);
                fs.removeSync(packagePath);
                fs.ensureDirSync(packagePath);

                util.log(name,'getting tarball')

                request(tarballUrl).pipe(fs.createWriteStream(tarfile)).on('finish', function() {
                    util.log(name,'finished getting tarball, extracting...')
                    extractTarball(tarfile,packagePath).then(function() {
                        util.log(name,'finished extracting')
                        //console.log("Extracted:",name);
                        return completeUpdate();
                    }).catch(reject);
                }).on('error',function(err) {
                    util.log(name,'handle error whilst getting tarball')
                    events.add({
                        action:"reject",
                        module: name,
                        version: latest,
                        message:"Error processing tarfile: "+err.toString()
                    });
                    return reject(err);
                });
            }
        } catch(err) {
            util.log(name,'ERR1',err.toString())
        }
    });
}

function extractTarball(src, dstDir) {
    // console.log("extract",dstDir)
    //
    return tar.x({
        file: src,
        cwd: dstDir,
        strip: 1,
    })
}


function getNodeDefinitions(filename) {
    var regExp = /<script.+?type=['"]text\/javascript['"].*?>([\S\s]*?)<\/script>/ig;

    var content = fs.readFileSync(filename,'utf8');
    // console.error(filename);
    var parts = [];
    var match;
    while((match = regExp.exec(content)) !== null) {
        var block = match[1];
        parts.push(match[1]);
    }
    if (parts.length === 0) {
        throw new Error("No <script> sections found");
    }
    var defs = {};
    var errors = [];
    var count = 0;
    parts.forEach(function(p) {
        try {
            var a = acorn.parse(p);
            // walk.simple(a,{Property(node) { if (node.key.name === 'defaults') console.log(node.value.properties.map(function(n) { return n.key.name})); }})
            walk.simple(a,{
                CallExpression(node) {
                    if (node.callee.property && node.callee.property.name === 'registerType') {
                        var nodeTypeNode = node.arguments[0];
                        var nodeDefNode = node.arguments[1];
                        if (nodeTypeNode.type  === 'Literal') {
                            var defType = nodeTypeNode.value;
                            if (nodeDefNode.type === 'ObjectExpression') {
                                defs[defType] = {};
                                count++;
                                nodeDefNode.properties.forEach(function(nodeDef) {
                                    if (nodeDef.key.name === 'defaults') {
                                        if (!nodeDef.value.properties) {
                                            errors.push({ code:"defaults-not-inline" });
                                        } else {
                                            defs[defType].defaults = {};
                                            nodeDef.value.properties.forEach(function(n) { defs[defType].defaults[n.key.name] = {}; });
                                        }
                                    } else if (nodeDef.key.name === 'credentials') {
                                        if (!nodeDef.value.properties) {
                                            errors.push({ code:"credentials-not-inline" });
                                        } else {
                                            defs[defType].credentials = nodeDef.value.properties.map(function(n) { return n.key.name; });
                                        }
                                    } else if (nodeDef.key.name === 'icon') {
                                        if (nodeDef.value.type === 'Literal') {
                                            defs[defType].icon = nodeDef.value.value;
                                        } else {
                                            errors.push({ code:"icon-not-inline" });
                                        }
                                    } else if (nodeDef.key.name === 'color') {
                                        if (nodeDef.value.type === 'Literal') {
                                            defs[defType].color = nodeDef.value.value;
                                        } else {
                                            errors.push({ code:"color-not-inline" });
                                        }
                                    } else if (nodeDef.key.name === 'inputs') {
                                        if (nodeDef.value.type === 'Literal') {
                                            defs[defType].inputs = nodeDef.value.value;
                                        } else {
                                            errors.push({ code:"inputs-not-inline" });
                                        }
                                    } else if (nodeDef.key.name === 'outputs') {
                                        if (nodeDef.value.type === 'Literal') {
                                            defs[defType].outputs = nodeDef.value.value;
                                        } else {
                                            errors.push({ code:"outputs-not-inline" });
                                        }
                                    }
                                });
                            } else {
                                errors.push({
                                    code:"non-objectexpression",
                                    message:util.inspect(nodeDefNode)
                                });
                            }
                        } else {
                            errors.push({
                                code:"non-literal",
                                message:util.inspect(nodeTypeNode)
                            });
                        }
                    }
                }
            });
        } catch(err) {
            errors.push({
                code:"parse",
                message: "at:"+err.pos+" "+p.substr(Math.max(0,err.pos-10),20)
            });
            throw err;
        }
    });
    if (count === 0) {
        if (errors.length > 0) {
            throw new Error("Syntax errors parsing <script>:\n   "+errors.map(function(err) { return err.message; }).join("\n   "));
        }
        throw new Error("No type definitions found");
    }
    if (errors.length > 0) {
        defs.__errors__ = errors;
    }
    return defs;
}

async function examineModule(name) {
    var nodePath = path.join(NODE_DIR,name,"package");

    var packageJSON = fs.readJsonSync(path.join(nodePath,"package.json"));
    if (!packageJSON['node-red']) {
        return null;
    }

    var nodes = packageJSON['node-red'].nodes;
    packageJSON['node-red'].nodes = {};

    packageJSON.types = [];
    for (var n in nodes) {
        if (nodes.hasOwnProperty(n)) {
            var file = nodes[n];
            var htmlFile = path.join(nodePath,path.dirname(file),path.basename(file,".js")+".html");
            var def;
            try {
                def = getNodeDefinitions(htmlFile);
            } catch(err) {
                events.add({
                           action:"error",
                           module: name,
                           version: packageJSON.version,
                           message:"Script parse error: "+err.toString()
                       });
                def = {};
            }
            packageJSON.types = packageJSON.types.concat(Object.keys(def));

            for (var type in def) {
                if (def.hasOwnProperty(type)) {
                    if (def[type].icon) {
                        var iconPath = path.join(nodePath,path.dirname(file),"icons",def[type].icon);
                        if (fs.existsSync(iconPath)) {
                            const bucketKey = `nodes/${packageJSON.name}/${type}`;
                            def[type].iconUrl = await aws.upload(iconPath,bucketKey)
                        }
                    }
                }
            }
            packageJSON['node-red'].nodes[n] = {
                file: file,
                types: def
            };
        }
    }
    return packageJSON;
}


function pruneRemoved() {
    // Remove any nodes that no longer show up on the npm query results
    return getAllFromNPM().then(fullList => {
        return new Promise((resolve,reject) => {
            // Get the list of known nodes so we can spot deleted entries
            var promises = [];
            var foundNodes = {};
            fullList.forEach(function(r) {
                foundNodes[r.name] = true;
            });
            npmNodes.get({_id:1}).then(function(knownNodes) {
                knownNodes.forEach(function(r) {
                    if (!foundNodes[r._id]) {
                        //console.log("Local node not found remotely:",r._id);
                        promises.push(
                            npmNodes.remove(r._id).then(() => {
                                events.add({
                                    "action": "remove",
                                    "module": r._id,
                                    "message": "Module not found on npm"
                                })
                            }).then(() => {
                                return { value: r._id }
                            }).catch(err => {
                                return { state: 'rejected', value: err.toString()}
                            })
                        )
                    }
                });
            });
            resolve(Promise.all(promises));
        });
    });
}

async function getAllFromNPM() {
    return new Promise((resolve,reject) => {
        var options = {
            host: "registry.npmjs.org",
            path: '/-/_view/byKeyword?startkey=["node-red"]&endkey=["node-red",{}]&group_level=3'
        }
        request("http://registry.npmjs.org/-/_view/byKeyword?startkey=[%22node-red%22]&endkey=[%22node-red%22,{}]&group_level=3",function(err,resp,body) {
            if (err) {
                events.add({
                    action:"error",
                    message:"Error retrieving npm feed: "+err.toString()
                });
                reject(err);
            } else {
                // console.log("[",body,"]")
                try {
                    var response = JSON.parse(body);
                    var result = response.rows.map(function(r) {
                        var row = r.key;
                        return {name:row[1],desc:row[2]}
                    });
                    resolve(result);
                } catch(err2) {
                    console.log(err2);
                    console.log(body);
                    events.add({
                        action:"error",
                        message:"Error retrieving npm feed. Bad response: "+err2.toString()
                    });
                    reject(err2);
                }
            }
        });
    });
}

async function getModuleFeed(page) {
    return new Promise((resolve,reject) => {
        page = page||0;
        var url = "https://libraries.io/api/search?q=&platforms=NPM&keywords=node-red&sort=latest_release_published_at&per_page=15&page="+page+"&api_key="+settings.librariesIO.apiKey;
        console.log(url);
        request(url, function(err,res,body) {
            if (err) {
                events.add({
                    action:"error",
                    message:"Error retrieving libraries.io feed: "+err.toString()
                });
                return reject(err);
            }
            if (res.statusCode!=200) {
                events.add({
                    action:"error",
                    message:"Error retrieving libraries.io feed. Status Code: "+res.statusCode
                });
                return reject(new Error('Bad status code retrieving module feed'));
            }
            try {
                resolve(JSON.parse(body));
            } catch(err) {
                events.add({
                    action:"error",
                    message:"Error retrieving libraries.io feed. Bad response: "+err.toString()
                });
                return reject(new Error('Bad response from module feed'));
            }

        });
    });
}

async function getUpdatedModules(since,page) {
    return new Promise(function(resolve,reject) {
        page = page||1;
        getModuleFeed(page).then(list => {
            let filteredList = list.filter(function(item) {
                if (item.latest_stable_release && item.latest_stable_release.number) {
                    return !checkVersionKnown(item.name,item.latest_stable_release.number);
                } else {
                    return false;
                }
            });
            if (filteredList.length > 0) {
                getUpdatedModules(since,page+1).then(list => {
                    resolve(filteredList.concat(list));
                });
            } else {
                resolve(filteredList);
            }
        });
    });
}


function processUpdated(list) {
    var promises = [];
    list.forEach(function(item) {
        util.log("processUpdate",item.name);
        var name = item.name;
        util.log(item.name,"npmNodes.get");
        promises.push(
            npmNodes.get(name,{updated_at:1,'dist-tags':1,rating:1, }).catch(function(err) {
                var msg = err.toString();
                if (/node not found/.test(msg)) {
                    util.log(item.name,": not already known")
                } else {
                    util.log(item.name,"ERROR npmNodes.get",err.toString())
                }
                return null;
            }).then(function(prevInfo) {
                var lastUpdateTime = 0;
                var knownVersion = null;
                if (prevInfo) {
                    lastUpdateTime = (new Date(prevInfo.updated_at)).getTime();
                    knownVersion = prevInfo['dist-tags'] && prevInfo['dist-tags'].latest;
                }
                return getLatestVersion(name,knownVersion).then(function(info) {
                    // copy over previous rating
                    if (info && prevInfo && prevInfo.rating) {
                        info.rating = prevInfo.rating;
                    }
                    if (info) {
                        util.log(item.name,"npmNodes.save");
                        return npmNodes.save(info).then(function(saveResponse) {
                            if (info) {
                                events.add({
                                    "action": "update",
                                    "module": info.name,
                                    "version": info['dist-tags'].latest
                                });
                                try {
                                    if (Date.parse(info.time.modified)-lastUpdateTime > 1000*60*60*2) {
                                        tweet(info);
                                    } else {
                                        console.log(name,": not tweeting ("+(Date.parse(info.time.modified)-lastUpdateTime)+")")
                                    }
                                } catch(err) {
                                    console.log(name,": error deciding whether to tweet:",err.stack)
                                }
                            }
                            return saveResponse;
                        });
                    }
                    if (prevInfo) {
                        util.log(item.name,"already handled this version");
                    } else {
                        util.log(item.name,"already rejected this version");
                        var err = new Error("already rejected this version");
                        throw err;
                    }
                    return null;
                }).catch(function(err) {
                    util.log(item.name,"ERROR",err.toString());
                    if (!prevInfo || err.doNotRemove) {
                        throw err;
                    }
                    return npmNodes.remove(name).then(function() {
                        console.log("Removed",name,err);
                        console.log(err.stack);
                        throw err;
                    }).catch(function(err2) {
                        console.log("Remove failed",name,err2);
                        throw err2;
                    });
                })
            }).then(function(res) {
                util.log("processUpdate DONE",item.name);
                return {state:'fulfilled',value:res};
            }).catch(function(err) {
                return {state:'rejected', reason: err};
            })
        );
    });
    return Promise.all(promises).then(function(results) {
        return results;
    })
}
function refreshModule(module) {
    return processUpdated([{name:module}]);
}
function refreshUpdated() {
    return npmNodes.getLastUpdateTime().then(refreshUpdatedSince);
}
function refreshUpdatedSince(since) {
    // console.log("refreshing since",since);
    return getUpdatedModules(since).then(processUpdated);
}


var tweetsSent = 0;
function tweet(info) {
    if (info) {
        //console.log("Tweet",info);
        var t = "📦 "+info.name+" ("+info['dist-tags'].latest+")\n\n"+info.description;
        if (t.length > 250) {
            t = t.slice(0,249)+"\u2026";
        }
        t += "\n\nhttps://flows.nodered.org/node/"+info.name;
        if (!process.env.NO_TWEET && process.env.FLOW_ENV === 'PRODUCTION' && tweetsSent < 5) {
            // Only send tweets if in production and we haven't sent five in this session
            twitterClient.post('statuses/update', {status:t}, function(error, tweet, response){
                if (error) {
                    console.log("Twitter error: "+info.name+": "+error);
                }
            });
            tweetsSent++;
        } else {
            console.log("Tweet:");
            console.log("-------")
            console.log(t);
            console.log("-------")
        }
    }
}

function refreshDownloads() {
    return new Promise((resolve,reject) => {
        npmNodes.get({_id:1}).then(function(nodes) {
            var promises = [];
            function processSlice() {
                if (nodes.length === 0) {
                    return resolve(Promise.all(promises));
                }
                var list = nodes.splice(0,10);
                promises = list.map(function(entry) {
                    return refreshDownload(entry._id);
                });

                Promise.all(promises).then(function(results) {
                    promises = [];
                    setTimeout(processSlice,3000);
                })
            }
            processSlice();
        });
    });
}

async function refreshDownload(module) {
    try {
        let downloads = {
            day: (await refreshDownloadForPeriod(module,'last-day')) || 0,
            week: (await refreshDownloadForPeriod(module,'last-week')) || 0,
            month: (await refreshDownloadForPeriod(module,'last-month')) || 0
        }
        return npmNodes.update(module,{downloads:downloads}).catch(err => {
            console.log("Error refreshing downloads module:",module," ERROR:",err.toString())
        });
    } catch(err) {
        console.log("Error refreshing downloads module:",module," ERROR:",err.toString())
        return Promise.resolve();
    }
}
async function refreshDownloadForPeriod(module,period) {
    return new Promise((resolve,reject) => {
        request("https://api.npmjs.org/downloads/point/"+period+"/"+module, function(err,resp,body) {
            if (err) {
                reject(err);
            } else {
                try {
                    var response = JSON.parse(body);
                    resolve(response.downloads);
                } catch(err2) {
                    reject(err2);
                }
            }
        });
    });
}

function getAllNpmModules(from) {
    var pageSize = 250;
    return new Promise((resolve,reject) => {
        from = from || 0;
        var url = "https://registry.npmjs.org/-/v1/search?text=keywords:node-red&size="+pageSize+"&from="+from;
        console.log(url);
        request(url, function(err,res,body) {
            if (err) {
                events.add({
                    action:"error",
                    message:"Error retrieving npm feed: "+err.toString()
                });
                return reject(err);
            }
            if (res.statusCode!=200) {
                events.add({
                    action:"error",
                    message:"Error retrieving npm feed. Status Code: "+res.statusCode
                });
                return reject(new Error('Bad status code retrieving npm feed'));
            }
            try {
                resolve(JSON.parse(body));
            } catch(err2) {
                events.add({
                    action:"error",
                    message:"Error retrieving npm feed. Bad response: "+err2.toString()
                });
                return reject(new Error('Bad response from npm feed'));
            }
        });
    }).then(function(result) {
        var total = result.total;
        var results = result.objects.map(function(obj) {
            return {
                name: obj.package.name,
                version: obj.package.version
            };
        });
        if (from+pageSize < total) {
            return getAllNpmModules(from+pageSize).then(function(nextResults) {
                return results.concat(nextResults);
            });
        } else {
            return results;
        }

    });
}

function pruneRatings() {
    return ratings.getRatedModules().then(function (ratedModules) {
        var promises = [];
        ratedModules.forEach(function (name) {
            promises.push(
                npmNodes.get(name).then(function (node) {
                    return null;
                }).catch(function (err) {
                    if (err.message.startsWith('node not found:')) {
                        return ratings.removeForModule(name).then(function () {
                            return events.add({
                                "action": "remove_ratings",
                                "module": name,
                                "message": "ratings removed"
                            });
                        }).then(function () {
                            return name + ' ratings removed';
                        });
                    } else {
                        throw err;
                    }
                }).then(res => {
                    return {state:'fulfilled', value: res}
                }).catch(e => {
                    return {state:'rejected', reason: e}
                })
            );
        });
        return Promise.all(promises).then(function (results) {
            return results.filter(function (res) {
                return res.state == 'rejected' || res.value;
            });
        })
    });
}


module.exports = {
    refreshAll: function() {
        return refreshUpdatedSince(0);
    },
    refreshModule: refreshModule,
    refreshUpdated: refreshUpdated,
    refreshUpdatedSince: refreshUpdatedSince,
    refreshDownloads: refreshDownloads,
    getUpdatedModules: getUpdatedModules,
    getModuleInfo: getModuleInfo,
    getLatestVersion:getLatestVersion,
    pruneRemoved: pruneRemoved,
    getAllNpmModules: getAllNpmModules,
    pruneRatings: pruneRatings
}
