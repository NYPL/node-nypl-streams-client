/* global describe it before after */

const AWS = require('aws-sdk-mock')

const assert = require('assert')
const Client = require('../index')

describe('Client', function () {
  this.timeout(30000)

  describe('Stream create/delete lib', function () {
    before(() => {
      // Mock AWS.Kinesis.prototype.createStream:
      AWS.mock('Kinesis', 'createStream', function (params, callback) {
        switch (params.StreamName) {
          // Always respond with success to createStream for this stream name:
          case 'fake-stream-name':
            callback(null, 'Yeah I totally did that thing')
            break
          // Let's always respond to createStream requests for this stream name
          // as though it already exists (i.e. throw error like aws-sdk does)
          case 'fake-stream-name-that-exists':
            callback('oh no!')
            break
        }
      })
      // Mock AWS.Kinesis.prototype.describeStream, which is used to verify stream creation:
      AWS.mock('Kinesis', 'describeStream', function (params, callback) {
        callback(null, { StreamDescription: { StreamStatus: 'ACTIVE' } })
      })
      // Mock AWS.Kinesis.prototype.describeStream, which is used to verify stream creation:
      AWS.mock('Kinesis', 'deleteStream', function (params, callback) {
        callback(null, 'Yep totes deleted.')
      })
    })

    after(() => {
      AWS.restore('Kinesis')
    })

    it('should create stream', function () {
      var client = new Client()
      return client.createStream('fake-stream-name').then((stream) => {
        // By virtue of resolving, we know the creation was successful
        assert(true)
      })
    })

    it('should fail if stream exists and we\'ve told it to fail in that case', function () {
      var client = new Client()
      return client.createStream('fake-stream-name-that-exists', { failIfExists: true }).then((stream) => {
        // By virtue of resolving, we know the error wasn't correctly thrown
        assert(false)
      }).catch((e) => {
        // By virtue of rejecting, we know the error was thrown:
        assert(true)
      })
    })

    it('should fail to delete a stream unless confirmed by option', function () {
      var client = new Client()
      return client.deleteStream('fake-stream-name').then((stream) => {
        // By virtue of resolving, we know the error wasn't correctly thrown
        assert(false)
      }).catch((e) => {
        // By virtue of rejecting, we know the error was thrown:
        assert(true)
      })
    })

    it('should delete a stream', function () {
      var client = new Client()
      return client.deleteStream('fake-stream-name', { yesIKnowThisIsPotentiallyDisastrous: true }).then((stream) => {
        // By virtue of resolving, we know the error wasn't correctly thrown
        assert(true)
      })
    })
  })
})
