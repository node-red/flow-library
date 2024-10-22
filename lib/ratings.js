const db = require('./db')
const events = require('./events')
const npmNodes = require('./nodes')

async function saveRating (thingId, user, rating) {
    await db.ratings.updateOne(
        {
            module: thingId,
            user
        },
        {
            $set: {
                module: thingId,
                user,
                rating,
                time: new Date()
            }
        },
        { upsert: true }
    )
}

async function removeRating (thingId, user) {
    await db.ratings.deleteOne({
        module: thingId,
        user
    })
}

async function getModuleRating (npmModule) {
    const results = await db.ratings.aggregate(
        [
            { $match: { module: npmModule } },
            {
                $group: { _id: '$module', total: { $sum: '$rating' }, count: { $sum: 1 } }
            }
        ]
    ).toArray()
    console.log(results)
    if (results.length > 0) {
        return {
            module: npmModule,
            total: results[0].total,
            count: results[0].count
        }
    }
}

async function getForUser (npmModule, user) {
    return await db.ratings.findOne({
        user,
        module: npmModule
    })
}

async function removeForModule (npmModule) {
    return db.ratings.deleteOne({ module: npmModule })
}

async function getRatedModules () {
    return db.ratings.distinct('module', {})
}

async function rateThing (thingId, userId, rating) {
    try {
        rating = Number(rating)
        if (isNaN(rating) || rating === 0) {
            await removeRating(thingId, userId)
            await events.add({
                action: 'module_rating',
                module: thingId,
                message: 'removed',
                user: userId
            })
        } else {
            await saveRating(thingId, userId, rating)
            await events.add({
                action: 'module_rating',
                module: thingId,
                message: rating,
                user: userId
            })
        }
        const currentRating = await module.exports.get(thingId)
        let nodeRating = {}
        if (currentRating && currentRating.count > 0) {
            nodeRating = {
                score: currentRating.total / currentRating.count,
                count: currentRating.count
            }
        }
        return npmNodes.update(thingId, { rating: nodeRating })
    } catch (err) {
        console.log('error rating node module: ' + thingId, err)
    }
}

module.exports = {
    rateThing,
    get: async function (thingId, user) {
        console.log('rate get', thingId, user)
        let rating = null
        const totalRatings = await getModuleRating(thingId)
        if (!totalRatings) {
            return null
        }
        rating = totalRatings
        const userRating = await getForUser(thingId, user)
        if (userRating) {
            rating.userRating = userRating
        }
        return rating
    },
    getUserRating: getForUser,
    getRatedModules,
    removeForModule
}
