var path = require("path");
var mustache = require('mustache');
var express = require('express');
var MongoStore = require('connect-mongo')(express);

var settings = require('./settings');
var templates = require("./lib/templates");

var app = express();

app.use(express.cookieParser());

if (process.env.ENV == "PRODUCTION") {
    app.use(express.session({
        store: new MongoStore({
            username: settings.mongo.user,
            password: settings.mongo.password,
            host:settings.mongo.host,
            port:settings.mongo.port,
            db:settings.mongo.db
        }),
        key: settings.session.key,
        secret: settings.session.secret
    }));
} else {
    app.use(express.session({
        key: settings.session.key,
        secret: settings.session.secret
    }));
}
app.use(express.json());
app.use(express.urlencoded());

app.use("/",express.static(path.join(__dirname,'public')));
app.use(require("./routes/index"));
app.use(require("./routes/auth"));
app.use(require("./routes/flows"));
app.use(require("./routes/nodes"));
app.use(require("./routes/admin"));
app.use(function(req, res) {
    res.send(404,mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
});
app.listen(settings.port||20982);
console.log('Listening on port',settings.port||20982);
