const express = require("express");
const mustache = require('mustache');

const settings = require("../config");
const appUtils = require("../lib/utils");
const db = require("../lib/db");
const templates = require("../lib/templates");
const viewster = require("../lib/view");
const collections = require("../lib/collections");
const users = require("../lib/users");
const app = express();
const marked = require("marked");


function isCollectionOwned(collection,user) {
    for (var i=0;i<collection.gitOwners.length;i++) {
        if (collection.gitOwners[i] == user) {
            return true;
        }
    }
    return false;
}

function verifyOwner(req,res,next) {
    if (!req.session.user) {
        res.status(403).end();
    // } else if (settings.admins.indexOf(req.session.user.login) != -1) {
    //     next();
    } else {
        collections.get(req.params.id).then(function(collection) {
            if (isCollectionOwned(collection,req.session.user.login)) {
                next();
            } else {
                res.status(403).end();
            }
        }).catch(function() {
            res.status(403).end();
        });
    }
}


app.get("/add/collection",function(req,res) {
    if (!req.session.user) {
        return res.redirect("/add")
    }
    var context = {};
    context.sessionuser = req.session.user;
    res.send(mustache.render(templates.addCollection,context,templates.partials));
});

app.post("/collection", function(req,res) {

    if (req.session.accessToken) {
        var collection = {
            gitOwners: [req.session.user.login],
            name: req.body.title,
            description: req.body.description,
            items: req.body.items || []
        };
        if (collection.items.length === 0) {
            collection.empty = true;
        }

        collections.create(collection).then(function(id) {
            res.send("/collection/"+id);
        }).catch(function(err) {
            console.log("Error creating collection:",err);
            res.send(err);
        });
    } else {
        res.status(403).end();
    }
});

app.get("/collection/:id",  appUtils.csrfProtection(), function(req,res) {
    var context = {};
    context.sessionuser = req.session.user;
    context.query = {
        type: "node,flow",
        hideOptions: true,
        collection: req.params.id,
        ignoreQueryParams: true
    };
    collections.get(req.params.id).then(function(collection) {
        context.collection = collection;
        marked(collection.description,{},function(err,content) {
            collection.description = content;
            collection.updated_at_since = appUtils.formatDate(collection.updated_at);
            collection.item_count = collection.items.length;
            if (collection.item_count > 0) {
                collection.item_count_label = collection.items.length + " thing" + (collection.items.length === 1 ? "":"s");
            }

            if (context.sessionuser) {
                context.owned = isCollectionOwned(collection,context.sessionuser.login);
            }
            context.csrfToken = req.csrfToken();
            res.send(mustache.render(templates.collection, context, templates.partials));
        });
    }).catch(function(err) {
        res.send(404).end();
    })
});

app.get("/collection/:id/edit", appUtils.csrfProtection(), verifyOwner, function(req,res) {
    var context = {};
    context.csrfToken = req.csrfToken();
    context.sessionuser = req.session.user;
    collections.get(req.params.id).then(function(collection) {
        context.collection = collection;
        res.send(mustache.render(templates.addCollection,context,templates.partials));
        res.end();
    }).catch(function(err) {
        console.log("err",err)
        res.send(400,err).end();
    })
})

app.put("/collection/:id", appUtils.csrfProtection(),verifyOwner, function(req,res) {
    if (req.session.accessToken) {
        var collection = {
            _id: req.params.id,
        };
        if (req.body.title) {
            collection.name = req.body.title;
        }
        if (req.body.hasOwnProperty('description')) {
            collection.description = req.body.description;
        }
        if (req.body.hasOwnProperty('items')) {
            collection.items = req.body.items;
        }
        collections.update(collection).then(function(id) {
            res.send("/collection/"+id);
        }).catch(function(err) {
            console.log("Error updating collection:",err);
            res.send(err);
        });
    } else {
        res.status(403).end();
    }
});

app.post("/collection/:id/delete", appUtils.csrfProtection(), verifyOwner, function(req,res) {
    collections.remove(req.params.id).then(function() {
        res.writeHead(303, {
            Location: "/"
        });
        res.end();
    }).catch(function(err) {
        console.log("err",err)
        res.send(400,err).end();
    })
})

app.post("/collection/:id/add/:scope(@[^\\/]{1,})?/:thingId([^@][^\\/]{1,})", verifyOwner, function(req,res) {
    var thingId = req.params.thingId;
    if (req.params.scope) {
        thingId = req.params.scope+"/"+thingId;
    }
    collections.addItem(req.params.id,thingId).then(function() {
        res.sendStatus(200).end();
    }).catch(function(err) {
        console.log("err",err)
        res.send(400,err).end();
    })
});

app.post("/collection/:id/delete/:scope(@[^\\/]{1,})?/:thingId([^@][^\\/]{1,})", appUtils.csrfProtection(), verifyOwner, function(req,res) {
    var thingId = req.params.thingId;
    if (req.params.scope) {
        thingId = req.params.scope+"/"+thingId;
    }
    collections.removeItem(req.params.id,thingId).then(function() {
        res.sendStatus(200).end();
    }).catch(function(err) {
        console.log("err",err)
        res.send(400,err).end();
    })
});

module.exports = app;
