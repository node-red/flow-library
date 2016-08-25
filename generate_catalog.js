var settings = require('./settings');
var viewster = require("./lib/view");


viewster.get({type:'node'},null,{
    _id: 1,
    updated_at: 1,
    "dist-tags.latest":1,
    official:1,
    description:1,
    keywords:1
}

).then(function(things) {
    things.forEach(function(t) {
        t.id = t._id;
        delete t._id;
        t.version = t['dist-tags'].latest;
        delete t['dist-tags'];
        t.url = "http://flows.nodered.org/node/"+t.id;
    })
    console.log(JSON.stringify(things));
}).otherwise(function(err) {
    console.log(err);
});
