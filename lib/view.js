var when = require("when");
var db = require("./db");
var appUtils = require("./utils");

var defaultProjection = {
    _id: 1,
    name: 1,
    description: 1,
    updated_at: 1,
    tags: 1,
    keywords: 1,
    author: 1,
    maintainers:1,
    gitOwners: 1,
    npmOwners:1,
    type:1,
    _rev:1,
    "dist-tags.latest":1,
    official:1,
    downloads:1,
    rating:1
};
var summaryProjection = {
    _id: 1,
    name: 1,
    updated_at: 1,
    type:1,
    "dist-tags.latest":1,
    official:1,
    rating:1,
    downloads:1,
    gitOwners: 1,
    npmOwners:1,
};

var DEFAULT_PER_PAGE = 15;

module.exports = {
 // db.getCollection('flows').aggregate([{$group:{_id:"$type",count: {$sum:1}}}])
    getForQuery: function(query) {
        var sort = query.sort || "recent";
        var perPage = Number(query.per_page) || DEFAULT_PER_PAGE;
        var numPages = Number(query.num_pages) || 1;
        var page = Number(query.page) || 1;
        var skip = (page-1)*perPage;
        var view = query.view || "full";

        var findQuery = {};
        var countQuery = {};
        var orderby = {};
        var collectionOwner;

        var preparePromise = Promise.resolve();

        if (query.collection) {
            preparePromise = new Promise(function(resolve,reject) {
                db.flows.findOne({_id:query.collection},function(err,data) {
                    if (err || ! data) {
                        reject();
                    } else {
                        collectionOwner = data.gitOwners[0];
                        resolve(data.items || []);
                    }
                });
            })
        } else {
            if (query.type) {
                if (typeof query.type === 'string' && query.type !== "all") {
                    findQuery.type = query.type;
                } else if (Array.isArray(query.type)) {
                    if (query.type.length === 1) {
                        findQuery.type = query.type[0];
                    } else if (query.type.length === 2) {
                        findQuery.type = { "$in": query.type}
                    }// if length === 0 or 3, that is the same as 'all'
                }
            }
            var typeNode = !findQuery.type || findQuery.type === 'node' || (Array.isArray(query.type) && query.type.indexOf('node') > -1);

            if (query.username || query.npm_username) {
                findQuery['$or'] = [{ gitOwners: query.username}, {npmOwners: query.npm_username || query.username}]
                countQuery['$or'] = findQuery['$or'];
            } else {
                // General search - exclude empty collections
                findQuery["$or"] = [ {items: {$exists:false}},{items:{ $elemMatch: {$exists: true } } } ];
                if (query.term) {
                    var regex = new RegExp(query.term,"i");
                    findQuery["$and"] = [
                        {"$or": findQuery["$or"]}, // non-empty collections
                        { "$or":[
                            {"keywords": regex},
                            {"owner.login": regex},
                            {"_id": regex},
                            {"name": regex},
                            {"tags": regex},
                            {"description": regex},
                            {"gitOwners":regex},
                            {"npmOwners":regex}
                        ]}
                    ];
                    delete findQuery["$or"];
                }
            }

            switch(sort) {
                case "alpha":
                    orderby = {name: 1}
                    break;
                case "recent":
                    orderby = {updated_at:-1};
                    break;
                case "rating":
                    orderby = {rating:-1};
                    break;
                case "downloads":
                    orderby = {"downloads.week":-1};
                    break;
            }

            // console.log("findQuery",JSON.stringify(findQuery));
        }
        var proj = defaultProjection;
        if (view === 'summary') {
            proj = summaryProjection;
        } else if (view === 'counts') {
            // only counts, no data
            proj = null;
        }

        return preparePromise.then(function(idList) {
            if (idList !== undefined) {
                findQuery['_id'] = countQuery['_id'] = { "$in": idList}
            }
            // console.log(JSON.stringify(findQuery));
            return new Promise((resolve,reject) => {
                var foundCount = 0;
                var totalCount = 0;
                db.flows.count(countQuery,function(err, count) {
                    if(err) {
                        reject(err);
                    }
                    totalCount = count;
                    db.flows.count(findQuery, function(err, count) {
                        if (err) {
                            reject(err);
                        }
                        foundCount = count;
                        if (proj) {
                            var dbQuery = db.flows.find(findQuery, proj);
                            if (!query.collection) {
                                dbQuery = dbQuery.sort(orderby).skip(skip).limit(perPage*numPages);
                            }
                            dbQuery.toArray(function(err,docs) {
                                if (err) {
                                    reject(err);
                                } else {
                                    var result = {
                                        total: totalCount,
                                        count: foundCount,
                                        things: docs
                                    }
                                    if (idList !== undefined) {
                                        var resultLookup =  {}
                                        docs.forEach(function(d) {
                                            resultLookup[d._id] = d;
                                        })
                                        result.things = idList.map(function(id) {
                                            return resultLookup[id]
                                        }).slice(skip,skip+(perPage*numPages));
                                        result.collectionOwner = collectionOwner;
                                    }
                                    resolve(result);
                                }
                            });
                        } else {
                            resolve({
                                total: totalCount,
                                count: foundCount,
                            });
                        }
                    });
                });
            });
        });
    },
    get: function(query,orderby,proj) {
        query = query||{};
        if (!proj) {
            proj = defaultProjection;
        }
        if (!orderby) {
            orderby = {updated_at:-1};
        }

        return new Promise((resolve,reject) => {
            db.flows.find({$query:query},proj).sort(orderby).toArray(function(err,docs) {
                if (err) {
                    reject(err);
                } else {
                    docs.forEach(function(d) {
                        d.updated_formatted = appUtils.formatShortDate(d.updated_at);
                    })
                    resolve(docs);
                }
            });
        });
    },
    getThingType: function(id) {
        return module.exports.get({_id: id},null,{type:1}).then(function(docs) {
            if (docs.length) {
                return docs[0].type;
            }
        });
    },
    getTypeCounts: function() {
        return new Promise((resolve,reject) => {
            db.flows.aggregate([
                {$match:{'$or':[{items: {$exists:false}},{items:{ $elemMatch: {$exists: true }}}]}},
                {$group:{_id:"$type",count: {$sum:1}}}
            ]).toArray(function(err,docs) {
                if (err) {
                    reject(err);
                } else {
                    var result = {};
                    docs.forEach(function(d) {
                        result[d._id] = d.count;
                    })
                    resolve(result);
                }
            })
        });
    },
    DEFAULT_PER_PAGE:DEFAULT_PER_PAGE
};
