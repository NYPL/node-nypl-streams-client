const sinon = require('sinon')
const { KinesisClient } = require('@aws-sdk/client-kinesis')

const assert = require('assert')

const fixtures = require('./fixtures')
const Client = require('../index')

describe('Client', function () {
  // We have to ask for extra running time here because we test rate limits
  this.timeout(30000)

  before(() => {
    // Enable data-api fixtures:
    fixtures.enableFixtures()

    sinon.stub(KinesisClient.prototype, 'send').callsFake((payload) => {
      if (payload.input.StreamName === 'StreamWithPoorConnectivity') {
        return Promise.resolve({ FailedRecordCount: 1, Records: Array(payload.input.Records.length) })
      } else {
        return Promise.resolve({ FailedRecordCount: 0, Records: Array(payload.input.Records.length) })
      }
    })
  })

  after(() => {
    // Disable data-api fixtures:
    fixtures.disableFixtures()

    KinesisClient.prototype.send.restore()
  })

  describe('Stream write', function () {
    const data = {
      id: '12000000',
      nyplSource: 'sierra-nypl',
      nyplType: 'bib'
    }

    it('should write single record to stream', function () {
      const client = new Client()

      return client.write('fake-stream-name', data, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        // By virtue of resolving, we know the creation was successful
        assert(true)
      })
    })

    it('should write multiple records to stream', function () {
      const client = new Client()

      const num = 501
      const multiple = Array.apply(undefined, { length: num }).map(() => data)
      return client.write('fake-stream-name', multiple, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        assert(resp)
        assert.equal(resp.FailedRecordCount, 0)
        assert.equal(resp.Records.length, num)
      })
    })

    it('should write multiple records, respecting rate limit', function () {
      const recordsPerSecond = 100
      // Add reduced recordsPerSecond to client config:
      const client = new Client(Object.assign({ recordsPerSecond }))

      const num = 501
      const multiple = Array.apply(undefined, { length: num }).map(() => data)

      // Processing 501 at 100/s should take just over 5s in the best case
      const expectedTime = Math.floor(num / recordsPerSecond) * 1000

      const start = (new Date()).getTime()
      return client.write('fake-stream-name', multiple, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        assert(resp)
        assert.equal(resp.FailedRecordCount, 0)
        assert.equal(resp.Records.length, num)

        // Make sure ellapsed time reflects rate limit
        const ellapsed = (new Date()).getTime() - start
        assert(ellapsed > expectedTime)
      })
    })

    it('should return an object with FailedRecordCount representing all failures across multiple batches', function () {
      const client = new Client(Object.assign({ writeBatchSize: 100 }))

      const num = 501
      const multiple = Array.apply(undefined, { length: num }).map(() => data)

      return client.write('StreamWithPoorConnectivity', multiple, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        assert(resp)
        // This stream emulates 1 failed write per putRecords call, and we
        // expect 501/100=6 batches, so we expect 6 putRecords calls and as
        // many failures
        assert.equal(resp.FailedRecordCount, 6)
        assert.equal(resp.Records.length, num)
        assert.equal(resp.unmergedResponses.length, 6)
      })
    })
  })
})
