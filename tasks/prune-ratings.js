var when = require("when");
var settings = require("../config");
var ratings = require("../lib/ratings");
var npmNodes = require("../lib/nodes");
var events = require("../lib/events");

// prune ratings for nodes that are no longer in our database
function pruneRatings() {
  return ratings.getRatedModules().then(function(ratedModules) {
      var promises = [];
      ratedModules.forEach(function (name) {
          promises.push(
              npmNodes.get(name).then(function(node) {
                  return null;
              }).otherwise(function (err) {
                  if (err.message.startsWith('node not found:')) {
                      return ratings.removeForModule(name).then(function () {
                        return events.add({
                            "action": "remove_ratings",
                            "module": name,
                            "message": "ratings removed"
                        });
                      }).then(function () {
                        return name+' ratings removed';
                      });
                  } else {
                      throw err;
                  }
              }));
      });
      // return rejected and removed ratings
      return when.settle(promises).then(function(results) {
        return results.filter(function(res) {
          return res.state == 'rejected' || res.value;
        });
      })
  });
}

pruneRatings().then(function(results) {
    results.forEach(function(res) {
        if (res.state === 'rejected') {
            console.log("Failed:",res.reason);
        } else if (res.value) {
            console.log(res.value);
        }
    });

    npmNodes.close();
});
