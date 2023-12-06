var settings = require("../config");
var gists = require("../lib/gists");
var id = process.argv[2];
var db = require("../lib/db")

if (!id) {
    console.log("Usage: node add-gist.js <id>");
    process.exit(1);
}

gists.add(id).then(function(result) {
    console.log("Success");
}).catch(function(err) {
    console.log(err)
}).then(() => { db.close() })
