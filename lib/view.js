var when = require("when");
var db = require("./db");


module.exports = {
    get: function(query,orderby,proj) {
        query = query||{};
        if (!proj) {
            proj = {
                _id: 1,
                name: 1,
                description: 1,
                updated_at: 1,
                tags: 1,
                keywords: 1,
                author: 1,
                owner: 1,
                type:1,
                _rev:1,
                "dist-tags.latest":1,
                official:1
            }
        }
        if (!orderby) {
            orderby = {updated_at:-1};
        }
        
        return when.promise(function(resolve,reject) {
            db.flows.find({$query:query,$orderby:orderby},proj).toArray(function(err,docs) {
                if (err) {
                    reject(err);
                } else {
                    resolve(docs);
                }
            });
        });        
    }
}
