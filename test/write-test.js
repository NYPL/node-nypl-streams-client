/* global describe it before after */

const AWS = require('aws-sdk-mock')
const assert = require('assert')

const fixtures = require('./fixtures')
const Client = require('../index')

describe('Client', function () {
  // We have to ask for extra running time here because we test rate limits
  this.timeout(30000)

  before(() => {
    // Enable data-api fixtures:
    fixtures.enableFixtures()

    // Mock AWS.Kinesis.prototype.putRecords
    AWS.mock('Kinesis', 'putRecords', function (params, callback) {
      callback(null, { FailedRecordCount: 0, Records: Array(params.Records.length) })
    })
    // Mock AWS.Kinesis.prototype.putRecord (singular)
    AWS.mock('Kinesis', 'putRecord', function (params, callback) {
      callback(null, 'That record, it is now put')
    })
  })

  after(() => {
    // Disable data-api fixtures:
    fixtures.disableFixtures()

    AWS.restore('Kinesis')
  })

  describe('Stream write', function () {
    var data = {
      id: '12000000',
      nyplSource: 'sierra-nypl',
      nyplType: 'bib'
    }

    it('should write single record to stream', function () {
      var client = new Client()

      return client.write('fake-stream-name', data, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        // By virtue of resolving, we know the creation was successful
        assert(true)
      })
    })

    it('should write multiple records to stream', function () {
      var client = new Client()

      var num = 501
      var multiple = Array.apply(undefined, { length: num }).map(() => data)
      return client.write('fake-stream-name', multiple, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        assert(resp)
        assert.equal(resp.FailedRecordCount, 0)
        assert.equal(resp.Records.length, num)
      })
    })

    it('should write multiple records, respecting rate limit', function () {
      var recordsPerSecond = 100
      // Add reduced recordsPerSecond to client config:
      var client = new Client(Object.assign({ recordsPerSecond }))

      var num = 501
      var multiple = Array.apply(undefined, { length: num }).map(() => data)

      // Processing 501 at 100/s should take just over 5s in the best case
      var expectedTime = Math.floor(num / recordsPerSecond) * 1000

      var start = (new Date()).getTime()
      return client.write('fake-stream-name', multiple, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        assert(resp)
        assert.equal(resp.FailedRecordCount, 0)
        assert.equal(resp.Records.length, num)

        // Make sure ellapsed time reflects rate limit
        var ellapsed = (new Date()).getTime() - start
        assert(ellapsed > expectedTime)
      })
    })
  })
})
