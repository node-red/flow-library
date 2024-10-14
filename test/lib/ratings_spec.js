/* eslint-disable n/no-unpublished-require */
// eslint-disable-next-line no-unused-vars
const should = require('should')
const sinon = require('sinon')

const db = require('../../lib/db')
const ratings = require('../../lib/ratings')
const sandbox = sinon.createSandbox()

// With the move to the async mongodb client, how we mock the db module needs to change
// I haven't figured it all out yet, so keeping this spec in place for the time being

describe.skip('ratings', function () {
    before(async function () {
        return db.init()
    })
    afterEach(function () {
        sandbox.restore()
    })

    it('#save', function (done) {
        const dbUpdate = sandbox.stub(db.ratings, 'update').yields(null)

        const testRating = {
            user: 'testuser',
            module: 'node-red-dashboard',
            time: new Date(),
            rating: 4
        }

        ratings.save(testRating).then(function () {
            sinon.assert.calledWith(dbUpdate,
                { module: testRating.module, user: testRating.user }, testRating, { upsert: true })
            done()
        }).catch(function (err) {
            done(err)
        })
    })

    it('#remove', function (done) {
        const dbRemove = sandbox.stub(db.ratings, 'remove').yields(null)
        const testRating = {
            user: 'testuser',
            module: 'node-red-dashboard'
        }
        ratings.remove(testRating).then(function () {
            sinon.assert.calledWith(dbRemove, testRating)
            done()
        }).catch(function (err) {
            done(err)
        })
    })

    it('#get', function (done) {
        const totalRating = [{ _id: 'node-red-dashboard', total: 19, count: 2 }]
        const userRating = {
            user: 'test',
            module: 'node-red-dashboard',
            rating: 4,
            version: '2.6.1',
            time: new Date('2018-01-15T00:34:27.998Z')
        }

        sandbox.stub(db.ratings, 'aggregate').yields(null,
            totalRating
        )

        sandbox.stub(db.ratings, 'findOne').yields(null, userRating)

        ratings.get('node-red-dashboard', 'test').then(function (found) {
            found.should.eql({
                module: 'node-red-dashboard',
                total: 19,
                count: 2,
                userRating: {
                    user: 'test',
                    module: 'node-red-dashboard',
                    rating: 4,
                    version: '2.6.1',
                    time: new Date('2018-01-15T00:34:27.998Z')
                }
            })
            done()
        }).catch(function (err) {
            done(err)
        })
    })

    it('#get no user rating', function (done) {
        sandbox.stub(db.ratings, 'aggregate').yields(null,
            [{ _id: 'node-red-dashboard', total: 19, count: 2 }]
        )
        const foundRating = {
            user: 'test',
            module: 'node-red-dashboard',
            rating: 4,
            version: '2.6.1',
            time: new Date('2018-01-15T00:34:27.998Z')
        }

        const dbFindOne = sandbox.stub(db.ratings, 'findOne').yields(null,
            foundRating
        )

        ratings.get('node-red-dashboard').then(function (found) {
            found.should.eql({
                module: 'node-red-dashboard',
                total: 19,
                count: 2
            })
            sinon.assert.notCalled(dbFindOne)
            done()
        }).catch(function (err) {
            done(err)
        })
    })

    it('#getRatedModules', function (done) {
        const list = ['node-red-dashboard', 'node-red-contrib-influxdb', 'node-red-contrib-noble']
        sandbox.stub(db.ratings, 'distinct').yields(null, list)

        ratings.getRatedModules().then(function (modList) {
            modList.should.eql(list)
            done()
        })
    })

    it('#removeForModule', function (done) {
        const dbRemove = sandbox.stub(db.ratings, 'remove').yields(null)

        ratings.removeForModule('node-red-dashboard').then(function () {
            sinon.assert.calledWith(dbRemove, { module: 'node-red-dashboard' })
            done()
        })
    })
})
