var settings = require('./settings');
var gister = require("./lib/gists");
var github = require("./lib/github");

var fs = require("fs");
var path = require("path");

var marked = require('marked');
var mustache = require('mustache');
var when = require("when");
var OAuth2 = require("oauth").OAuth2;

var express = require('express');
var MongoStore = require('connect-mongo')(express);

var oauth = new OAuth2(settings.github.clientId, settings.github.secret, "https://github.com/", "login/oauth/authorize", "login/oauth/access_token");

var app = express();

app.use(express.cookieParser());

if (process.env.ENV == "PRODUCTION") {
    app.use(express.session({
        store: new MongoStore({
            username: settings.mongo.user,
            password: settings.mongo.password,
            host:settings.mongo.host,
            port:settings.mongo.port,
            db:settings.mongo.db
        }),
        key: settings.session.key,
        secret: settings.session.secret
    }));
} else {
    app.use(express.session({
        key: settings.session.key,
        secret: settings.session.secret
    }));
}
app.use(express.json());
app.use(express.urlencoded());

var renderTemplates = {};
var partialTemplates = {};

fs.readdir(path.join(__dirname,"template"),function(err,files) {
    files.forEach(function(fn) {
        if (/.html$/.test(fn)) {
            var partname = fn.substring(0,fn.length-5);
            fs.readFile(path.join(__dirname,"template",fn),'utf8',function(err,data) {
                if (fn[0] == "_") {
                    partialTemplates[partname] = data;
                } else {
                    mustache.parse(data);
                    renderTemplates[partname] = data;
                }
            });
        }
    });
});

app.use("/",express.static(path.join(__dirname,'public')));

app.use(function(req, res, next) {
    var start = Date.now();
    res.on('header', function() {
        var duration = Date.now() - start;
        //console.log(req.path,duration);
    });
    next();
});


app.get("/login",function(req,res) {
    if (!req.session.accessToken) {
        if (req.query.return) {
            req.session.returnPath = req.query.return;
        } else {
            delete req.session.returnPath;
        }
        res.writeHead(303, {
            Location: oauth.getAuthorizeUrl({ 
                redirect_uri: settings.github.authCallback,
                scope: "gist"
            })
        });
        res.end();
        return;
    } else {
        res.writeHead(200);
        res.end(JSON.stringify(req.session.user));
        return;
    }
});
app.get("/login/callback",function(req,res) {
    oauth.getOAuthAccessToken(req.query.code, {}, function (err, access_token, refresh_token) {
        if (err) {
            console.log(err);
            res.writeHead(500);
            res.end(err + "");
            return;
        }
        req.session.accessToken = access_token;
        
        github.getAuthedUser(req.session.accessToken).then(function(user) {
            req.session.user = {
                login: user.login,
                avatar_url: user.avatar_url, 
                url: user.html_url,
                name: user.name
            }
            res.writeHead(303, {
                Location: req.session.returnPath||"/"
            });
            res.end();
        }).otherwise(function(err) {
            if (err) {
                res.writeHead(err.code);
                res.end(err + "");
            }
        });
    });
});

app.get("/",function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    when.all([
        gister.getAll(),
        gister.getAllTags()
    ]).then(function(results) {
        context.recentGists = results[0];
        context.popularTags = results[1];
        res.send(mustache.render(renderTemplates.index,context,partialTemplates));
    }).otherwise(function(err) {
        context.err = err;
        context.recentGists = [];
        res.send(mustache.render(renderTemplates.index,context,partialTemplates));
    });
});

function formatDate(dateString) {
    var now = new Date();
    var d = new Date(dateString);
    var delta = now.getTime() - d.getTime();
    
    delta /= 1000;
    
    if (delta < 60) {
        return "seconds ago";
    }
    
    delta = Math.floor(delta/60);
    
    if (delta < 10) { 
        return "minutes ago";
    }
    if (delta < 60) {
        return delta+" minutes ago";
    }
    
    delta = Math.floor(delta/60);
    
    if (delta < 24) {
        return delta+" hour"+(delta>1?"s":"")+" ago";
    }
    
    delta = Math.floor(delta/24);
    
    if (delta < 7) {
        return delta+" day"+(delta>1?"s":"")+" ago";
    }
    var weeks = Math.floor(delta/7);
    var days = delta%7;
    
    if (weeks < 4) {
        if (days == 0) {
            return weeks+" week"+(weeks>1?"s":"")+" ago";
        } else {
            return weeks+" week"+(weeks>1?"s":"")+", "+days+" day"+(days>1?"s":"")+" ago";
        }
    }
    
    var months = Math.floor(weeks/4);
    weeks = weeks%4;
    
    if (months < 12) {
        if (weeks == 0) {
            return months+" month"+(months>1?"s":"")+" ago";
        } else {
            return months+" month"+(months>1?"s":"")+", "+weeks+" week"+(weeks>1?"s":"")+" ago";
        }
    }
    
    var years = Math.floor(months/12);
    months = months%12;
    
    if (months == 0) {
        return years+" year"+(years>1?"s":"")+" ago";
    } else {
        return years+" year"+(years>1?"s":"")+", "+months+" month"+(months>1?"s":"")+" ago";
    }
    
}
app.post("/flow", function(req,res) {
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
    gister.create(req.session.accessToken,gist_post,req.body.tags).then(function(id) {
        res.send("/flow/"+id);
    }).otherwise(function(err) {
        console.log("Error creating flow:",err);
        res.send(err);
    });
});
app.get("/flow/:id",function(req,res) {

    gister.get(req.params.id).then(function(gist) {
        gist.sessionuser = req.session.user;
        gist.flow = "";
        
        gist.created_at_since = formatDate(gist.created_at);
        gist.updated_at_since = formatDate(gist.updated_at);
        gist.refreshed_at_since = formatDate(gist.refreshed_at);
        
        if (gist.created_at_since == gist.updated_at_since) {
            delete gist.updated_at_since;
        }
        gist.owned = (gist.sessionuser && gist.owner.login == gist.sessionuser.login);
        
        gist.nodeTypes = [];
        if (gist.files['flow-json']) {
            gist.flow = fs.readFileSync(gist.files['flow-json'],'utf-8');
            var nodes = JSON.parse(gist.flow);
            var nodeTypes = {};
            for (var n in nodes) {
                var node = nodes[n];
                nodeTypes[node.type] = (nodeTypes[node.type]||0)+1;
            };
            gist.nodeTypes = [];
            for (var nt in nodeTypes) {
                gist.nodeTypes.push({type:nt,count:nodeTypes[nt]});
            }
            gist.nodeTypes.sort(function(a,b) {
                if (a.type>b.type) return 1;
                if (a.type<b.type) return -1;
                return 0;
            });
        }
        fs.readFile(gist.files['README-md'],'utf-8',function(err,data) {
            marked(data,{},function(err,content) {
                gist.readme = content;
                res.send(mustache.render(renderTemplates.gist,gist,partialTemplates));
            });
        });
    }).otherwise(function(err) {
        console.log("Error loading flow:",err);
        try {
            res.send(404,mustache.render(renderTemplates['404'],{sessionuser:req.session.user},partialTemplates));
        } catch(err) {
            console.log(err);
        }
    });
});

app.post("/flow/:id/tags",function(req,res) {
    // TODO: verify req.session.user == gist owner
    gister.updateTags(req.params.id,req.body.tags).then(function() {
        res.send(200);
    }).otherwise(function(err) {
        console.log("Error updating tags:",err);
        res.send(200);
    });
    
});

app.post("/flow/:id/refresh",function(req,res) {
    gister.refresh(req.params.id).then(function () {
        res.send("/flow/"+req.params.id);
    }).otherwise(function(exists) {
        if (exists) {
            res.send(304);
        } else {
            res.send(404,mustache.render(renderTemplates['404'],{sessionuser:req.session.user},partialTemplates));
        }
    })
});

app.post("/flow/:id/add",function(req,res) {
    gister.add(req.params.id).then(function () {
        res.send("/flow/"+req.params.id);
    }).otherwise(function(err) {
        if (err.errno == 47) {
            res.send("/flow/"+req.params.id);
        } else if (err.code == 404) {
            res.send(404,mustache.render(renderTemplates['404'],{sessionuser:req.session.user},partialTemplates));
        } else {
            res.send(406,err);
        }
    })
});

app.post("/flow/:id/delete",function(req,res) {
    gister.remove(req.params.id).then(function() {
        res.send(200);
    }).otherwise(function(err) {
        res.send(200,err);
    });
});

app.get("/flow/:id/flow",function(req,res) {
    gister.get(req.params.id).then(function(gist) {
        if (gist.files['flow.json']) {
            res.sendfile(gist.files['flow.json'].local_path,'utf-8');
        } else {
            res.send(404,mustache.render(renderTemplates['404'],{sessionuser:req.session.user},partialTemplates));
        }
    }).otherwise(function() {
        res.send(404,mustache.render(renderTemplates['404'],{sessionuser:req.session.user},partialTemplates));
    });
});

app.get("/add",function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    res.send(mustache.render(renderTemplates['add'],context,partialTemplates));
});

app.get("/user/:id",function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    when.join(gister.getUser(req.params.id),gister.getForUser(req.params.id)).then(function(values) {
        context.user = values[0];
        context.gists = values[1];
        res.send(mustache.render(renderTemplates.user,context,partialTemplates));
    }).otherwise(function(err) {
        console.log(err);
        res.send(404,mustache.render(renderTemplates['404'],context,partialTemplates));
    });
});

app.get("/tag/:id",function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    gister.getForTag(req.params.id).then(function(gists) {
        context.tag = req.params.id;
        context.gists = gists;
        res.send(mustache.render(renderTemplates.tag,context,partialTemplates));
    }).otherwise(function(err) {
        console.log(err);
        res.send(404,mustache.render(renderTemplates['404'],context,partialTemplates));
    });
});

app.get("/search",function(req,res) {
    var search = req.query.s;
    var context = {};

    var si = require('search-index');
    var q = {};
    q['query'] = search.split(" ");
    q['offset'] = 0;
    q['pageSize'] = 25;
    si.search(q,function(msg) {
        if (msg.hits) {
            context.gists = msg.hits.map(function(res) {
                return {id:res.id,description:res.document.title};
            });
        }
        context.search = search;
        context.sessionuser = req.session.user;
        res.send(mustache.render(renderTemplates.search,context,partialTemplates));
    });

    
});

app.use(function(req, res) {
    res.send(404,mustache.render(renderTemplates['404'],{sessionuser:req.session.user},partialTemplates));
});

app.listen(20982);
console.log('Listening on port 20982');
