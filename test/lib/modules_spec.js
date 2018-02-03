var should = require('should');
var sinon = require('sinon');
var when = require('when');
var nodes = require('../../lib/nodes');
var ratings = require('../../lib/ratings');
var events = require('../../lib/events');
var sandbox = sinon.createSandbox();

var modules = require('../../lib/modules');

describe("modules", function () {

    afterEach(function () {
        sandbox.restore();
    });

    it('#pruneRatings', function (done) {
        var list = ['node-red-dashboard', 'node-red-contrib-influxdb', 'node-red-contrib-noble'];
        sandbox.stub(ratings, 'getRatedModules').returns(when(list));
        sandbox.stub(nodes, 'get').returns(when({
            _id: 'node-red-dashboard'
        })).returns(when({
            _id: 'node-red-contrib-influxdb'
        })).returns(when({
            _id: 'node-red-contrib-noble'
        }));

        modules.pruneRatings().then(function (results) {
            results.should.be.empty();
            done();
        });
    });

    it('#pruneRatings module removed', function (done) {
        var list = ['node-red-dashboard', 'node-red-contrib-influxdb', 'node-red-contrib-noble'];
        sandbox.stub(ratings, 'getRatedModules').returns(when(list));

        var nodesGet = sandbox.stub(nodes, 'get')
        nodesGet.withArgs('node-red-dashboard').returns(when({
            _id: 'node-red-dashboard'
        }));
        nodesGet.withArgs('node-red-contrib-influxdb').returns(when({
            _id: 'node-red-contrib-influxdb'
        }));
        nodesGet.withArgs('node-red-contrib-noble').returns(
            when.reject(new Error('node not found: node-red-contrib-noble')));

        var removeForModule = sandbox.stub(ratings, 'removeForModule').returns(when());
        sandbox.stub(events, 'add').returns(when());

        modules.pruneRatings().then(function (results) {
            results.should.have.length(1);
            results[0].should.eql({
                state: 'fulfilled',
                value: 'node-red-contrib-noble ratings removed'
            });
            done();
        });
    });

});