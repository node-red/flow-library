var when = require("when");
var db = require("./db");
var appUtils = require("./utils");

var defaultProjection = {
    _id: 1,
    name: 1,
    description: 1,
    summary: 1,
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
    summary: 1,
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


let _typeCounts = null;
let _typeCountLastUpdate = 0;
const TYPE_COUNT_CACHE_AGE = 1000*60*10; // 10 minutes
function getTypeCounts() {
    return new Promise((resolve,reject) => {
        if (!_typeCounts || (Date.now() - _typeCountLastUpdate > TYPE_COUNT_CACHE_AGE)) {
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
                    _typeCounts = result;
                    _typeCountLastUpdate = Date.now();
                    resolve(result);
                }
            })
        } else {
            resolve(_typeCounts)
        }
    });
}

let _typeCache = {};
function getThingType(id) {
    if (!id) {
        return Promise.resolve(null);
    } else if (_typeCache[id]) {
        return Promise.resolve(_typeCache[id])
    }
    return module.exports.get({_id: id},null,{type:1}).then(function(docs) {
        if (docs.length) {
            _typeCache[id] = docs[0].type;
            return docs[0].type;
        }
    });
}

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
        var collectionOwners;

        var preparePromise = Promise.resolve();

        if (query.collection) {
            preparePromise = new Promise(function(resolve,reject) {
                db.flows.find({_id:query.collection},null,null,function(err,data) {
                    if (err || ! data || data.length === 0) {
                        reject();
                    } else {
                        collectionOwners = data[0].gitOwners;
                        resolve(data[0].items || []);
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
            // Unused?
            // only counts, no data
            proj = null;
        }

        return preparePromise.then(function(idList) {
            if (idList !== undefined) {
                findQuery['_id'] = countQuery['_id'] = { "$in": idList}
            }
            // console.log(JSON.stringify(findQuery));
            return new Promise((resolve,reject) => {
                var dbQuery = db.flows.find(findQuery, proj);
                if (!query.collection) {
                    dbQuery = dbQuery.sort(orderby).skip(skip).limit(perPage*numPages);
                }
                dbQuery.count(function(err,foundCount) {
                    if (proj) {
                        dbQuery.toArray(function(err,docs) {
                            if (err) {
                                reject(err);
                            } else {
                                if (process.env.FLOW_ENV !== "PRODUCTION") {
                                    console.log(findQuery, "found="+foundCount, "count="+docs.length)
                                }
                                var result = {
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
                                    result.collectionOwners = collectionOwners;
                                }
                                resolve(result);
                            }
                        });
                    } else {
                        resolve({
                            count: foundCount
                        });
                    }
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
    getThingType: getThingType,
    getTypeCounts: getTypeCounts,
    resetTypeCountCache: function() { _typeCounts = null; },
    DEFAULT_PER_PAGE:DEFAULT_PER_PAGE
};
