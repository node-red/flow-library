var express = require("express");
var mustache = require('mustache');
var marked = require('marked');
var fs = require("fs");

var settings = require("../config");
var gister = require("../lib/gists");
var appUtils = require("../lib/utils");
var npmNodes = require("../lib/nodes");
var templates = require("../lib/templates");

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
        }).otherwise(function(err) {
            console.log("Error creating flow:",err);
            res.send(err);
        });
    } else {
        res.status(403).end();
    }
});

app.get("/flow/:id",function(req,res) {
    gister.get(req.params.id).then(function(gist) {
        gist.sessionuser = req.session.user;
        gist.flow = "";

        gist.created_at_since = appUtils.formatDate(gist.created_at);
        gist.updated_at_since = appUtils.formatDate(gist.updated_at);
        gist.refreshed_at_since = appUtils.formatDate(gist.refreshed_at);

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
                    res.send(mustache.render(templates.gist,gist,templates.partials));
                });
            });
        });
    }).otherwise(function(err) {
        console.log("Error loading flow:",err);
        try {
            res.status(404).send(mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
        } catch(err2) {
            console.log(err2);
        }
    });
});

function verifyOwner(req,res,next) {
    if (!req.session.user) {
        res.status(403).end();
    } else if (settings.admins.indexOf(req.session.user.login) != -1) {
        next();
    } else {
        gister.get(req.params.id).then(function(gist) {
            console.log(gist);
            if (gist.owner.login == req.session.user.login) {
                next();
            } else {
                res.status(403).end();
            }
        }).otherwise(function() {
            console.log("NONONO");
            res.status(403).end();
        });
    }
}

app.post("/flow/:id/tags",verifyOwner,function(req,res) {
    // TODO: verify req.session.user == gist owner
    gister.updateTags(req.params.id,req.body.tags).then(function() {
        res.status(200).end();
    }).otherwise(function(err) {
        console.log("Error updating tags:",err);
        res.status(200).end();
    });

});

app.post("/flow/:id/refresh",verifyOwner,function(req,res) {
    gister.refresh(req.params.id).then(function () {
        res.send("/flow/"+req.params.id);
    }).otherwise(function(exists) {
        if (exists) {
            res.status(304).end();
        } else {
            res.status(404).send(mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
        }
    });
});

//app.post("/flow/:id/add",function(req,res) {
//    gister.add(req.params.id).then(function () {
//        res.send("/flow/"+req.params.id);
//    }).otherwise(function(err) {
//        if (err.errno == 47) {
//            res.send("/flow/"+req.params.id);
//        } else if (err.code == 404) {
//            res.send(404,mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
//        } else {
//            res.send(406,err);
//        }
//    })
//});

app.post("/flow/:id/delete",verifyOwner,function(req,res) {
    gister.remove(req.params.id).then(function() {
        res.status(200).end();
    }).otherwise(function(err) {
        res.send(200,err);
    });
});

app.get("/flow/:id/flow",function(req,res) {
    gister.get(req.params.id).then(function(gist) {
        if (gist.files['flow.json']) {
            res.sendFile(appUtils.mapGistPath(gist.files['flow.json'].local_path),'utf-8');
        } else {
            res.status(404).send(mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
        }
    }).otherwise(function() {
        res.status(404).send(mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
    });
});

app.get("/add",function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    res.send(mustache.render(templates.add,context,templates.partials));
});


module.exports = app;
