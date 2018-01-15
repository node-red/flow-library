var should = require('should');
var sinon = require('sinon');

var db = require('../../lib/db');
var ratings = require('../../lib/ratings');
var sandbox = sinon.createSandbox();

describe("ratings", function () {

    afterEach(function () {
        sandbox.restore();
    });

    it('#save', function (done) {
        var dbUpdate = sandbox.stub(db.ratings, 'update').yields(null);

        var testRating = {
            user: 'testuser',
            module: 'node-red-dashboard',
            time: new Date(),
            rating: 4
        };

        ratings.save(testRating).then(function () {
            sinon.assert.calledWith(dbUpdate,
                { module: testRating.module, user: testRating.user }, testRating, { upsert: true });
            done();
        }).otherwise(function (err) {
            done(err);
        });
    });

    it('#remove', function (done) {
        var dbRemove = sandbox.stub(db.ratings, 'remove').yields(null);
        var testRating = {
            user: 'testuser',
            module: 'node-red-dashboard'
        };
        ratings.remove(testRating).then(function () {
            sinon.assert.calledWith(dbRemove, testRating);
            done();
        }).otherwise(function (err) {
            done(err);
        });
    });

    it('#get', function (done) {
        var totalRating = [{ _id: 'node-red-dashboard', total: 19, count: 2 }];
        var userRating = {
            user: 'test',
            module: 'node-red-dashboard',
            rating: 4,
            version: '2.6.1',
            time: new Date('2018-01-15T00:34:27.998Z')
        };

        sandbox.stub(db.ratings, 'aggregate').yields(null,
            totalRating
        );

        sandbox.stub(db.ratings, 'findOne').yields(null, userRating);

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
            });
            done();
        }).otherwise(function (err) {
            done(err);
        });
    });

    it('#get no user rating', function (done) {
        sandbox.stub(db.ratings, 'aggregate').yields(null,
            [{ _id: 'node-red-dashboard', total: 19, count: 2 }]
        );
        var foundRating = {
            user: 'test',
            module: 'node-red-dashboard',
            rating: 4,
            version: '2.6.1',
            time: new Date('2018-01-15T00:34:27.998Z')
        };

        var dbFindOne = sandbox.stub(db.ratings, 'findOne').yields(null,
            foundRating
        );

        ratings.get('node-red-dashboard').then(function (found) {
            found.should.eql({
                module: 'node-red-dashboard',
                total: 19, count: 2
            });
            sinon.assert.notCalled(dbFindOne);
            done();
        }).otherwise(function (err) {
            done(err);
        });
    });

    it('#getRatedModules', function (done) {
        var list = ['node-red-dashboard', 'node-red-contrib-influxdb', 'node-red-contrib-noble'];
        sandbox.stub(db.ratings, 'distinct').yields(null, list);

        ratings.getRatedModules().then(function (modList) {
            modList.should.eql(list);
            done();
        });
    });

    it('#removeForModule', function (done) {
        var dbRemove = sandbox.stub(db.ratings, 'remove').yields(null);

        ratings.removeForModule('node-red-dashboard').then(function () {
            sinon.assert.calledWith(dbRemove, { module: 'node-red-dashboard' });
            done();
        });
    });
});

