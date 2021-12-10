var nodereddev = require('node-red-dev')
var crypto = require("crypto");
const npmNodes = require('./nodes');
const fs = require("fs-extra");
const events = require('./events')


function scorecard(packagename, version, nodePath) {
    var fileid = crypto.randomBytes(4).toString("hex");
    nodereddev.run(["validate",  "-p", nodePath, "-o", `${nodePath}/../${packagename}-${fileid}.json`, "-e", "true"])
    .then(require('@oclif/command/flush'))
    .then(() => {
        events.add({
            action:"Scorecard Added",
            module: packagename,
            version: version
        });
        var card = fs.readJsonSync(`${nodePath}/../${packagename}-${fileid}.json`)
        npmNodes.update(packagename, {"scorecard" : card})
        fs.removeSync(nodePath+'/../..');
    })
    .catch((error) =>{
        console.log(error.message)
        events.add({
            action:"Scorecard FAILED",
            module: packagename,
            version: version,
            message: error.message
        });
        fs.removeSync(nodePath+'/../..');
    })
}

module.exports = {
    scorecard: scorecard
}
