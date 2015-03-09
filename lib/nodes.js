var settings = require("../settings");
var mongojs = require('mongojs');

var db = require("./db");

var tar = require("tar");
var zlib = require("zlib");
var request = require("request");
var when = require("when");
var fs = require("fs-extra");
var path = require("path");

var NODE_DIR = settings.nodeDir || path.join(__dirname,"../nodes");

fs.ensureDirSync(NODE_DIR);

function saveToDb(info) {
    return when.promise(function(resolve,reject) {
        if (info) {
            info.type = "node";
            info.updated_at = info.time.modified;
            db.flows.update(
                {_id:info._id},
                info,
                {upsert:true},
                function(err) {
                    if (err) {
                        //console.log(err);
                        reject({name:info._id,error:err});
                    } else {
                        resolve(info._id);
                    }
                }
            );
        } else {
            resolve();
        }
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

function refreshAll() {
    return when.promise(function(resolve,reject) {
        getAllFromNPM().then(function(fullList) {
            var promises = [];
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
                        return refreshModule(entry.name).then(saveToDb);
                    }));
                    setTimeout(processSlice,5000);
                }
            }
            processSlice();
            
        });
    });
}


function refreshModule(name) {
    return getModuleInfo(name).then(function(info) {
        return when.promise(function(resolve,reject) {
            var nodePath = path.join(NODE_DIR,name);
            var latest = info['dist-tags'].latest;
            var tarballUrl = info.versions[latest].dist.tarball;
            var tarfile = path.join(nodePath,path.basename(tarballUrl));
            
            var packagePath = path.join(nodePath,"package");
            
            function completeUpdate() {
                delete info.versions;
                info.versions = {latest:examineModule(name)};
                if (!info.versions.latest) {
                    reject(name+": no node-red property in package.json");
                }
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
                        completeUpdate();
                    }).otherwise(reject);
                }).on('error',function(err) {
                    reject(err);
                });
                
            }
        });
    });
}

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


function extractTarball(src, dstDir) {
    return when.promise(function(resolve,reject) {
        fs.createReadStream(src)
            .pipe(zlib.createGunzip())
            .pipe(tar.Extract({ path: dstDir,strip:1}))
            .on('error', function(err) { reject(err)})
            .on("end", function() { resolve()})
    });
}

var vm = require("vm");


function examineModule(name) {
    //console.log("Examine:",name);
    var nodePath = path.join(NODE_DIR,name,"package");
    
    var packageJSON = fs.readJsonSync(path.join(nodePath,"package.json"));
    if (!packageJSON['node-red']) {
        return null;
    }
    
    var nodes = packageJSON['node-red'].nodes;
    packageJSON['node-red'].nodes = {};
    
    var types = [];
    for (var n in nodes) {
        if (nodes.hasOwnProperty(n)) {
            var file = nodes[n];
            var htmlFile = path.join(nodePath,path.dirname(file),path.basename(file,".js")+".html");
            var content = fs.readFileSync(htmlFile,'utf8');
            var regExp = /<script ([^>]*)data-template-name=['"]([^'"]*)['"]/gi;
            var match = null;
            while((match = regExp.exec(content)) !== null) {
                types.push(match[2]);
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
                        var iconPath = path.join(nodePath,"icons",registry[type].icon);
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
    return JSON.stringify(packageJSON);
}

var npmNodes = module.exports = {
    refreshAll: refreshAll,
    get: function(name,projection) {
        var query = {};
        var proj = {
            name:1,
            description:1,
            "dist-tags":1,
            time:1,
            author:1,
            keywords:1
        };
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
            db.flows.find({$query:query,$orderby:{"time.modified":1}},proj).toArray(function(err,docs) {
                if (err) {
                    reject(err);
                } else {
                    resolve(docs);
                }
            });
        });
    }
}
