/* global describe it */

const assert = require('assert')
const Client = require('../index')

describe('Client', function () {
  this.timeout(30000)

  describe.only('Stream write', function () {
    var streamName = 'IndexDocumentProcessed'
    streamName = 'node-nypl-streams-client-test-14948860293950.8801324877422303'

    var data = {
      id: '12000000',
      nyplSource: 'sierra-nypl',
      nyplType: 'bib'
    }

    it('should write single record to stream', function () {
      var client = new Client({ nyplDataApiClientBase: 'https://api.nypltech.org/api/v0.1/' })

      return client.write(streamName, data, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        // By virtue of resolving, we know the creation was successful
        assert(true)
      })
    })

    it('should write multiple records to stream', function () {
      var client = new Client({ nyplDataApiClientBase: 'https://api.nypltech.org/api/v0.1/' })

      var num = 501
      var multiple = Array.apply(undefined, { length: num }).map(() => data)
      return client.write(streamName, multiple, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        // console.log('resp: ', resp)

        assert(resp)
        assert.equal(resp.FailedRecordCount, 0)
        assert.equal(resp.Records.length, num)
      })
    })

    it.only('should write multiple records, respecting rate limit', function () {
      var recordsPerSecond = 100
      var client = new Client({ nyplDataApiClientBase: 'https://api.nypltech.org/api/v0.1/', recordsPerSecond })

      var num = 501
      var multiple = Array.apply(undefined, { length: num }).map(() => data)

      // Processing 501 at 100/s should take just over 5s in the best case
      var expectedTime = Math.floor(num / recordsPerSecond) * 1000

      var start = (new Date()).getTime()
      return client.write(streamName, multiple, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
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
