var when = require("when");
var db = require("./db");

function addEvent(event) {
    return when.promise(function(resolve,reject) {
        event.ts = Date.now();
        // console.log(JSON.stringify(event));
        db.events.save(event,function(err,other) {
            if (err) {
                console.log(err,other);
            }
            resolve();
        });
    });
}

function getEvents() {
    // Return last 50 events...
    return when.promise(function(resolve,reject) {
        db.events.find({}).sort({"ts":-1}).limit(50).toArray(function(err,docs) {
            if (err) {
                reject(err);
            } else {
                docs.forEach(function(d) {
                    d.time = (new Date(d.ts)).toISOString();
                })
                resolve(docs);
            }
        });
    });
}

module.exports = {
    add: addEvent,
    get: getEvents
}
