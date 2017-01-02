var mustache = require('mustache');
var fs = require("fs");
var path = require("path");


var renderTemplates = {};
var partialTemplates = {};
var templateDir = path.join(__dirname,"..","template");

fs.readdir(templateDir,function(err,files) {
    files.forEach(function(fn) {
        if (/.html$/.test(fn)) {
            var partname = fn.substring(0,fn.length-5);
            fs.readFile(path.join(templateDir,fn),'utf8',function(err,data) {
                if (fn[0] == "_") {
                    partialTemplates[partname] = data;
                } else {
                    mustache.parse(data);
                    renderTemplates[partname] = data;
                }
            });
        }
    });
});

renderTemplates.partials = partialTemplates;
module.exports = renderTemplates;
