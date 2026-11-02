const sinon = require('sinon')
const { KinesisClient } = require('@aws-sdk/client-kinesis')
const assert = require('assert')

const fixtures = require('./fixtures')
const Client = require('../index')

describe('Client', function () {
  describe('Stream encoding', function () {
    before(() => {
      // Enable api client fixtures
      fixtures.enableFixtures()

      sinon.stub(KinesisClient.prototype, 'send').callsFake((payload) => {
        return Promise.resolve({ FailedRecordCount: 0, Records: Array(payload.input.Records.length) })
      })
    })

    after(() => {
      // Disable api client fixtures
      fixtures.disableFixtures()

      KinesisClient.prototype.send.restore()
    })

    it('should fail if single record fails to encode', function () {
      const client = new Client()

      const data = {
        id: '12000000',
        nyplSourceInvalidProp: 'sierra-nypl',
        nyplType: 'bib'
      }
      return client.write('fake-stream-name', data, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        // By virtue of resolving, we know it didn't fail as it should
        assert(false)
      }).catch((e) => {
        // By virtue of being caught, we know write failed
        assert(true)
      })
    })

    it('should fail all if single record in batch fails to encode', function () {
      const client = new Client()

      const data = {
        id: '12000000',
        nyplSource: 'sierra-nypl',
        nyplType: 'bib'
      }

      const num = 5
      const multiple = Array.apply(undefined, { length: num }).map(() => data)
      // Delete a property from fourth record:
      delete multiple[3].nyplType

      return client.write('fake-stream-name', multiple, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        // By virtue of resolving, we know it didn't fail as it should
        assert(false)
      }).catch((e) => {
        // By virtue of being caught, we know write failed
        assert(true)
      })
    })
  })
})
