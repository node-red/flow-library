const db = require("./db");
const events = require("./events");
const npmNodes = require("./nodes");


function saveRating(thingId,user,rating) {
    return new Promise((resolve,reject) => {
        db.ratings.update(
            {
                module: thingId,
                user: user
            },
            {
                $set: {
                    module: thingId,
                    user: user,
                    rating: rating,
                    time: new Date()
                }
            },
            { upsert: true },
            function (err) {
                if (err) {
                    reject({
                        module: rating.module,
                        user: rating.user,
                        error: err
                    });
                } else {
                    resolve();
                }
            });
    });
}

function removeRating(thingId,user) {
    return new Promise((resolve,reject) => {
        db.ratings.remove({
            module: thingId,
            user: user
        }, function (err) {
            if (err) {
                reject({
                    module: rating.module,
                    user: rating.user,
                    error: err
                });
            } else {
                resolve();
            }
        });
    });
}

function getModuleRating(npmModule) {
    return new Promise((resolve,reject) => {
        db.ratings.aggregate(
            [
                { $match: { module: npmModule } },
                {
                    $group: { _id: "$module", total: { $sum: "$rating" }, count: { $sum: 1 } }
                }
            ], function (err, results) {
                if (err) {
                    reject({
                        module: npmModule,
                        error: err
                    });
                } else {
                    if (results.length === 0) {
                        resolve();
                    } else {
                        resolve({
                            module: npmModule,
                            total: results[0].total,
                            count: results[0].count
                        });
                    }
                }
            });
    });
}

function getForUser(npmModule, user) {
    return new Promise((resolve,reject) => {
        db.ratings.findOne({
            user: user,
            module: npmModule
        }, function (err, results) {
            if (err) {
                reject({
                    module: npmModule,
                    user: user,
                    error: err
                });
            } else {
                var userRating = null;
                if (results) {
                    userRating = results;
                }
                resolve(userRating);
            }
        });
    });
}

function removeForModule(npmModule) {
    return new Promise((resolve,reject) => {
        db.ratings.remove({ module: npmModule }, function (err) {
            if (err) {
                reject(err);
                return;
            }
            resolve(npmModule + ' ratings deleted');
        });
    });
}

function getRatedModules() {
    return new Promise((resolve,reject) => {
        db.ratings.distinct("module", {}, function (err, ratedModules) {
            if (err) {
                reject(err);
                return;
            }
            resolve(ratedModules);
        });
    });
}


function rateThing(thingId,userId,rating) {
    var updateRatingPromise;
    rating = Number(rating);
    if (isNaN(rating) || rating === 0) {
        updateRatingPromise = removeRating(thingId,userId).then(function() {
            return events.add({
                action:"module_rating",
                module: thingId,
                message:"removed",
                user: userId
            });
        })
    } else {
        updateRatingPromise = saveRating(thingId,userId,rating).then(function() {
            return events.add({
                action:"module_rating",
                module: thingId,
                message:rating,
                user: userId
            });
        })
    }
    return updateRatingPromise.then(
        () => module.exports.get(thingId).then(
            (rating) => {
                var nodeRating = {};
                if (rating && rating.count > 0) {
                    nodeRating = {
                        score: rating.total/rating.count,
                        count: rating.count
                    }
                }
                return npmNodes.update(thingId,{rating: nodeRating })
            }
        )
    ).catch(function(err) {
        console.log("error rating node module: "+thingId,err);
    })
}

module.exports = {
    rateThing: rateThing,
    save: saveRating,
    remove: removeRating,
    get: function (thingId, user) {
        var rating = null;
        return getModuleRating(thingId).then(function (totalRatings) {
            if (!totalRatings) {
                return null;
            }
            rating = totalRatings;
            return getForUser(thingId, user);
        }).then(function (userRating) {
            if (userRating) {
                rating.userRating = userRating;
            }
            return rating;
        });
    },
    getUserRating: getForUser,
    getRatedModules: getRatedModules,
    removeForModule: removeForModule
}
