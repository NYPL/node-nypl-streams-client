const log = require('loglevel').getLogger('nypl-streams-client')
const { KinesisClient, PutRecordsCommand } = require('@aws-sdk/client-kinesis')
const NyplClient = require('@nypl/nypl-data-api-client')
const avsc = require('avsc')

const utils = require('./utils')

/**
 * A AvroValidationError is thrown when avsc fails to encode/decode data.
 */
function AvroValidationError (avroType, data) {
  this.name = 'AvroValidationError'

  const messages = AvroValidationError._getAvroValidationIssues(data, avroType).map((e) => {
    return ` * \`${e.path.join('.')}\` should be a ${e.type} but got ${e.value}`
  })
  this.message = 'Validation Errors:\n' + messages.join('\n')
}
AvroValidationError.prototype = Error.prototype

AvroValidationError._getAvroValidationIssues = function (obj, type) {
  const paths = []
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
  /**
   * @typedef {Object} ClientConstructorOptions
   * @property {string} nyplDataApiClientBase - Base URL for API (e.g. 'https://[FQDN]/api/v0.1/').
   *    If missing, client will check process.env.NYPL_API_BASE_URL
   * @property {number} writeBatchSize - How many records to write to a stream
   *    at once. Default 500.
   *    http://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html
   * @property {number} recordsPerSecond - How many records to write to a
   *    stream in a single 1s period. Default 500. AWS max is 1000/s. See:
   *    http://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html
   * @property {number} waitBetweenDescribeCallsInSeconds - How many seconds to
   *    pause between describe calls (i.e. when waiting for active stream).
   *    Default 4
   * @property {number} maxDescribeCallRetries - Maximum describe calls to make
   *    before giving up (i.e. when waiting for active stream). Default 10.
   * @property {string} logLevel - Set [log level](https://github.com/pimterry/loglevel)
   *    (i.e. info, error, warn, debug). Default env.LOG_LEVEL or 'error'
   * @property {AwsClientOptions} awsClientOptions - AWS client options
   *
   * @typedef {Object} AwsClientOptions
   * @property {string} region - AWS region to use. Default us-east-1
   * @property {string} profile - Named profile to use for from local credentials file.
   */

  /**
   * @constructs Client
   * @param {ClientConstructorOptions} options - A hash of options
   */
  constructor (opts) {
    opts = opts || {}
    this.options = Object.assign({
      nyplDataApiClientBase: null,
      writeBatchSize: 500, // aws constraint
      recordsPerSecond: 500,
      waitBetweenDescribeCallsInSeconds: 4,
      maxDescribeCallRetries: 10,
      logLevel: process.env.LOG_LEVEL,
      awsClientOptions: Object.assign({
        region: 'us-east-1'
      }, opts.awsClientOptions || {})
    }, opts)

    if (this.options.logLevel) log.setLevel(this.options.logLevel)

    this._writesByStream = {}
    this._writeQueue = {}
  }

  /**
   * @typedef {Object} WriteOptions
   * @property {boolean} avroEncode - Whether or not to Name of avro schema to use to encode.
   * @property {string} avroSchemaName - Name of avro schema to use to encode.
   *     Defaults to `streamName` (with -qa/-production suffix removed).
   */

  /**
   * @typedef {Object} WriteResponse
   * @property {Array} Records - Array of records written
   * @property {number} FailedRecordCount - Number of records that failed
   * @property {Array} unmergedResponses - Raw AWS responses (for debugging
   *     mult. batch jobs)
   */

  /**
   * Write data to named stream.
   *
   * @param {string} streamName - Name of stream to write to.
   * @param {Object|Array} data - Object (or array of objects) to write.
   * @param {WriteOptions} options
   *
   * @return {Promise<WriteReponse>} A promise that resolves a WriteReponse obj
   *
   * Note, the `data` arg can be an object or array of objects.
   */
  write (streamName, data, opts) {
    opts = opts || {}
    opts = Object.assign({
      avroEncode: true,
      avroSchemaName: this._defaultSchema(streamName)
    }, opts)

    // Ensure data is encoded (or not) as appropriate:
    const prepareData = opts.avroEncode
      ? this.encodeData(opts.avroSchemaName, data)
      : Promise.resolve(data)

    return prepareData.then((preparedData) => {
      return this.kinesisClient().then((kinesis) => {
        const debugLabels = Array.isArray(data) ? data.slice(0, 3).map((r) => r.id).join(', ') + ', ...' : data.id

        log.debug('Queuing ' + debugLabels + ' to ' + streamName)

        // If it's just one record, normalize to processing as array:
        if (!Array.isArray(preparedData)) {
          preparedData = [preparedData]
        }
        return this._writeMultiple(kinesis, streamName, preparedData)
          .then((resp) => {
            log.info(`Successfully sent ${debugLabels} to ${streamName} kinesis.`)
            return resp
          })
      })
    })
  }

  /**
   * @return {Promise<AWS.Kinesis>} A Promise that resolves an instance of
   *     AWS.Kinesis
   */
  kinesisClient () {
    if (!this.__kinesisClient) this.__kinesisClient = new KinesisClient(this.options.awsClientOptions)

    return Promise.resolve(this.__kinesisClient)
  }

  /**
   * @return {Promise<NyplClient>} A Promise that resolves an instance of
   *     the NYPL Data API Client
   *     ( https://www.npmjs.com/package/@nypl/nypl-data-api-client )
   */
  dataApiClient () {
    if (!this.__dataApiClient) this.__dataApiClient = new NyplClient({ base_url: this.options.nyplDataApiClientBase })

    return Promise.resolve(this.__dataApiClient)
  }

  /**
   * Returns Promise that resolves the given data encoded against the named schema
   *
   * @param {String} schemaName
   * @param {Object|String} data
   * @returns {Promise}
   */
  encodeData (schemaName, data) {
    if (!schemaName || typeof schemaName !== 'string' || schemaName.trim() === '') {
      log.debug('encodeData() schemaName parameter not defined')
      return null
    }

    if (!data) {
      log.debug('encodeData() data parameter not defined or empty')
      return null
    }

    return this.getAvroType(schemaName).then((avroType) => {
      try {
        const encode = (data) => avroType.toBuffer(data)
        return Array.isArray(data) ? data.map(encode) : encode(data)
      } catch (e) {
        throw new AvroValidationError(avroType, data)
      }
    })
  }

  /**
   * Returns a Promise that resolves the given data decoded against the given schema.
   *
   * @param {String} schemaName
   * @param {Object|String} data
   * @returns {Promise}
   */
  decodeData (schemaName, data) {
    if (!schemaName || typeof schemaName !== 'string' || schemaName.trim() === '') {
      log.debug('decodeData() schemaName parameter not defined')
      return null
    }

    if (!data) {
      log.debug('decodeData() data parameter not defined or empty')
      return null
    }

    return this.getAvroType(schemaName).then((avroType) => {
      try {
        const decode = (data) => this.decodeAvroBufferString(data, avroType)
        return Array.isArray(data) ? data.map(decode) : decode(data)
      } catch (e) {
        throw new AvroValidationError(avroType, data)
      }
    })
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
      log.debug('Error: decodeAvroBufferString() bufferString parameter not defined or empty')
      return
    }

    if (typeof avroObject !== 'object') {
      log.debug('Error: decodeAvroBufferString() avroObject is not defined')
      return
    }

    if (!avroObject.fromBuffer && typeof avroObject.fromBuffer !== 'function') {
      log.debug('Error: decodeAvroBufferString() avroObject.fromBuffer function is not defined')
      return
    }

    return avroObject.fromBuffer(Buffer.from(bufferString, encodeType))
  }

  /**
   * Returns an avro type instance by schema name
   *
   * @return {Promise<avsc.Type>} A Promise that resolves an avsc.Type instance
   */
  async getAvroType (schemaName) {
    const apiClient = await this.dataApiClient()
    const schemaUrl = `${this.options.nyplDataApiClientBase}current-schemas/${schemaName}`
    try {
      const schema = await apiClient.get(`current-schemas/${schemaName}`, { authenticate: false })
      if (!schema?.data?.schemaObject) {
        const schemaUrl = `this.options.nyplDataApiClientBase}current-schemas/${schemaName}`
        throw new Error(`Error retrieving schema from ${schemaUrl}`)
      }
      log.debug('Got schema: ' + `current-schemas/${schemaName}`, schema)
      return avsc.parse(schema.data.schemaObject)
    } catch (e) {
      throw new Error(`Error retrieving schema from ${schemaUrl}`)
    }
  }

  /**
   * Write array of prepared data to stream.
   *
   * @param {AWS.Kinesis} kinesis - AWS.Kinesis client instance
   * @param {string} name - Stream name
   * @param {array<string>} preparedData - Array of prepared data to be written
   *
   * @private
   *
   * @return {Promise<WriteReponse>} A promise that resolves a WriteReponse obj
   */
  _writeMultiple (kinesis, name, preparedData) {
    // Don't write more than batch size or more than the records-per-second constraint:
    const effectiveWriteSize = Math.min(this.options.writeBatchSize, this.options.recordsPerSecond)
    log.debug('Effective write size: %s', effectiveWriteSize)

    return Promise.all(
      utils.arrayChunk(preparedData, effectiveWriteSize).map((chunkedPreparedData, i) => {
        // Call the appropriate put endpoint:
        return new Promise((resolve, reject) => {
          // Set up params to send to kinesis:
          const recordParams = {
            StreamName: name // kinesisWriteStream.stream
          }
          // Payload is an array of records:
          recordParams.Records = chunkedPreparedData.map((rec) => ({
            Data: rec,
            PartitionKey: 'sensor-' + Math.floor(Math.random() * 100000)
          }))

          log.debug('Queuing chunk ' + i + ' (' + chunkedPreparedData.length + ' records)')
          this._queueWriteCall(name, recordParams.Records.length, () => {
            const command = new PutRecordsCommand(recordParams)
            return kinesis.send(command)
              .then((resp) => resolve(resp))
          })
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

  /**
   * Enqueue a write task
   *
   * @private
   *
   * @param {string} streamName - Name of stream
   * @param {number} count - Number of records the call will write
   * @param {function} exec - Function to fire to execute job.
   */
  _queueWriteCall (streamName, count, exec) {
    if (!this._writeQueue[streamName]) this._writeQueue[streamName] = []
    this._writeQueue[streamName].push({ count, exec })

    // In case it's not yet running, start processing:
    this._considerProcessingWriteQueue()
  }

  /**
   * Invoke processWriteQueue if such a call has not already been queued.
   *
   * @private
   */
  _considerProcessingWriteQueue () {
    // process write-queue if there's not already a worker queued to do just that
    if (!this._processTimeoutHandler) this._processWriteQueue()
  }

  /**
   * This method runs periodically to flush as many write jobs off the write
   * queue as it can without violating write size/speed constraints.
   *
   * @private
   */
  _processWriteQueue () {
    // Count the total number left to process in all streams:
    const totalToProcess = Object.keys(this._writeQueue).reduce((total, streamName) => {
      return total + this._writeQueue[streamName].reduce((subtotal, batch) => subtotal + batch.count, 0)
    }, 0)
    // log.debug('Total left to proces: ' + totalToProcess)

    // If nothing to process, nullify handler so that we know there's nothing pending
    if (totalToProcess === 0) {
      this._processTimeoutHandler = null
      log.debug('Nothing left to process, pausing')
      return
    }

    Object.keys(this._writeQueue).forEach((streamName) => {
      while (true) {
        // Nothing more to process? Continue
        if (this._writeQueue[streamName].length === 0) break

        // Get next batch count so we know whether or not to process it
        const nextCount = this._writeQueue[streamName][0].count

        // If writing another batch would exceed limit, delay:
        if (this._writesSince(streamName) + nextCount <= this.options.recordsPerSecond) {
          // Grab next batch:
          const batch = this._writeQueue[streamName].shift()

          log.debug('Executing call on ' + streamName + ' w/size: ' + batch.count)
          this._logWriteCall(streamName, batch.count)
          batch.exec()
        } else {
          log.debug('Waiting to process ' + streamName + ' because consuming more would exceed ' + this.options.recordsPerSecond + '/s')
          // Consuming more would exceed rate, so queue

          this._processTimeoutHandler = setTimeout(() => this._processWriteQueue(), 100)
          break
        }
      }
    })
  }

  /**
   * Get number of records written in last N seconds. For N=1, useful for
   * determining how many more records we can write in the present moment
   * without exceeding our established writes/s boundary.
   *
   * @private
   *
   * @param {string} streamName - Stream name
   * @param {number} seconds=1 - Number of seconds of history to sum
   *
   * @return {number} Number of writes
   */

  _writesSince (streamName, seconds) {
    seconds = (typeof seconds) === 'undefined' ? 1 : seconds

    if (!this._writesByStream[streamName]) return 0

    const since = (new Date()).getTime() - seconds * 1000
    return this._writesByStream[streamName].reduce((count, log) => {
      if (log.time >= since) count += log.count
      return count
    }, 0)
  }

  /**
   * Register that we have written `count` records to stream
   *
   * @private
   *
   * @param {string} streamName - Name of stream
   * @param {number} count - Number of records written
   */
  _logWriteCall (streamName, count) {
    if (!this._writesByStream[streamName]) this._writesByStream[streamName] = []
    this._writesByStream[streamName].push({ count, time: (new Date()).getTime() })
  }

  /**
   * Write single prepared data object to stream.
   *
   * @private
   *
   * @param {AWS.Kinesis} kinesis - AWS.Kinesis client instance
   * @param {string} name - Stream name
   * @param {string} preparedData - Single prepared data to write
   *
   * @return {Promise<WriteReponse>} A promise that resolves a WriteReponse obj
   */
  _writeOne (kinesis, name, preparedData) {
    // Set up params to send to kinesis:
    const recordParams = {
      StreamName: name // kinesisWriteStream.stream
    }
    // Payload is the record itself:
    recordParams.Data = preparedData
    recordParams.PartitionKey = 'sensor-' + Math.floor(Math.random() * 100000)

    return new Promise((resolve, reject) => {
      // Queue it to run
      this._queueWriteCall(name, 1, () => {
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

  /**
   * Wait for a named stream to become active.
   *
   * @param {string} name - Name of stream.
   *
   * @private
   *
   * @return {Promise} A proimse that resolves when the named stream is active.
   */
  _waitForStreamToBecomeActive (name, count) {
    count = count || 1
    log.debug('_waitForStreamToBecomeActive')

    return this.kinesisClient().then((kinesis) => {
      return new Promise((resolve, reject) => {
        kinesis.describeStream({ StreamName: name }, (err, data) => {
          if (err) reject(err)
          else {
            log.debug('Current status of the stream is %s. (Check %s of %s)', data.StreamDescription.StreamStatus, count, this.options.maxDescribeCallRetries)
            if (data.StreamDescription.StreamStatus === 'ACTIVE') {
              resolve()
            } else if (count === this.options.maxDescribeCallRetries) {
              reject(new Error(`Failure to go ACTIVE: ${name} after ${count} retries`))
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

  /**
   * Given a stream name (e.g. MyEventStream-qa) returns the conventional schema name (MyEventStream)
   */
  _defaultSchema (streamName) {
    return streamName.replace(/-\w+$/, '')
  }
}

module.exports = Client
