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
const { rateLimit } = require('express-rate-limit')
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 5 minutes
	max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: false, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res, next, options) => {
        console.log(`Rate Limit: ${req.method} ${req.url} ${req.ip} `)
		res.status(options.statusCode).send(options.message)
    }
})
var app = express();
app.use(limiter)

app.use(cookieParser());
if (!settings.maintenance) {
    app.use(session({
        store: MongoStore.create({
            mongoUrl: settings.mongo.url,
            touchAfter: 24 * 3600,
            collectionName: settings.session.collection || "sessions_new"
        }),
        key: settings.session.key,
        secret: settings.session.secret,
        saveUninitialized: false,
        resave: false,
    }));
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
    app.set('trust proxy', 1)
    app.use(require("./routes/index"));
    app.use(require("./routes/auth"));
    app.use(require("./routes/flows"));
    app.use(require("./routes/nodes"));
    app.use(require("./routes/admin"));
    app.use(require("./routes/users"));
    app.use(require("./routes/api"));
    app.use(require("./routes/collections"));
    app.use(function (err, req, res, next) {
        if (err.code !== 'EBADCSRFTOKEN') {
            console.log('here', err)
            return next(err)
        }
        // handle CSRF token errors here
        res.status(403)
        res.send('Invalid request')
        console.log(`CSRF Error: ${req.method} ${req.url} ${req.ip} `)
    })
    app.use(function(req, res) {
        console.log(`404: ${req.method} ${req.url} ${req.ip}`)
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
