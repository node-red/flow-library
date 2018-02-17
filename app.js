var path = require("path");
var mustache = require('mustache');
var express = require('express');
var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var serveStatic = require('serve-static');
var settings = require('./config');
var templates = require("./lib/templates");

var events = require("./lib/events");

var app = express();

app.use(cookieParser());

if (process.env.FLOW_ENV == "PRODUCTION") {
    app.use(session({
        store: new MongoStore({
            url: settings.mongo.url,
            touchAfter: 24 * 3600
        }),
        key: settings.session.key,
        secret: settings.session.secret,
        saveUninitialized: false,
        resave: false
    }));
} else {
    app.use(session({
        key: settings.session.key,
        secret: settings.session.secret,
        saveUninitialized: false,
        resave: false
    }));
}
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.use("/",serveStatic(path.join(__dirname,'public')));
app.use(require("./routes/index"));
app.use(require("./routes/auth"));
app.use(require("./routes/flows"));
app.use(require("./routes/nodes"));
app.use(require("./routes/admin"));
app.use(require("./routes/api"));
app.use(function(req, res) {
    res.status(404).send(mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
});
app.listen(settings.port||20982);
console.log('Listening on port',settings.port||20982);

if (process.env.FLOW_ENV === 'PRODUCTION') {
    events.add({
        action:"started",
        message:"Flow Library app started"
    });
}
