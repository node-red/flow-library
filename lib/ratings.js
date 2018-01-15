var when = require('when');
var db = require("./db");

function saveRating(rating) {
    return when.promise(function (resolve, reject) {
        db.ratings.update(
            {
                module: rating.module,
                user: rating.user
            },
            rating, { upsert: true },
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

function removeRating(rating) {
    return when.promise(function (resolve, reject) {
        db.ratings.remove({
            module: rating.module,
            user: rating.user
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
    return when.promise(function (resolve, reject) {
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
    return when.promise(function (resolve, reject) {
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
                var userRating = {
                    rating: 0
                };
                if (results) {
                    userRating = results;
                }
                resolve(userRating);
            }
        });
    });
}

function removeForModule(npmModule) {
    return when.promise(function (resolve, reject) {
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
    return when.promise(function (resolve, reject) {
        db.ratings.distinct("module", {}, function (err, ratedModules) {
            if (err) {
                reject(err);
                return;
            }
            resolve(ratedModules);
        });
    });
}

module.exports = {
    save: saveRating,
    remove: removeRating,
    get: function (npmModule, user) {
        var rating = null;
        return getModuleRating(npmModule).then(function (totalRatings) {
            if (!totalRatings) {
                return null;
            }
            rating = totalRatings;
            if (user) {
                return getForUser(npmModule, user);
            }
        }).then(function (userRating) {
            if (userRating) {
                rating.userRating = userRating;
            }
            return rating;
        });
    },
    getRatedModules: getRatedModules,
    removeForModule: removeForModule
}
