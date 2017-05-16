/* global describe it */

const assert = require('assert')
const Client = require('../index')

describe('Client', function () {
  this.timeout(30000)

  describe('Stream create/delete lib', function () {
    var streamName = 'node-nypl-streams-client-test-' + (new Date()).getTime() + Math.random()

    it('should create stream', function () {
      var client = new Client()
      return client.createStream(streamName).then((stream) => {
        // By virtue of resolving, we know the creation was successful
        assert(true)
      })
    })

    it('should not fail if stream exists', function () {
      var client = new Client()
      return client.createStream(streamName).then((stream) => {
        // By virtue of resolving, we know the (redundant) creation was successful
        assert(true)
      })
    })

    it('should fail if stream exists and we\'ve told it to fail in that case', function () {
      var client = new Client()
      return client.createStream(streamName, { failIfExists: true }).then((stream) => {
        // By virtue of resolving, we know the error wasn't correctly thrown
        assert(false)
      }).catch((e) => {
        // By virtue of rejecting, we know the error was thrown:
        assert(true)
      })
    })

    it('should fail to delete a stream unless confirmed by option', function () {
      var client = new Client()
      return client.deleteStream(streamName).then((stream) => {
        // By virtue of resolving, we know the error wasn't correctly thrown
        assert(false)
      }).catch((e) => {
        // By virtue of rejecting, we know the error was thrown:
        assert(true)
      })
    })

    it('should delete a stream', function () {
      var client = new Client()
      return client.deleteStream(streamName, { yesIKnowThisIsPotentiallyDisastrous: true }).then((stream) => {
        // By virtue of resolving, we know the error wasn't correctly thrown
        assert(true)
      })
    })
  })
})
