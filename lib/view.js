var when = require("when");
var db = require("./db");

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
    downloads:1
};
var summaryProjection = {
    _id: 1,
    updated_at: 1,
    type:1,
    "dist-tags.latest":1,
    official:1
};


module.exports = {
    getForRequest: function(req) {
        var sort = req.query.sort || "most_recent";
        var perPage = Number(req.query.per_page) || 15;
        var page = Number(req.query.page) || 1;
        var skip = (page-1)*perPage;
        var view = req.query.view || "full";

        var query = {};

        if (req.query.type) {
            query.type = req.query.type;
        }
        if (req.query.keywords) {
            var kw = req.query.keywords.split(/\s*,\s*/);
            query.keywords = {"$in": kw };
        }

        var proj = defaultProjection;
        if (view === 'summary') {
            proj = summaryProjection;
        }
        var orderby = {};

        if (sort === "most_recent") {
            orderby = {updated_at:-1};
        }
        return when.promise(function(resolve,reject) {
            db.flows.find({$query:query},proj).sort(orderby).skip(skip).limit(perPage).toArray(function(err,docs) {
                if (err) {
                    reject(err);
                } else {
                    resolve(docs);
                }
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
                    resolve(docs);
                }
            });
        });
    }
};
