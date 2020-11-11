const fs = require("fs");

var currentFile = JSON.parse(fs.readFileSync("catalogue.nodered.org/catalogue.json"))
var newFile = JSON.parse(fs.readFileSync("catalogue.nodered.org/catalogue.json.new"))

var currentModules = JSON.stringify(currentFile.modules);
var newModules = JSON.stringify(newFile.modules);

if (currentModules !== newModules) {
    process.exit(1)
}


