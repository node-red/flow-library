var request = require("request");
var when = require("when");
var settings = require("../config");
var db = require("./db");

var icons = {
    'module_report': ':warning: Report submitted: ',
    'update': ':rocket: Updated: ',
    'refresh_requested': ':mag: Refresh requested: ',
    'error': ':boom: Error: ',
    'reject': ':-1: Rejected module: ',
    'remove': ':wastebasket: Removed module: ',
    'started':':coffee: Flow Library restarted'
};
var colors = {
    'module_report': 'warning',
    'update': 'good',
    'refresh_requested': 'good',
    'error': 'danger',
    'reject': 'danger',
    'remove': 'danger',

};

function addEvent(event) {
    return when.promise(function(resolve,reject) {
        event.ts = Date.now();
        // console.log(JSON.stringify(event));
        db.events.save(event,function(err,other) {
            if (err) {
                console.log(err,other);
            }
            if (settings.slack && settings.slack.webhook) {
                try {
                    var msg = icons[event.action]||"";

                    if (event.module) {
                        msg += " <http://flows.nodered.org/node/"+event.module+"|"+event.module+">";
                    } else if (event.action !== 'started'){
                        msg = "Flow library error";
                    }

                    if (event.version) {
                        msg += " ("+event.version+")"
                    }
                    if (event.user) {
                        msg += "   User: "+"<http://github.com/"+event.user+"|"+event.user+">";
                    }

                    var json = {
                        attachments: [
                            {
                                color: colors[event.action]||"#999999",
                                fallback: msg,
                                pretext: msg,
                                fields: []
                            }
                        ]
                    };


                    if (event.message && event.action !== 'started') {
                        json.attachments[0].text = event.message.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
                    }
                    var options = {
                        url: settings.slack.webhook,
                        method: 'POST',
                        json: json
                    };
                    request(options,function(error,resp,body) {
                        if (error) {
                            console.log(error);
                        }
                        resolve();
                    });
                } catch(err2) {
                    console.log(err2);
                    resolve();
                }
            } else {
                resolve();
            }
        });
    });
}

function getEvents() {
    // Return last 50 events...
    return when.promise(function(resolve,reject) {
        db.events.find({}).sort({"ts":-1}).limit(50).toArray(function(err,docs) {
            if (err) {
                reject(err);
            } else {
                docs.forEach(function(d) {
                    d.time = (new Date(d.ts)).toISOString();
                })
                resolve(docs);
            }
        });
    });
}

module.exports = {
    add: addEvent,
    get: getEvents
}
