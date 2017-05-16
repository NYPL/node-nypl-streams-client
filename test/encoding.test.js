/* global describe it */

const assert = require('assert')
const Client = require('../index')

describe('Client', function () {
  this.timeout(30000)

  describe('Stream encoding', function () {
    var streamName = 'node-nypl-streams-client-test-14948860293950.8801324877422303'

    it('should fail if single record fails to encode', function () {
      var client = new Client({ nyplDataApiClientBase: 'https://api.nypltech.org/api/v0.1/' })

      var data = {
        id: '12000000',
        nyplSourceInvalidProp: 'sierra-nypl',
        nyplType: 'bib'
      }
      return client.write(streamName, data, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        // By virtue of resolving, we know it didn't fail as it should
        assert(false)
      }).catch((e) => {
        // By virtue of being caught, we know write failed
        assert(true)
      })
    })

    it('should fail all if single record in batch fails to encode', function () {
      var client = new Client({ nyplDataApiClientBase: 'https://api.nypltech.org/api/v0.1/' })

      var data = {
        id: '12000000',
        nyplSource: 'sierra-nypl',
        nyplType: 'bib'
      }

      var num = 5
      var multiple = Array.apply(undefined, { length: num }).map(() => data)
      // Delete a property from fourth record:
      delete multiple[3].nyplType

      return client.write(streamName, multiple, { avroSchemaName: 'IndexDocumentProcessed' }).then((resp) => {
        // By virtue of resolving, we know it didn't fail as it should
        assert(false)
      }).catch((e) => {
        // By virtue of being caught, we know write failed
        assert(true)
      })
    })
  })
})
