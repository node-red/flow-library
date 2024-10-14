/* eslint-disable n/no-unpublished-require */
// eslint-disable-next-line no-unused-vars
const should = require('should')
const sinon = require('sinon')

const events = require('../../lib/events')
const modules = require('../../lib/modules')
const nodes = require('../../lib/nodes')
const ratings = require('../../lib/ratings')
const sandbox = sinon.createSandbox()

describe('modules', function () {
    afterEach(function () {
        sandbox.restore()
    })

    it('#pruneRatings', function (done) {
        const list = ['node-red-dashboard', 'node-red-contrib-influxdb', 'node-red-contrib-noble']
        sandbox.stub(ratings, 'getRatedModules').returns(Promise.resolve(list))
        sandbox.stub(nodes, 'get').returns(Promise.resolve({
            _id: 'node-red-dashboard'
        })).returns(Promise.resolve({
            _id: 'node-red-contrib-influxdb'
        })).returns(Promise.resolve({
            _id: 'node-red-contrib-noble'
        }))

        modules.pruneRatings().then(function (results) {
            results.should.be.empty()
            done()
            return null
        }).catch(err => {
            done(err)
        })
    })

    it('#pruneRatings module removed', function (done) {
        const list = ['node-red-dashboard', 'node-red-contrib-influxdb', 'node-red-contrib-noble']
        sandbox.stub(ratings, 'getRatedModules').returns(Promise.resolve(list))

        const nodesGet = sandbox.stub(nodes, 'get')
        nodesGet.withArgs('node-red-dashboard').returns(Promise.resolve({
            _id: 'node-red-dashboard'
        }))
        nodesGet.withArgs('node-red-contrib-influxdb').returns(Promise.resolve({
            _id: 'node-red-contrib-influxdb'
        }))
        nodesGet.withArgs('node-red-contrib-noble').returns(
            Promise.reject(new Error('node not found: node-red-contrib-noble')))

        sandbox.stub(ratings, 'removeForModule').returns(Promise.resolve())
        sandbox.stub(events, 'add').returns(Promise.resolve())

        modules.pruneRatings().then(function (results) {
            results.should.have.length(1)
            results[0].should.eql({
                state: 'fulfilled',
                value: 'node-red-contrib-noble ratings removed'
            })
            done()
            return null
        }).catch(err => {
            done(err)
        })
    })
})
