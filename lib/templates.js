const fs = require('fs')
const path = require('path')

const mustache = require('mustache')

const renderTemplates = {}
const partialTemplates = {}
const templateDir = path.join(__dirname, '..', 'template')

fs.readdir(templateDir, function (_, files) {
    files.forEach(function (fn) {
        if (/.html$/.test(fn)) {
            const partname = fn.substring(0, fn.length - 5)
            fs.readFile(path.join(templateDir, fn), 'utf8', function (_, data) {
                if (fn[0] === '_') {
                    partialTemplates[partname] = data
                } else {
                    mustache.parse(data)
                    renderTemplates[partname] = data
                }
            })
        }
    })
})

renderTemplates.partials = partialTemplates
module.exports = renderTemplates
