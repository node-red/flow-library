var express = require("express");
var mustache = require('mustache');
var marked = require('marked');
var fs = require("fs");

var settings = require("../config");
var gister = require("../lib/gists");
var appUtils = require("../lib/utils");
var npmNodes = require("../lib/nodes");
var templates = require("../lib/templates");
var collections = require("../lib/collections");
var ratings = require("../lib/ratings");


var app = express();

var coreNodes = ["sentiment", "inject", "debug", "exec", "function", "template",
    "delay", "trigger", "comment", "unknown", "arduino in", "arduino out", "arduino-board",
    "rpi-gpio in", "rpi-gpio out", "rpi-mouse", "mqtt in", "mqtt out", "mqtt-broker",
    "http in", "http response", "http request", "websocket in", "websocket out",
    "websocket-listener", "websocket-client", "watch", "serial in", "serial out",
    "serial-port", "tcp in", "tcp out", "tcp request", "udp in", "udp out", "switch",
    "change", "range", "csv", "html", "json", "xml", "twitter-credentials",
    "twitter in", "twitter out", "feedparse", "e-mail", "e-mail in", "irc in",
    "irc out", "irc-server", "tail", "file", "file in", "redis out", "mongodb",
    "mongodb out", "mongodb in", "catch"].reduce(function(o, v, i) {
      o[v] = 1;
      return o;
    }, {});


app.post("/flow", function(req,res) {
    if (req.session.accessToken) {
        var gist_post = {
            description: req.body.title,
            public: false,
            files: {
                'flow.json': {
                    content: req.body.flow
                },
                'README.md': {
                    content: req.body.description
                }
            }
        };
        gister.create(req.session.accessToken,gist_post,req.body.tags||[]).then(function(id) {
            res.send("/flow/"+id);
        }).catch(function(err) {
            console.log("Error creating flow:",err);
            res.send(err);
        });
    } else {
        res.status(403).end();
    }
});

app.get("/flow/:id",appUtils.csrfProtection(),function(req,res) { getFlow(req.params.id,null,req,res); });
app.get("/flow/:id/in/:collection",appUtils.csrfProtection(),function(req,res) { getFlow(req.params.id,req.params.collection,req,res); });
function getFlow(id,collection,req,res) {
    gister.get(id).then(function(gist) {
        gist.sessionuser = req.session.user;
        gist.csrfToken = req.csrfToken();
        gist.flow = "";
        gist.collection = collection;
        gist.created_at_since = appUtils.formatDate(gist.created_at);
        gist.updated_at_since = appUtils.formatDate(gist.updated_at);
        gist.refreshed_at_since = appUtils.formatDate(gist.refreshed_at);


        var collectionPromise;
        var ratingPromise;
        if (req.session.user) {
            if (gist.rating && !gist.rating.hasOwnProperty("count")) {
                delete gist.rating;
                ratingPromise = Promise.resolve();
            } else {
                ratingPromise = ratings.getUserRating(id, req.session.user.login).then(function(userRating) {
                    if (userRating) {
                        if (!gist.rating) {
                            gist.rating = {};
                        }
                        gist.rating.userRating = userRating.rating;
                    }
                });
            }
        } else {
            ratingPromise = Promise.resolve();
        }
        if (collection) {
            collectionPromise = collections.getSiblings(collection,id);
        } else {
            collectionPromise = Promise.resolve();
        }

        if (gist.created_at_since == gist.updated_at_since) {
            delete gist.updated_at_since;
        }
        gist.owned = (gist.sessionuser &&
            (
                (gist.owner.login == gist.sessionuser.login) ||
                (settings.admins.indexOf(req.session.user.login) != -1)
            ));

        gist.nodeTypes = [];
        if (gist.files['flow-json']) {
            gist.flow = fs.readFileSync(appUtils.mapGistPath(gist.files['flow-json']),'utf-8');
            try {
                var nodes = JSON.parse(gist.flow);
                var nodeTypes = {};
                for (var n in nodes) {
                    var node = nodes[n];
                    nodeTypes[node.type] = (nodeTypes[node.type]||0)+1;
                }
                gist.nodeTypes = [];
                for (var nt in nodeTypes) {
                    gist.nodeTypes.push({type:nt,count:nodeTypes[nt]});
                }
                gist.nodeTypes.sort(function(a,b) {
                    if (a.type in coreNodes && !(b.type in coreNodes)) {
                        return -1;
                    }
                    if (!(a.type in coreNodes) && b.type in coreNodes) {
                        return 1;
                    }
                    if (a.type>b.type) return 1;
                    if (a.type<b.type) return -1;
                    return 0;
                });
                gist.flow = JSON.stringify(nodes);
            } catch(err) {
                gist.flow = "Invalid JSON";
            }
        }
        npmNodes.findTypes(gist.nodeTypes.map(function(t) { return t.type; })).then(function(typeMap) {
            var nodeTypes = gist.nodeTypes;
            gist.nodeTypes = {core:[], other:[]};

            nodeTypes.forEach(function(t) {
                var type = typeMap[t.type];
                if (type) {
                    if (type.length == 1) {
                        t.module = type[0];
                    } else if (type.length > 1) {
                        t.moduleAlternatives = type;
                    }
                }
                if (t.type in coreNodes) {
                    delete t.module;
                    gist.nodeTypes.core.push(t);
                } else {
                    gist.nodeTypes.other.push(t);
                }

            });
            fs.readFile(appUtils.mapGistPath(gist.files['README-md']),'utf-8',function(err,data) {
                marked(data,{},function(err,content) {
                    gist.readme = content;
                    ratingPromise.then(()=>collectionPromise).then(function(collectionSiblings){
                        if (collection && collectionSiblings) {
                            gist.collectionName = collectionSiblings[0].name;
                            gist.collectionPrev = collectionSiblings[0].prev;
                            gist.collectionPrevType = collectionSiblings[0].prevType;
                            gist.collectionNext = collectionSiblings[0].next;
                            gist.collectionNextType = collectionSiblings[0].nextType;
                        }
                        res.send(mustache.render(templates.gist,gist,templates.partials));
                    });
                });
            });
        });
    }).catch(function(err) {
        console.log("Error loading flow:",err);
        try {
            res.status(404).send(mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
        } catch(err2) {
            console.log(err2);
        }
    });
}

function verifyOwner(req,res,next) {
    if (!req.session.user) {
        res.status(403).end();
    } else if (settings.admins.indexOf(req.session.user.login) != -1) {
        next();
    } else {
        gister.get(req.params.id).then(function(gist) {
            if (gist.owner.login == req.session.user.login) {
                next();
            } else {
                res.status(403).end();
            }
        }).catch(function() {
            res.status(403).end();
        });
    }
}

app.post("/flow/:id/tags",verifyOwner,function(req,res) {
    // TODO: verify req.session.user == gist owner
    gister.updateTags(req.params.id,req.body.tags).then(function() {
        res.status(200).end();
    }).catch(function(err) {
        console.log("Error updating tags:",err);
        res.status(200).end();
    });

});

app.post("/flow/:id/refresh",verifyOwner,function(req,res) {
    gister.refresh(req.params.id).then(function () {
        res.send("/flow/"+req.params.id);
    }).catch(function(exists) {
        if (exists) {
            res.status(304).end();
        } else {
            res.status(404).send(mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
        }
    });
});

app.post("/flow/:id/rate", appUtils.csrfProtection(),function(req,res) {
    var id = req.params.id;
    if (req.session.user) {
        ratings.rateThing(id,req.session.user.login,Number(req.body.rating)).then(function() {
            res.writeHead(303, {
                Location: "/flow/"+id
            });
            res.end();
        })
    } else {
        res.writeHead(303, {
            Location: "/flow/"+id
        });
        res.end();
    }
});


//app.post("/flow/:id/add",function(req,res) {
//    gister.add(req.params.id).then(function () {
//        res.send("/flow/"+req.params.id);
//    }).catch(function(err) {
//        if (err.errno == 47) {
//            res.send("/flow/"+req.params.id);
//        } else if (err.code == 404) {
//            res.send(404,mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
//        } else {
//            res.send(406,err);
//        }
//    })
//});

app.post("/flow/:id/delete",appUtils.csrfProtection(),verifyOwner,function(req,res) {
    gister.remove(req.params.id).then(function() {
        res.writeHead(303, {
            Location: "/"
        });
        res.end();
    }).catch(function(err) {
        res.send(400,err).end();
    });
});

app.get("/flow/:id/flow",function(req,res) {
    gister.get(req.params.id).then(function(gist) {
        if (gist.files['flow.json']) {
            res.sendFile(appUtils.mapGistPath(gist.files['flow.json'].local_path),'utf-8');
        } else {
            res.status(404).send(mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
        }
    }).catch(function() {
        res.status(404).send(mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
    });
});


app.get("/add/flow",function(req,res) {
    if (!req.session.user) {
        return res.redirect("/add")
    }
    var context = {};
    context.sessionuser = req.session.user;
    res.send(mustache.render(templates.addFlow,context,templates.partials));
});

module.exports = app;
