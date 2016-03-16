var settings = require("../settings");
var request = require("request");
var when = require("when");
var fs = require("fs-extra");
var path = require("path");
var tar = require("tar");
var zlib = require("zlib");
var vm = require("vm");
var Twitter = require('twitter');

var nodes = require('./nodes');

var twitterClient = new Twitter(settings.twitter);

var NODE_DIR = settings.nodeDir || path.join(__dirname,"../nodes");
//
fs.ensureDirSync(NODE_DIR);


function getModuleInfo(name) {
    return when.promise(function(resolve,reject) {
        request("http://registry.npmjs.org/"+name, function(err,resp,body) {
            if (err) {
                reject(err);
            } else {
                try {
                    var response = JSON.parse(body);
                    resolve(response);
                } catch(err) {
                    reject(err);
                }
            }
        });
    });
}

function getLatestVersion(name) {
    return getModuleInfo(name).then(function(info) {
        return when.promise(function(resolve,reject) {
            var nodePath = path.join(NODE_DIR,name);
            var latest = info['dist-tags'].latest;
            var tarballUrl = info.versions[latest].dist.tarball;
            var tarfile = path.join(nodePath,path.basename(tarballUrl));

            var packagePath = path.join(nodePath,"package");
            function completeUpdate() {
                delete info.versions;
                var moduleInfo = examineModule(name);
                if (!moduleInfo) {
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
                if (info.repository &&
                    info.repository.url &&
                    info.repository.url.indexOf("https://github.com/node-red/") == 0) {
                    info.official = true;
                }
                if (info.readme === 'ERROR: No README data found!') {
                    return reject(name+": missing README");
                }
                resolve(info);
            }
            if (fs.existsSync(tarfile)) {
                //Force update ...
                //completeUpdate();
                resolve(null);
            } else {
                fs.ensureDirSync(nodePath);
                fs.deleteSync(packagePath);
                fs.ensureDirSync(packagePath);

                request(tarballUrl).pipe(fs.createWriteStream(tarfile)).on('finish', function() {
                    extractTarball(tarfile,packagePath).then(function() {
                        //console.log("Extracted:",name);
                        return completeUpdate();
                    }).otherwise(reject);
                }).on('error',function(err) {
                    return reject(err);
                });

            }
        });
    });
}

function extractTarball(src, dstDir) {
    // console.log("extract",dstDir)
    return when.promise(function(resolve,reject) {
        fs.createReadStream(src)
            .pipe(zlib.createGunzip())
            .pipe(tar.Extract({ path: dstDir,strip:1}))
            .on('error', function(err) { reject(err)})
            .on("end", function() { resolve()})
    });
}



function examineModule(name) {
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
            var content = fs.readFileSync(htmlFile,'utf8');
            var regExp = /<script ([^>]*)data-template-name=['"]([^'"]*)['"]/gi;
            var match = null;
            while((match = regExp.exec(content)) !== null) {
                packageJSON.types.push(match[2]);
            }
            var registry = {};
            regExp = /<script.+?type="text\/javascript".*?>([\S\s]+?)<\/script>/ig
            while((match = regExp.exec(content)) !== null) {
                var sandbox = {
                    RED: {
                        nodes: {
                            registerType:function(id,def){registry[id] = def;}
                        },
                        validators: {
                            number: function(){},
                            regex: function(){}
                        }
                    },
                    $: function(){}
                };
                var context = vm.createContext(sandbox);
                try {
                    var sc = vm.createScript(match[1]);
                    sc.runInContext(context);
                }catch(err) {
                    console.log("Script parse error:",name,err);
                }
            }

            for (var type in registry) {
                if (registry.hasOwnProperty(type)) {
                    if (registry[type].icon) {
                        var iconPath = path.join(nodePath,path.dirname(file),"icons",registry[type].icon);
                        if (fs.existsSync(iconPath)) {
                            registry[type].iconPath = iconPath;
                        }
                    }
                }
            }

            packageJSON['node-red'].nodes[n] = {
                file: file,
                types: registry
            }


        }
    }
    return packageJSON;
}


function pruneRemoved() {
    // Remove any nodes that no longer show up on the npm query results
    return when.promise(function(resolve,reject) {
        getAllFromNPM().then(function(fullList) {
            // Get the list of known nodes so we can spot deleted entries
            var promises = [];
            var foundNodes = {};
            fullList.forEach(function(r) {
                foundNodes[r.name] = true;
            });
            nodes.get({_id:1}).then(function(knownNodes) {
               knownNodes.forEach(function(r) {
                    if (!foundNodes[r._id]) {
                        //console.log("Local node not found remotely:",r._id);
                        promises.push(nodes.remove(r._id));
                    }
                });
                resolve(when.settle(promises));
            });
        });
    });
}

function getAllFromNPM() {
    return when.promise(function(resolve,reject) {
        var options = {
            host: "registry.npmjs.org",
            path: '/-/_view/byKeyword?startkey=["node-red"]&endkey=["node-red",{}]&group_level=3'
        }
        request("http://registry.npmjs.org/-/_view/byKeyword?startkey=[%22node-red%22]&endkey=[%22node-red%22,{}]&group_level=3",function(err,resp,body) {
            if (err) {
                reject(err);
            } else {
                try {
                    var response = JSON.parse(body);
                    var result = response.rows.map(function(r) {
                        var row = r.key;
                        return {name:row[1],desc:row[2]}
                    });
                    resolve(result);
                } catch(err) {
                    reject(err);
                }
            }
        });
    });
}

function getModuleFeed(page) {
    return when.promise(function(resolve,reject) {
        page = page||0;
        var url = "https://libraries.io/api/search?q=&platforms=NPM&keywords=node-red&sort=latest_release_published_at&per_page=15&page="+page;
        request(url, function(err,res,body) {
            if (err) {
                return reject(err);
            }
            if (res.statusCode!=200) {
                return reject(new Error('Bad status code retrieving module feed'));
            }
            try {
                resolve(JSON.parse(body));
            } catch(err) {
                return reject(new Error('Bad response from module feed'));
            }

        });
    });
}

function getUpdatedModules(since,page) {
    return when.promise(function(resolve,reject) {
        page = page||1;
        getModuleFeed(page).then(function(list) {
            var filteredList = list.filter(function(item) {
                item.versions.sort(function(a,b) {
                    return Date.parse(b.published_at)-Date.parse(a.published_at);
                });
                return item.versions.length > 0 && Date.parse(item.versions[0].published_at) > since;
            });
            if (filteredList.length === list.length) {
                getUpdatedModules(since,page+1).then(function(list) {
                    resolve(filteredList.concat(list));
                }).otherwise(reject);
            } else {
                resolve(filteredList);
            }
        }).otherwise(reject);
    });
}



function refreshAll() {
    // Unused - let in for reference
    return when.promise(function(resolve,reject) {
        getAllFromNPM().then(function(fullList) {
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
                        promises.push(nodes.removeFromDb(r._id));
                    }
                });
            });

            when.settle(promises).then(function(results) {
                processSlice();
            });

            function processSlice() {
                //console.log(fullList.length+" remaining to process");
                if (fullList.length == 0) {
                    when.settle(promises).then(function(results) {
                        db.close();
                        resolve(results);
                    });
                } else {
                    var list = fullList.splice(0,10);
                    promises = promises.concat(list.map(function(entry) {
                        return getLatestVersion(entry.name).then(nodes.save).otherwise(function(err) {
                            return nodes.remove(entry.name).then(function() {
                                throw err;
                            });
                        });
                    }));
                    setTimeout(processSlice,1000);
                }
            }
        });
    });
}
function processUpdated(list) {
    var promises = [];
    list.forEach(function(item) {
        var name = item.name;
        promises.push(
            getLatestVersion(name)
                .then(function(info) {
                    return nodes.save(info).then(function(saveResponse) {
                        if (info) {
                            tweet(info);
                        }
                        return saveResponse;
                    })
                })
                .otherwise(function(err) {
                    return nodes.remove(name).then(function() {
                        console.log("Removed",name,err);
                    }).otherwise(function(err2) {
                        console.log("Remove failed",name,err2);
                    })
                })
        );
    });
    return when.settle(promises).then(function(results) {
        return results;
    })
}
function refreshModule(module) {
    return processUpdated([{name:module}]);
}
function refreshUpdated() {
    return nodes.getLastUpdateTime().then(refreshUpdatedSince);
}
function refreshUpdatedSince(since) {
    // console.log("refreshing since",since);
    return getUpdatedModules(since).then(processUpdated);
}
function tweet(info) {
    if (info) {
        //console.log("Tweet",info);
        var t = info.name+" ("+info['dist-tags'].latest+")\nhttp://flows.nodered.org/node/"+info.name+"\n"+info.description;
        if (t.length > 140) {
            t = t.slice(0,139)+'\u2026';
        }
        if (process.env.ENV === 'PRODUCTION') {
            twitterClient.post('statuses/update', {status:t}, function(error, tweet, response){
                if (error) {
                    console.log("Twitter error: "+info.name+": "+error);
                }
            });
        } else {
            console.log("Tweet:",t);
        }
    }
}

module.exports = {
    refreshAll: function() {
        return refreshUpdatedSince(0);
    },
    refreshModule: refreshModule,
    refreshUpdated: refreshUpdated,
    refreshUpdatedSince: refreshUpdatedSince,
    getUpdatedModules: getUpdatedModules,
    getLatestVersion:getLatestVersion,
    pruneRemoved: pruneRemoved
}
