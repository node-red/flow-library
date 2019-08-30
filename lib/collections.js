const db = require("./db");
const crypto = require("crypto");


function createCollection(collection) {
    return new Promise((resolve,reject) => {
        var collectionID = crypto.randomBytes(16).toString('hex');
        var tags = collection.tags || [];
        for (var i=0;i<tags.length;i++) {
            db.tags.update({_id:tags[i]},{$inc:{count:1}},{upsert:true});
        }
        collection.type = "collection";
        collection._id = collectionID;
        collection.updated_at = (new Date()).toISOString();
        db.flows.save(collection, function(err) {
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
                if (err) { reject(err) }
                else { resolve();}
            });
        });
    });
}

function getCollection(id) {
    return new Promise((resolve,reject) => {
        db.flows.findOne({_id:id},function(err,data) {
            if (err||!data) {
                reject();
            } else {
                resolve(data);
            }
        });
    });
}

function updateCollection(collection) {
    return new Promise((resolve,reject) => {
        delete collection.type;
        collection.updated_at = (new Date()).toISOString();
        // console.log("Updating",collection)
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


module.exports = {
    get: getCollection,
    update: updateCollection,
    remove: removeCollection,
    create: createCollection,
    addItem: addItem,
    removeItem: removeItem
}
