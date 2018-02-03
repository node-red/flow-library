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

var app = express();


var iconCache = {};

var csrfProtection = csrf({ cookie: true });

app.get("/nodes",function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    npmNodes.getPopularByDownloads().then(function(nodes) {
        context.nodes = nodes;
        res.send(mustache.render(templates.nodes,context,templates.partials));
    }).otherwise(function(err) {
        if (err) {
            console.log("error loading nodes:",err);
        }
        res.status(404).send(mustache.render(templates['404'],context,templates.partials));
    });
});

app.get("/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})",csrfProtection,function(req,res) {
    var id = req.params.id;
    if (req.params.scope) {
        id = req.params.scope+"/"+id;
    }
    npmNodes.get(id).then(function(node) {
        node.sessionuser = req.session.user;
        node.csrfToken = req.csrfToken();
        node.pageTitle = req.params.id;
        //console.log(node);
        node.updated_at_since = appUtils.formatDate(node.updated_at);
        iconCache[id] = {};
        node.types = [];

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
            }
            var userLogin = req.session.user ? req.session.user.login : null;
            ratings.get(id, userLogin).then(function(rating) {
                if (rating) {
                    rating.score = (rating.total/rating.count * 10 / 10).toFixed(1);
                    node.rating = rating;
                }
                res.send(mustache.render(templates.node,node,templates.partials));
            });
        });

    }).otherwise(function(err) {
        if (err) {
            console.log("error loading node:",err);
        }
        res.status(404).send(mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
    });
});

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

app.post("/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/report",csrfProtection,function(req,res) {
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

app.post("/node/:scope(@[^\\/]{1,})?/:id([^@][^\\/]{1,})/rate", csrfProtection,function(req,res) {
    var id = req.params.id;
    if (req.params.scope) {
        id = req.params.scope+"/"+id;
    }
    if (req.session.user) {
        var rating = {
            user: req.session.user.login,
            module: req.params.id
        }
        if (Number(req.body.rating) == 0) {
            ratings.remove(rating).then(function() {
                return events.add({
                    action:"module_rating",
                    module: id,
                    message:"removed",
                    user: req.session.user.login
                });
            });
        } else {
            var version = null;
            npmNodes.get(id).then(function(node) {
                version = node.versions.latest.version;
                rating.rating = +req.body.rating;
                rating.time = new Date();
                rating.version = version;
                return ratings.save(rating);
            }).then(function() {
                return ratings.get(id);
            }).then(function(rating) {
                var nodeRating = {
                    score: rating.total/rating.count,
                    count: rating.count
                }
                return npmNodes.update(id,{rating: nodeRating});
            }).then(function() {
                return events.add({
                    action:"module_rating",
                    module: id,
                    message:req.body.rating,
                    user: req.session.user.login,
                    version: version
                });
            }).otherwise(function(err) {
                console.log("error rating node module: "+id,err);
            })
        }
    }
    res.writeHead(303, {
        Location: "/node/"+id
    });
    res.end();
});


module.exports = app;
