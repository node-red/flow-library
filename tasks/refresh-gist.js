var settings = require("../config");
var gists = require("../lib/gists");
var id = process.argv[2];


if (!id) {
    console.log("Usage: node refresh-gist.js <id>");
    process.exit(1);
}

gists.refresh(id).then(function(result) {
    console.log("Success");
}).catch(function(err) {
    console.log("Failed");
})
