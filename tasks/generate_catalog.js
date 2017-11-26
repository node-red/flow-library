var settings = require('../config');
var viewster = require("../lib/view");
var db = require("../lib/db");

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
        delete t.updated_formatted;
        t.url = "http://flows.nodered.org/node/"+t.id;
    })

    console.log('{');
    console.log('   "name": "Node-RED Community catalogue",');
    console.log('   "updated_at": "'+(new Date()).toISOString()+'",');
    console.log('   "modules":');
    console.log(JSON.stringify(things));
    console.log('}');
    db.close();
}).otherwise(function(err) {
    console.error(err);
    process.exit(1);
});
