const AWS = require('aws-sdk-mock')
const assert = require('assert')

const fixtures = require('./fixtures')
const Client = require('../index')

describe('Client', function () {
  describe('Stream encoding', function () {
    before(() => {
      // Enable api client fixtures
      fixtures.enableFixtures()

      // Mock AWS.Kinesis.prototype.putRecords
      AWS.mock('Kinesis', 'putRecords', function (params, callback) {
        callback(null, 'All records have totally been put')
      })
      // Mock AWS.Kinesis.prototype.putRecord (singular)
      AWS.mock('Kinesis', 'putRecord', function (params, callback) {
        callback(null, 'That record, it is now put')
      })
    })

    after(() => {
      // Disable api client fixtures
      fixtures.disableFixtures()

      AWS.restore('Kinesis')
    })

    it('should fail if single record fails to encode', function () {
      var client = new Client()

      var data = {
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
      var client = new Client()

      var data = {
        id: '12000000',
        nyplSource: 'sierra-nypl',
        nyplType: 'bib'
      }

      var num = 5
      var multiple = Array.apply(undefined, { length: num }).map(() => data)
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
