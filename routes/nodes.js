var express = require("express");
var mustache = require('mustache');
var marked = require('marked');
var fs = require("fs");
var path = require("path");
var csrf = require('csurf');

var appUtils = require("../lib/utils");
var npmNodes = require("../lib/nodes");
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
        //console.log(node);
        node.updated_at_since = appUtils.formatDate(node.updated_at);
        iconCache[id] = {};
        node.types = [];
        node.collection = collection;

        var collectionPromise;
        var ratingPromise;

        if (req.session.user) {
            if (node.rating && !node.rating.hasOwnProperty("count")) {
                delete node.rating;
                ratingPromise = Promise.resolve();
            } else {
                ratingPromise = ratings.getUserRating(id, req.session.user.login).then(function(userRating) {
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
                    if (fs.existsSync(__dirname+"/../public/icons/"+def.types[t].icon)) {
                        def.types[t].iconUrl = "/icons/"+def.types[t].icon;
                    } else {
                        def.types[t].iconUrl = "/node/"+id+"/icons/"+def.types[t].icon;
                    }
                }
                def.types[t].hasInputs = (def.types[t].inputs > 0);
                def.types[t].hasOutputs = (def.types[t].outputs > 0);
                if (def.types[t].category == "config") {
                    delete def.types[t].color;
                }

                node.types.push(def.types[t]);
                //console.log(def.types[t]);
                iconCache[id][def.types[t].icon] = appUtils.mapNodePath(def.types[t].iconPath);
            }
        }
        //console.log(node);
        node.readme = node.readme||"";

        marked(node.readme,{},function(err,content) {
            node.readme = content.replace(/^<h1 .*?<\/h1>/gi,"");
            if (node.repository && node.repository.url && /github\.com/.test(node.repository.url)) {
                var m;
                var repo = node.repository.url;
                var baseUrl;
                if ((m=/git@github.com:(.*)\.git$/.exec(repo))) {
                    baseUrl = "https://raw.githubusercontent.com/"+m[1]+"/master/";
                    m = null;
                } else if ((m=/https:\/\/github.com\/(.*)\.git/.exec(repo))) {
                    baseUrl = "https://raw.githubusercontent.com/"+m[1]+"/master/";
                    m = null;
                } else if ((m=/https:\/\/github.com\/(.*)/.exec(repo))) {
                    baseUrl = "https://raw.githubusercontent.com/"+m[1]+"/master/";
                    m = null;
                } else if ((m=/git:\/\/github.com\/(.*)\.git$/.exec(repo))) {
                    baseUrl = "https://raw.githubusercontent.com/"+m[1]+"/master/";
                    m = null;
                }
                var re = /(<img .*?src="(.*?)")/gi;

                while((m=re.exec(node.readme)) !== null) {
                    if (!/^https?:/.test(m[2])) {
                        var newImage = m[1].replace('"'+m[2]+'"','"'+baseUrl+m[2]+'"');
                        node.readme = node.readme.substring(0,m.index) +
                                        newImage +
                                      node.readme.substring(m.index+m[1].length);
                    }
                }

                if ((m=/(github.com\/.*?\/.*?)($|\.git$|\/.*$)/.exec(repo))) {
                    node.githubUrl = "https://"+m[1];
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

app.get("/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/icons/:icon", function(req,res) {
    var id = req.params.id;
    if (req.params.scope) {
        id = req.params.scope+"/"+id;
    }
    if (iconCache[id] && iconCache[id][req.params.icon]) {
        res.sendFile(iconCache[id][req.params.icon]);
    } else {
        res.sendFile(path.resolve(__dirname+"/../public/icons/arrow-in.png"));
    }
});

app.get("/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/refresh",function(req,res) {
    var id = req.params.id;
    if (req.params.scope) {
        id = req.params.scope+"/"+id;
    }
    if (req.session.user) {
        npmNodes.update(id,{refresh_requested:true});
        events.add({
            action:"refresh_requested",
            module: id,
            user:req.session.user.login
        });
    }
    res.writeHead(303, {
        Location: "/node/"+id
    });
    res.end();
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
    if (req.params.scope) {
        id = req.params.scope+"/"+id;
    }
    if (req.session.user) {
        ratings.rateThing(id,req.session.user.login,Number(req.body.rating)).then(function() {
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


module.exports = app;
