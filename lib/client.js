'use strict'

const log = require('loglevel').getLogger('nypl-streams-client')
const AWS = require('aws-sdk')
const NyplClient = require('@nypl/nypl-data-api-client')
const avsc = require('avsc')

const utils = require('./utils')

function AvroValidationError (avroType, data) {
  this.name = 'AvroValidationError'

  var messages = AvroValidationError._getAvroValidationIssues(data, avroType).map((e) => {
    return ` * \`${e.path.join('.')}\` should be a ${e.type} but got ${e.value}`
  })
  this.message = 'Validation Errors:\n' + messages.join('\n')
}
AvroValidationError.prototype = Error.prototype

AvroValidationError._getAvroValidationIssues = function (obj, type) {
  var paths = []
  type.isValid(obj, {
    errorHook: function (path, any, type) {
      paths.push({ path, any, type })
    }
  })
  return paths
}

/*
 *  "Each shard can support up to 1,000 records per second for writes, up to a maximum total data write rate of 1 MB per second (including partition keys). This write limit applies to operations such as PutRecord and PutRecords."
 *
 *  - http://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html
 */

class Client {

  constructor (opts) {
    opts = opts || {}
    this.options = Object.assign({
      nyplDataApiClientBase: null,
      writeBatchSize: 500, // aws constraint
      recordsPerSecond: 500,
      waitBetweenDescribeCallsInSeconds: 4,
      maxDescribeCallRetries: 10,
      logLevel: process.env['LOG_LEVEL'],
      awsRegion: 'us-east-1'
    }, opts)

    if (this.options.logLevel) log.setLevel(this.options.logLevel)

    this._writesByStream = {}
    this._writeQueue = {}
  }

  write (name, data, opts) {
    opts = opts || {}
    opts = Object.assign({
      avroEncode: true,
      avroSchemaName: name
    }, opts)

    // Ensure data is encoded (or not) as appropriate:
    var prepareData = !opts.avroEncode ? Promise.resolve(data)
      : this.dataApiClient().then((api) => {
        return api.get(`current-schemas/${opts.avroSchemaName}`, { authenticate: false }).then((schema) => {
          log.debug('Got schema: ' + `current-schemas/${name}`, schema)

          var avroType = avsc.parse(JSON.parse(schema.schema))
          try {
            var encode = (data) => avroType.toBuffer(data)
            return Array.isArray(data) ? data.map(encode) : encode(data)
          } catch (e) {
            throw new AvroValidationError(avroType, data)
          }
        })
      })

    return prepareData.then((preparedData) => {
      return this.kinesisClient().then((kinesis) => {
        var debugLabels = Array.isArray(data) ? data.slice(0, 3).map((r) => r.id).join(', ') + ', ...' : data.id

        log.debug('Queuing ' + debugLabels + ' to ' + name)

        return (Array.isArray(preparedData) ? this._writeMultiple(kinesis, name, preparedData) : this._writeOne(kinesis, name, preparedData))
          .then((resp) => {
            log.info(`Successfully sent ${debugLabels} to ${name} kinesis.`)
            return resp
          })
      })
    })
  }

  _writeMultiple (kinesis, name, preparedData) {
    // Don't write more than batch size or more than the records-per-second constraint:
    var effectiveWriteSize = Math.min(this.options.writeBatchSize, this.options.recordsPerSecond)
    log.debug('Effective write size: %s', effectiveWriteSize)

    return Promise.all(
      utils.arrayChunk(preparedData, effectiveWriteSize).map((chunkedPreparedData, i) => {
        // Call the appropriate put endpoint:
        return new Promise((resolve, reject) => {
          // Set up params to send to kinesis:
          var recordParams = {
            StreamName: name // kinesisWriteStream.stream
          }
          // Payload is an array of records:
          recordParams.Records = chunkedPreparedData.map((rec) => ({
            Data: rec,
            PartitionKey: 'sensor-' + Math.floor(Math.random() * 100000)
          }))

          log.debug('Queuing chunk ' + i + ' (' + chunkedPreparedData.length + ' records)')
          this.queueWriteCall(name, recordParams.Records.length, () => {
            kinesis.putRecords(recordParams, (err, resp) => {
              if (err) {
                log.error(err)
                reject(err)
              } else {
                resolve(resp)
              }
            })
          })
        }).then((resp) => {
          return resp
        })
      })
    ).then((responses) => {
      // Combine all responses into a common response doc to ease analysis:
      return responses.reduce((all, resp) => {
        all.Records = all.Records.concat(resp.Records)
        all.FailedRecordCount += resp.FailedRecordCount
        return all
      }, { FailedRecordCount: 0, Records: [], unmergedResponses: responses })
    }).catch((e) => {
      console.log('ERRROR: ', e)
    })
  }

  queueWriteCall (streamName, count, exec) {
    if (!this._writeQueue[streamName]) this._writeQueue[streamName] = []
    this._writeQueue[streamName].push({ count, exec })

    // In case it's not yet running, start processing:
    this.considerProcessingWriteQueue()
  }

  considerProcessingWriteQueue () {
    // process write-queue if there's not already a worker queued to do just that
    if (!this._processTimeoutHandler) this.processWriteQueue()
  }

  processWriteQueue () {
    // Count the total number left to process in all streams:
    var totalToProcess = Object.keys(this._writeQueue).reduce((total, streamName) => {
      return total + this._writeQueue[streamName].reduce((subtotal, batch) => subtotal + batch.count, 0)
    }, 0)
    // log.debug('Total left to proces: ' + totalToProcess)

    // If nothing to process, nullify handler so that we know there's nothing pending
    if (totalToProcess === 0) {
      this._processTimeoutHandler = null
      log.debug('Nothing left to process, pausing')
      return
    }

    Object.keys(this._writeQueue).map((streamName) => {
      // console.log('Processing ' + streamName, this._writeQueue[streamName])
      while (true) {
        // Nothing more to process? Continue
        if (this._writeQueue[streamName].length === 0) break

        // Get next batch count so we know whether or not to process it
        var nextCount = this._writeQueue[streamName][0].count

        // If writing another batch would exceed limit, delay:
        if (this.writesSince(streamName) + nextCount <= this.options.recordsPerSecond) {
          // Grab next batch:
          var batch = this._writeQueue[streamName].shift()

          log.debug('Executing call on ' + streamName + ' w/size: ' + batch.count)
          this.logWriteCall(streamName, batch.count)
          batch.exec()
        } else {
          log.debug('Waiting to process ' + streamName + ' because consuming more would exceed ' + this.options.recordsPerSecond + '/s')
          // Consuming more would exceed rate, so queue
          break
        }
      }
    })

    this._processTimeoutHandler = setTimeout(() => this.processWriteQueue(), 100)
  }

  writesSince (streamName, seconds) {
    seconds = (typeof seconds) === 'undefined' ? 1 : seconds

    if (!this._writesByStream[streamName]) return 0

    var since = (new Date()).getTime() - seconds * 1000
    return this._writesByStream[streamName].reduce((count, log) => {
      if (log.time >= since) count += log.count
      return count
    }, 0)
  }

  logWriteCall (streamName, count) {
    if (!this._writesByStream[streamName]) this._writesByStream[streamName] = []
    this._writesByStream[streamName].push({ count, time: (new Date()).getTime() })
  }

  _writeOne (kinesis, name, preparedData) {
    // Set up params to send to kinesis:
    var recordParams = {
      StreamName: name // kinesisWriteStream.stream
    }
    // Payload is the record itself:
    recordParams.Data = preparedData
    recordParams.PartitionKey = 'sensor-' + Math.floor(Math.random() * 100000)

    return new Promise((resolve, reject) => {
      // Queue it to run
      this.queueWriteCall(name, 1, () => {
        kinesis.putRecord(recordParams, (err, resp) => {
          if (err) {
            log.error(err)
            reject(err)
          } else {
            resolve(resp)
          }
        })
      })
    })
  }

  createStream (name, options) {
    options = options || {}
    options = Object.assign({
      shards: 1,
      failIfExists: false
    }, options)

    var params = {
      ShardCount: options.shards,
      StreamName: name
    }

    return this.kinesisClient().then((kinesis) => {
      return new Promise((resolve, reject) => {
        kinesis.createStream(params, (err, data) => {
          if (err) {
            if (err.code !== 'ResourceInUseException') {
              reject(err)
              return
            } else {
              log.debug('%s stream is already created.', name)
              if (options.failIfExists) reject('Already exists: ' + name)
              else resolve()
            }
          } else {
            log.debug("%s stream doesn't exist. Created a new stream with that name.", name)

            // Poll to make sure stream is in ACTIVE state before start pushing data.
            return this._waitForStreamToBecomeActive(name).then(() => resolve())
          }
        })
      })
    })
  }

  deleteStream (name, options) {
    options = options || {}
    options = Object.assign({
      yesIKnowThisIsPotentiallyDisastrous: false
    }, options)

    if (!options.yesIKnowThisIsPotentiallyDisastrous) return Promise.reject('Failing stream deletion because options.yesIKnowThisIsPotentiallyDisastrous is not set to TRUE')

    var params = {
      StreamName: name
    }

    return this.kinesisClient().then((kinesis) => {
      return new Promise((resolve, reject) => {
        kinesis.deleteStream(params, (err, data) => {
          if (err) reject(err)
          else resolve()
        })
      })
    })
  }

  kinesisClient () {
    if (!this.__kinesisClient) this.__kinesisClient = new AWS.Kinesis({ region: this.options.awsRegion })

    return Promise.resolve(this.__kinesisClient)
  }

  dataApiClient () {
    if (!this.__dataApiClient) this.__dataApiClient = new NyplClient({ base_url: this.options.nyplDataApiClientBase })

    return Promise.resolve(this.__dataApiClient)
  }

  /**
   * Returns a decoded Avro Promise given the proper schema name and data
   * @param {String} schemaName
   * @param {Object|String} data
   * @returns {Promise}
   */
  decodeData (schemaName, data) {
    if (!schemaName || typeof schemaName !== 'string' || schemaName.trim() === '') {
      log.debug('decodeData() schemaName parameter not defined');
      return null;
    }

    if (!data) {
      log.debug('decodeData() data parameter not defined or empty');
      return null;
    }

    return this.dataApiClient().then((api) => {
      return api.get(`current-schemas/${schemaName}`, { authenticate: false }).then((schema) => {
        log.debug('Got schema: ' + `current-schemas/${schemaName}`, schema);
        const avroType = avsc.parse(JSON.parse(schema.schema));

        try {
          const decode = (data) => this.decodeAvroBufferString(data, avroType);
          return Array.isArray(data) ? data.map(decode) : decode(data);
        } catch (e) {
          throw new AvroValidationError(avroType, data)
        }
      });
    });
  }

  /**
   * Returns a decoded Avro Object from a given encoded Buffer
   * @param {String} bufferString
   * @param {Object} avroObject
   * @param {String} encodeType - default encode type base64.
   * @returns Returns a deserialized buffer
   */
  decodeAvroBufferString (bufferString, avroObject, encodeType = 'base64') {
    if (!bufferString) {
      log.debug('Error: decodeAvroBufferString() bufferString parameter not defined or empty');
      return;
    }

    if (typeof avroObject !== 'object') {
      log.debug('Error: decodeAvroBufferString() avroObject is not defined');
      return;
    }

    if (!avroObject.fromBuffer && typeof avroObject.fromBuffer !== 'function') {
      log.debug('Error: decodeAvroBufferString() avroObject.fromBuffer function is not defined');
      return;
    }

    return avroObject.fromBuffer(Buffer.from(bufferString, encodeType));
  }

  _waitForStreamToBecomeActive (name, count) {
    count = count || 1
    log.debug('_waitForStreamToBecomeActive')

    return this.kinesisClient().then((kinesis) => {
      return new Promise((resolve, reject) => {
        kinesis.describeStream({StreamName: name}, (err, data) => {
          if (err) reject(err)
          else {
            log.debug('Current status of the stream is %s. (Check %s of %s)', data.StreamDescription.StreamStatus, count, this.options.maxDescribeCallRetries)
            if (data.StreamDescription.StreamStatus === 'ACTIVE') {
              resolve()
            } else if (count === this.options.maxDescribeCallRetries) {
              reject('Failure to go ACTIVE: %s after %s retries', name, count)
            } else {
              setTimeout(() => {
                this._waitForStreamToBecomeActive(name, count + 1).then(resolve)
              }, 1000 * this.options.waitBetweenDescribeCallsInSeconds)
            }
          }
        })
      })
    })
  }

}

module.exports = Client
