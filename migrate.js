
var settings = require("./settings");
var mongojs = require('mongojs');

var db = mongojs(settings.mongo.url,["flows","users","tags"]);
db.flows.find({},function(err,flows) {
        flows.forEach(function(data) {
                if (data.history) {
                    delete data.history;
                    data.owner = {
                        login: data.owner.login,
                        avatar_url: data.owner.avatar_url
                    }
                    delete data.rateLimit;
                    data.type = "flow";
                }
                
        });
        
        
        function saveFlow() {
            console.log(flows.length+" remaining");
            if (flows.length > 0) {
                var flow = flows.splice(0,1)[0];
                
                
                db.flows.save(flow,function(err,oth) {
                    if (err) {
                        console.log(err);
                    } else {
                        saveFlow();
                    }
                    
                });
            }
        }
        saveFlow();
        
});


