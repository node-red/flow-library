const fs = require("fs");

var currentFile = JSON.parse(fs.readFileSync("catalogue.nodered.org/catalogue.json"))
var newFile = JSON.parse(fs.readFileSync("catalogue.nodered.org/catalogue.json.new"))

var currentModules = JSON.stringify(currentFile.moduels);
var newModules = JSON.stringify(newFile.moduels);

if (currentModules !== newModules) {
    process.exit(1)
}


