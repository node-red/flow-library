var path = require("path");
var mustache = require('mustache');
var express = require('express');
var session = require('express-session');
var MongoStore = require('connect-mongo');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var serveStatic = require('serve-static');
var settings = require('./config');
var templates = require("./lib/templates");
// var morgan = require('morgan');
// var rfs = require('rotating-file-stream');
var app = express();

// var accessLogStream = rfs('access.log', {
//     interval: '1d', // rotate daily
//     path: path.join(__dirname, 'logs')
// })
// app.use(morgan(':date[iso] :method :url :status :res[content-length] - :response-time ms', { stream: accessLogStream }))

app.use(cookieParser());

if (!settings.maintenance) {
    if (process.env.FLOW_ENV == "PRODUCTION") {
        app.use(session({
            store: MongoStore.create({
                url: settings.mongo.url,
                touchAfter: 24 * 3600,
                collection: settings.session.collection || "sessions_new"
            }),
            key: settings.session.key,
            secret: settings.session.secret,
            saveUninitialized: false,
            resave: false,
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
}

app.use("/",serveStatic(path.join(__dirname,'public')));
if (process.env.FLOW_ENV !== "PRODUCTION") {
    app.use("*", function(req,res,next) {
        console.log(">",req.url);
        next();
    })
}

if (!settings.maintenance) {
    app.use(require("./routes/index"));
    app.use(require("./routes/auth"));
    app.use(require("./routes/flows"));
    app.use(require("./routes/nodes"));
    app.use(require("./routes/admin"));
    app.use(require("./routes/users"));
    app.use(require("./routes/api"));
    app.use(require("./routes/collections"));
    app.use(function(req, res) {
        res.status(404).send(mustache.render(templates['404'],{sessionuser:req.session.user},templates.partials));
    });
} else {
    app.use(function(req,res) {
        res.send(mustache.render(templates.maintenance, {}, templates.partials));
    })
}
app.listen(settings.port||20982);
console.log(`Listening on http://localhost:${settings.port||20982}`);

if (process.env.FLOW_ENV === 'PRODUCTION') {
    require("./lib/events").add({
        action:"started",
        message:"Flow Library app started"
    });
}
