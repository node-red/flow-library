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
        var card = fs.readJsonSync(`${nodePath}/../${packagename}-${fileid}.json`)
        npmNodes.update(packagename, {"scorecard" : card})
        fs.removeSync(nodePath+'/../..');
        let message = 'Result: ';
        const entries = Object.entries(card);
        entries.sort();
        // Order is: Pxx Nxx Dxx
        entries.reverse();

        for (const [rule,result] of entries) {
            if (result.test) {
                message += ':white_check_mark: '
            } else {
                if (['P01','P04','P05','D02'].includes(rule)) {
                    message += ':x: '
                } else {
                    message += ':warning: '
                }
            }
        }
        events.add({
            action:"scorecard_added",
            module: packagename,
            version: version,
            message: message
        });


    })
    .catch((error) =>{
        console.log(error.message)
        events.add({
            action:"scorecard_failed",
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
