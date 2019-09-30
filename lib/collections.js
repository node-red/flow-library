const db = require("./db");
const crypto = require("crypto");
const view = require("./view");
const users = require("./users");

function createCollection(collection) {
    return new Promise((resolve,reject) => {
        var collectionID = crypto.randomBytes(9).toString('base64').replace(/\//g,"-").replace(/\+/g,"_")
        var tags = collection.tags || [];
        for (var i=0;i<tags.length;i++) {
            db.tags.update({_id:tags[i]},{$inc:{count:1}},{upsert:true});
        }
        collection.type = "collection";
        collection._id = collectionID;
        collection.updated_at = (new Date()).toISOString();
        collection.summary = generateSummary(collection.description);
        db.flows.save(collection, function(err) {
            view.resetTypeCountCache();
            if (err) {
                reject(err);
            } else {
                resolve(collectionID);
            }
        })
    });
}

function removeCollection(id) {
    return getCollection(id).then(function(collection) {
        var tags = collection.tags || [];
        for (var i=0;i<tags.length;i++) {
            db.tags.update({_id:tags[i]},{$inc:{count:-1}});
        }
        db.tags.remove({count:{$lte:0}});
        return new Promise((resolve,reject) => {
            db.flows.remove({_id:id}, function(err) {
                view.resetTypeCountCache();
                if (err) { reject(err) }
                else { resolve();}
            });
        });
    });
}

function getCollection(id) {
    return new Promise((resolve,reject) => {
        db.flows.find({_id:id},null,null,function(err,data) {
            if (err||!data||data.length === 0 ) {
                reject();
            } else {
                resolve(data[0]);
            }
        });
    });
}

function generateSummary(desc) {
    var summary = (desc||"").split("\n")[0];
    var re = /\[(.*?)\]\(.*?\)/g;
    var m;
    while((m=re.exec(summary)) !== null) {
        summary = summary.substring(0,m.index)+m[1]+summary.substring(m.index+m[0].length);
    }

    if (summary.length > 150) {
        summary = summary.substring(0,150).split("\n")[0]+"...";
    }
    return summary;
}

function updateCollection(collection) {
    return new Promise((resolve,reject) => {
        delete collection.type;
        collection.updated_at = (new Date()).toISOString();
        var errors = {};
        if (collection.hasOwnProperty('name')) {
            if (collection.name.trim().length < 10) {
                errors['name'] = "Must be at least 10 characters"
            }
        }
        if (collection.hasOwnProperty('description')) {
            if (collection.description.trim().length < 30) {
                errors['description'] = "Must be at least 30 characters"
            }
            collection.summary = generateSummary(collection.description);
        }
        var userCheckPromise;
        if (collection.hasOwnProperty('gitOwners')) {
            userCheckPromise = users.checkAllExist(collection.gitOwners).then(function(unmatched) {
                if (unmatched && unmatched.length > 0) {
                    errors['owners'] = unmatched;
                }
            })
        } else {
            userCheckPromise = Promise.resolve();
        }

        userCheckPromise.then(() => {
            if (Object.keys(errors).length > 0) {
                reject(errors);
                return;
            }
            db.flows.update(
                {_id:collection._id},
                {$set: collection},
                function(err) {
                    if (err) {
                        //console.log(err);
                        util.log("Update collection",collection._id,"ERR",err.toString())
                        reject({name:collection._id,error:err});
                    } else {
                        resolve(collection._id);
                    }
                }
            )
        }).catch(err => {
            reject(err);
        });
    })
}

function addItem(collectionId, itemId) {
    return new Promise((resolve,reject) => {
        db.flows.update(
            { _id: collectionId},
            { $addToSet: { items: itemId }},
            function(err) {
                if (err) {
                    //console.log(err);
                    util.log("Adding collection item",collectionId,itemId,"ERR",err.toString())
                    reject({name:collectionId,error:err});
                } else {
                    resolve(collectionId);
                }
            }
        )
    });
}


function removeItem(collectionId, itemId) {
    return new Promise((resolve,reject) => {
        db.flows.update(
            { _id: collectionId},
            { $pull: { items: itemId }},
            function(err) {
                if (err) {
                    //console.log(err);
                    util.log("Remove collection item",collectionId,itemId,"ERR",err.toString())
                    reject({name:collectionId,error:err});
                } else {
                    resolve(collectionId);
                }
            }
        )
    });
}

function getSiblings(collectionId, itemId) {
    return new Promise((resolve,reject) => {
        db.flows.aggregate([
            {$match:{_id:collectionId}},
            {$project: {
                name:1,
                items:1,
                index: {$indexOfArray: ["$items", itemId]}
            }},
            { $project: {
                name:1,
                items:1,
                prevIndex: {$subtract:["$index",1]},
                nextIndex: {$add:["$index",1]}
            }},
            { $project: {
                name:1,
                prev:{$cond: { if: { $gte: [ "$prevIndex", 0 ] }, then: {$arrayElemAt: ["$items", "$prevIndex"]}, else: '' }},
                next:{$arrayElemAt: ["$items", "$nextIndex"]}
            }}
        ]).toArray((err,docs) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(docs);
        });
    }).then(result => {
        if (result && result.length > 0) {
            return Promise.all([
                view.getThingType(result[0].prev).then(type => {result[0].prevType = type}),
                view.getThingType(result[0].next).then(type => {result[0].nextType = type}),
            ]).then(() => {
                return result
            })
        } else {
            return result;
        }
    });
}


module.exports = {
    get: getCollection,
    update: updateCollection,
    remove: removeCollection,
    create: createCollection,
    addItem: addItem,
    removeItem: removeItem,
    getSiblings: getSiblings
}
