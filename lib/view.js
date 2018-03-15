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

var DEFAULT_PER_PAGE = 18;

module.exports = {

    getForQuery: function(query) {
        var sort = query.sort || "recent";
        var perPage = Number(query.per_page) || DEFAULT_PER_PAGE;
        var numPages = Number(query.num_pages) || 1;
        var page = Number(query.page) || 1;
        var skip = (page-1)*perPage;
        var view = query.view || "full";

        var findQuery = {};

        if (query.type && query.type !== "all") {
            findQuery.type = query.type;
        }
        
        if (query.term) {
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

        var proj = defaultProjection;
        if (view === 'summary') {
            proj = summaryProjection;
        } else if (view === 'counts') {
            // only counts, no data
            proj = null;
        }
        var orderby = {};

        switch(sort) {
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

        return when.promise(function(resolve,reject) {
            var foundCount = 0;
            var totalCount = 0;
            db.flows.count({},function(err, count) {
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
                        db.flows.find(findQuery, proj).sort(orderby).skip(skip).limit(perPage*numPages).toArray(function(err,docs) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve({
                                    total: totalCount,
                                    count: foundCount,
                                    things: docs
                                });
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
    },
    get: function(query,orderby,proj) {
        query = query||{};
        if (!proj) {
            proj = defaultProjection;
        }
        if (!orderby) {
            orderby = {updated_at:-1};
        }

        return when.promise(function(resolve,reject) {
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
    DEFAULT_PER_PAGE:DEFAULT_PER_PAGE
};
