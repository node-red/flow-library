
var settings = require("../config");
var mongojs = require('mongojs');

var db = mongojs(settings.mongo.url,["flows","users","tags"]);
db.flows.find({},function(err,flows) {
        function saveFlow() {
            console.log(flows.length+" remaining");
            if (flows.length > 0) {
                var flow = flows.splice(0,1)[0];
                var update = {};
                if (flow.type === "node") {
                    update['$set'] = {
                        npmOwners: flow.owners
                    }
                } else {
                    update['$set'] = {
                        gitOwners: flow.owners
                    }
                }
                update['$unset'] = { owners: ''}
                db.flows.update(
                    {_id:flow._id},
                    update,
                    function(err) {
                        if (err) {
                            console.log(err);
                        } else {
                            saveFlow();
                        }
                    }
                );
            }
        }
        saveFlow();

});
