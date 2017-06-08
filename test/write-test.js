/* global describe it before after */

const assert = require('assert')
const Client = require('../index')

describe('Client', function () {
  const TEMP_STREAM_NAME = 'node-nypl-streams-client-test-14948860293950.8801324877422303'
  const CLIENT_OPTS = { nyplDataApiClientBase: 'https://api.nypltech.org/api/v0.1/' }

  this.timeout(30000)

  before(() => {
    // Create the temporary stream:
    var client = new Client(CLIENT_OPTS)
    return client.createStream(TEMP_STREAM_NAME)
  })

  after(() => {
    // If running tests a lot, consider setting PERSIST_TESTING_STREAMS=true
    // so that you don't have to re-create the temporary stream each run:
    if (process.env.PERSIST_TESTING_STREAMS) return Promise.resolve()

    // Delete the temporary stream:
    var client = new Client(CLIENT_OPTS)
    return client.deleteStream(TEMP_STREAM_NAME, { yesIKnowThisIsPotentiallyDisastrous: true })
  })

  describe('Stream write', function () {
    var data = {
      id: '12000000',
      nyplSource: 'sierra-nypl',
      nyplType: 'bib'
    }

    it('should write single record to stream', function () {
      var client = new Client(CLIENT_OPTS)

      return client.write(TEMP_STREAM_NAME, data, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        // By virtue of resolving, we know the creation was successful
        assert(true)
      })
    })

    it('should write multiple records to stream', function () {
      var client = new Client(CLIENT_OPTS)

      var num = 501
      var multiple = Array.apply(undefined, { length: num }).map(() => data)
      return client.write(TEMP_STREAM_NAME, multiple, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        // console.log('resp: ', resp)

        assert(resp)
        assert.equal(resp.FailedRecordCount, 0)
        assert.equal(resp.Records.length, num)
      })
    })

    it('should write multiple records, respecting rate limit', function () {
      var recordsPerSecond = 100
      // Add reduced recordsPerSecond to client config:
      var client = new Client(Object.assign({ recordsPerSecond }, CLIENT_OPTS))

      var num = 501
      var multiple = Array.apply(undefined, { length: num }).map(() => data)

      // Processing 501 at 100/s should take just over 5s in the best case
      var expectedTime = Math.floor(num / recordsPerSecond) * 1000

      var start = (new Date()).getTime()
      return client.write(TEMP_STREAM_NAME, multiple, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        // console.log('resp: ', resp)

        assert(resp)
        assert.equal(resp.FailedRecordCount, 0)
        assert.equal(resp.Records.length, num)

        var ellapsed = (new Date()).getTime() - start
        assert(ellapsed > expectedTime)
      })
    })
  })
})
