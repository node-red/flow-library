var express = require("express");
var mustache = require('mustache');
var {marked} = require('marked');
var fs = require("fs");
var path = require("path");
var csrf = require('csurf');
var uuid = require('uuid')

var settings = require("../config");
var appUtils = require("../lib/utils");
var npmNodes = require("../lib/nodes");
var npmModules = require("../lib/modules");
var ratings = require("../lib/ratings");
var templates = require("../lib/templates");
var events = require("../lib/events");
var collections = require("../lib/collections");

var app = express();


var iconCache = {};


app.get("/nodes",function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    npmNodes.getPopularByDownloads().then(function(nodes) {
        context.nodes = nodes;
        res.send(mustache.render(templates.nodes,context,templates.partials));
    }).catch(function(err) {
        if (err) {
            console.log("error loading nodes:",err);
        }
        res.status(404).send(mustache.render(templates['404'],context,templates.partials));
    });
});


app.get("/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})",appUtils.csrfProtection(),function(req,res) {
    getNode(req.params.id,req.params.scope,null,req,res);
});
app.get("/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/in/:collection",appUtils.csrfProtection(),function(req,res) {
    getNode(req.params.id,req.params.scope,req.params.collection,req,res);
});

function getNode(id, scope, collection, req,res) {
    if (scope) {
        id = scope+"/"+id;
    }
    npmNodes.get(id).then(function(node) {
        node.sessionuser = req.session.user;
        node.csrfToken = req.csrfToken();
        node.pageTitle = req.params.id+" (node)";

        prepareScorecard(node)

        if (req.query.m) {
            try {
                node.message = Buffer.from(req.query.m, 'base64').toString();
            } catch(err){}
        }

        node.updated_at_since = appUtils.formatDate(node.updated_at);
        iconCache[id] = {};
        node.types = [];
        node.collection = collection;

        var collectionPromise;
        var ratingPromise;

        if (req.cookies.rateID) {
            if (node.rating && !node.rating.hasOwnProperty("count")) {
                delete node.rating;
                ratingPromise = Promise.resolve();
            } else {
                ratingPromise = ratings.getUserRating(id, req.cookies.rateID).then(function(userRating) {
                    if (userRating) {
                        if (!node.rating) {
                            node.rating = {};
                        }
                        node.rating.userRating = userRating.rating;
                    }
                    if (node.rating && node.rating.hasOwnProperty('score')) {
                        node.rating.score = (node.rating.score||0).toFixed(1);
                    }
                });
            }
        } else {
            if (node.rating) {
                node.rating.score = (node.rating.score||0).toFixed(1);
            }
            ratingPromise = Promise.resolve();
        }
        if (collection) {
            collectionPromise = collections.getSiblings(collection,id);
        } else {
            collectionPromise = Promise.resolve();
        }


        for (var n in node.versions.latest["node-red"].nodes) {
            var def = node.versions.latest["node-red"].nodes[n];
            //console.log(n);
            delete def.types.__errors__;
            for (var t in def.types) {
                //console.log("-",n);
                def.types[t].name = t;
                if (def.types[t].icon) {
                    if (/^font-awesome\//.test(def.types[t].icon)) {
                        def.types[t].iconFA = def.types[t].icon.substring(13)
                    } else if (!def.types[t].iconUrl) {
                        // Legacy nodes that have their icons stored locally
                        // and not uploaded to The Bucket
                        def.types[t].iconUrl = ("/icons/"+id+"/"+t).replace(/ /g,"%20");
                        if (fs.existsSync(__dirname+"/../public/icons/"+def.types[t].icon)) {
                            iconCache[id][t] = path.resolve(__dirname+"/../public/icons/"+def.types[t].icon);
                        }
                    }
                }
                def.types[t].hasInputs = (def.types[t].inputs > 0);
                def.types[t].hasOutputs = (def.types[t].outputs > 0);
                if (def.types[t].category == "config") {
                    delete def.types[t].color;
                }

                node.types.push(def.types[t]);
                //console.log(def.types[t]);

            }
        }
        //console.log(node);
        node.readme = node.readme||"";

        marked(node.readme,{},function(err,content) {
            node.readme = content.replace(/^<h1 .*?<\/h1>/gi,"");
            if (node.repository && node.repository.url && /github\.com/.test(node.repository.url)) {
                var m;
                var repo = node.repository.url;
                var rawUrl;
                var repoUrl;
                if ((m=/git@github.com:(.*)\.git$/.exec(repo))) {
                    rawUrl = "https://raw.githubusercontent.com/"+m[1]+"/master/";
                    repoUrl = "https://github.com/"+m[1]+"/blob/master/"
                    m = null;
                } else if ((m=/https:\/\/github.com\/(.*)\.git/.exec(repo))) {
                    rawUrl = "https://raw.githubusercontent.com/"+m[1]+"/master/";
                    repoUrl = "https://github.com/"+m[1]+"/blob/master/"
                    m = null;
                } else if ((m=/https:\/\/github.com\/(.*)/.exec(repo))) {
                    rawUrl = "https://raw.githubusercontent.com/"+m[1]+"/master/";
                    repoUrl = "https://github.com/"+m[1]+"/blob/master/"
                    m = null;
                } else if ((m=/git:\/\/github.com\/(.*)\.git$/.exec(repo))) {
                    rawUrl = "https://raw.githubusercontent.com/"+m[1]+"/master/";
                    repoUrl = "https://github.com/"+m[1]+"/blob/master/"
                    m = null;
                }
                var re = /(<img .*?src="(.*?)")/gi;

                while((m=re.exec(node.readme)) !== null) {
                    if (!/^https?:/.test(m[2])) {
                        var newImage = m[1].replace('"'+m[2]+'"','"'+rawUrl+m[2]+'"');
                        node.readme = node.readme.substring(0,m.index) +
                                        newImage +
                                      node.readme.substring(m.index+m[1].length);
                    }
                }

                if ((m=/(github.com\/.*?\/.*?)($|\.git$|\/.*$)/.exec(repo))) {
                    node.githubUrl = "https://"+m[1];
                }

                var linksRE = /(<a href="([^#].*?)")/gi;
                while ((m=linksRE.exec(node.readme)) !== null) {
                    if (!/^https?:/.test(m[2])) {
                        var targetUrl = /\.md$/i.test(m[2])?repoUrl:rawUrl;
                        node.readme = node.readme.substring(0,m.index) + `<a href="${targetUrl}/${m[2]}"` + node.readme.substring(m.index+m[1].length);
                    }
                }
            } else {
                var re = /(<img .*?src="(.*?)")/gi;
                while((m=re.exec(node.readme)) !== null) {
                    if (!/^http/.test(m[2])) {
                        node.readme = node.readme.substring(0,m.index) +
                                      '<img src=""'+
                                      node.readme.substring(m.index+m[1].length);
                    }
                };
            }

            ratingPromise.then(() => collectionPromise).then(function(collectionSiblings) {
                if (collection && collectionSiblings) {
                    node.collectionName = collectionSiblings[0].name;
                    node.collectionPrev = collectionSiblings[0].prev;
                    node.collectionPrevType = collectionSiblings[0].prevType;
                    node.collectionNext = collectionSiblings[0].next;
                    node.collectionNextType = collectionSiblings[0].nextType;
                }
                res.send(mustache.render(templates.node,node,templates.partials));
            });
        });

    }).catch(function(err) {
        if (err) {
            console.log("error loading node:",err);
        }
        res.status(404).send(mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
    });
};

app.get("/icons/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/:type", function(req,res) {
    var id = req.params.id;
    if (req.params.scope) {
        id = req.params.scope+"/"+id;
    }
    var type = req.params.type;
    if (iconCache[id] && iconCache[id][type]) {
        res.sendFile(iconCache[id][type]);
    } else {
        res.sendFile(path.resolve(__dirname+"/../public/icons/arrow-in.png"));
    }
});

app.get("/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/refresh",appUtils.csrfProtection(),function(req,res) {
    res.status(400).send("This end point is no longer used. If you are calling it directly - update to use POST /add/node instead")
});

app.post("/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/report",appUtils.csrfProtection(),function(req,res) {
    var id = req.params.id;
    if (req.params.scope) {
        id = req.params.scope+"/"+id;
    }
    if (req.session.user) {
        events.add({
            action:"module_report",
            module: id,
            message:req.body.details,
            user: req.session.user.login
        });
    }
    res.writeHead(303, {
        Location: "/node/"+id
    });
    res.end();
});

app.post("/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/rate", appUtils.csrfProtection(),function(req,res) {
    var id = req.params.id;
    try {
        var cc_cookie = JSON.parse(req.cookies.cc_cookie)
    } catch (e) {
        var cc_cookie = false
    }
    if (req.params.scope) {
        id = req.params.scope+"/"+id;
    }
    if (req.cookies.rateID) {
        ratings.rateThing(id,req.cookies.rateID,Number(req.body.rating)).then(function() {
            res.writeHead(303, {
                Location: "/node/"+id
            });
            res.end();
        })
    } else if (cc_cookie && cc_cookie.level.includes("functionality")) {
        var rateID = uuid.v4()
        res.cookie('rateID', rateID, { maxAge : 31556952000})
        ratings.rateThing(id,rateID,Number(req.body.rating)).then(function() {
            res.writeHead(303, {
                Location: "/node/"+id
            });
            res.end();
        })
    } else {
        res.writeHead(303, {
            Location: "/node/"+id
        });
        res.end();
    }
});

app.get("/add/node",appUtils.csrfProtection(),function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    context.csrfToken = req.csrfToken();
    res.send(mustache.render(templates.addNode,context,templates.partials));
});

app.post("/add/node",appUtils.csrfProtection(),function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    var name = req.body.module;
    if (name) {
        name = name.trim();
        npmModules.refreshModule(name).then(function(results) {
            console.log(results);
            results.forEach(function(result) {
                if (result.state === 'rejected') {
                    res.status(400).send(result.reason.toString())
                } else if (result.value) {
                    res.send("/node/"+name+"?m="+Buffer.from(result.value).toString('base64'))
                } else {
                    res.status(400).send("Module already at latest version")
                }
            });
        });
    } else {
        res.status(400).send("Invalid module name")
    }
});

app.get("/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/scorecard",appUtils.csrfProtection(),function(req,res) {
    var id = req.params.id;
    if (req.params.scope) {
        id = req.params.scope+"/"+id;
    }
    npmNodes.get(id).then(function(node) {
        node.sessionuser = req.session.user;
        node.csrfToken = req.csrfToken();
        node.pageTitle = req.params.id+" (node)";

        prepareScorecard(node);

        res.send(mustache.render(templates.scorecard,node,templates.partials));
    });

});


function prepareScorecard(node) {
    if (node.scorecard) {
        if (node.scorecard.N01 && node.scorecard.N01.nodes) {
            node.scorecard.N01.nodes = [... new Set(node.scorecard.N01.nodes)]
            node.scorecard.N01.nodes.sort()
        }
        const summary = {
            pass: 0,
            fail: 0,
            warn: 0
        }
        for (const [rule,result] of Object.entries(node.scorecard)) {
            if (result.test) {
                result.pass = true
                summary.pass++
            } else {
                if (rule in ['P01','P04','P05','D02']) {
                    result.fail = true
                    summary.fail++
                } else {
                    result.warn = true
                    summary.warn++
                }
            }
        }
        node.scorecard.summary = summary
    }
}

module.exports = app;
