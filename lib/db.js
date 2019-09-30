const settings = require("../config");

const mongojs = require('mongojs');

const collections = ["flows","nodes","users","tags","events","ratings"];
const db = mongojs(settings.mongo.url,collections);

db.flows.ensureIndex({updated_at:-1});
db.flows.ensureIndex({keywords:1});
db.flows.ensureIndex({"maintainers.name":1});
db.flows.ensureIndex({"npmOwners":1});
db.flows.ensureIndex({"gitOwners":1});
db.flows.ensureIndex({"rating.score": -1,"rating.count":-1});
db.flows.ensureIndex({"downloads.week": -1});

db.ratings.ensureIndex({module:1});
db.ratings.ensureIndex({user: 1, module:1});

if (process.env.FLOW_ENV !== "PRODUCTION") {
    collections.forEach(col => {
        var collection = db[col];
        for (var x in collection) {
            if (typeof collection[x] === 'function' && !/^_/.test(x)) {
                db[col]["__"+x] = db[col][x];
                let origFunc = db[col][x];
                let signature = col+"."+x;
                db[col][x] = function() {
                    console.log(" ",signature);//arguments[0]);
                    return origFunc.apply(db[col],arguments);
                }
            }
        }
    })
}

module.exports = db;
