var settings = require("../config");
var gists = require("../lib/gists");
var id = process.argv[2];
var db = require("../lib/db")

if (!id) {
    console.log("Usage: node remove-gist.js <id>");
    process.exit(1);
}

gists.remove(id).then(function(result) {
    console.log("Success");
}).catch(function(err) {
    console.log("Failed",err);
}).then(() => { db.close() })
