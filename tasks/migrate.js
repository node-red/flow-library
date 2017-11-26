
var settings = require("../config");
var mongojs = require('mongojs');

var db = mongojs(settings.mongo.url,["flows","users","tags"]);
db.flows.find({updated_at:{$gt:1452000000000}},function(err,flows) {
        flows.forEach(function(data) {
            console.log(data._id,data.updated_at,data.time.modified);
            data.updated_at = data.time.modified;
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
