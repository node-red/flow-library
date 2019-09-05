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
    owner: 1,
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
    downloads:1
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
                        collectionOwner = data.owner.login;
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
            if (query.username || query.npm_username) {
                findQuery["$or"] = [];
                if (query.username) {
                    findQuery["$or"].push({"owner.login":query.username})
                }
                findQuery["$or"].push({"maintainers": {$elemMatch: {"name": query.npm_username||query.username}}})
                countQuery["$or"] = findQuery["$or"];
                if (findQuery.type) {
                    countQuery.type = findQuery.type;
                }
            } else if (query.term) {
                var regex = new RegExp(query.term,"i");
                findQuery["$or"] = [
                    {"keywords": regex},
                    {"owner.login": regex},
                    {"_id": regex},
                    {"name": regex},
                    {"tags": regex},
                    {"description": regex},
                    {"maintainers":{$elemMatch:{name:regex}}}
                ];
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
            console.log(findQuery);
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

    getTypeCounts: function() {
        return new Promise((resolve,reject) => {
            db.flows.aggregate([{$group:{_id:"$type",count: {$sum:1}}}]).toArray(function(err,docs) {
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
