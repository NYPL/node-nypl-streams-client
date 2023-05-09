#!/usr/bin/env node

const fs = require('fs')

/**
 *
 *  Usage:
 *
 *  ./cli/nypl-streams.js --envfile ENVFILE --profile PROFILE [--schemaName SCHEMANAME] write STREAMNAME JSON
 *
 *  E.g., to emulate what happens when a SierraBibIdPoller places an id in the SierraBibRetriever stream:
 *
 *  ./cli/nypl-streams.js --envfile ./config/qa.env --profile nypl-digital-dev --schemaName SierraBibRetrievalRequest write SierraBibRetriever-qa '{ "id": "21445503" }'
 */

const dotenv = require('dotenv')
const aws = require('aws-sdk')

const Client = require('../index')
const argv = require('minimist')(process.argv.slice(2))

if (!argv.envfile) throw new Error('Must specify --envfile; See config/sample.env')

function requireAwsCredentials () {
  if (!argv.profile) throw new Error('Must specify --profile')
}

function setProfile (profile) {
  // Set aws creds:
  aws.config.credentials = new aws.SharedIniFileCredentials({
    profile
  })

  // Set aws region:
  let awsSecurity = { region: 'us-east-1' }
  aws.config.update(awsSecurity)
}

function writeToStream (streamName, dataOrPath) {
  // Schema name is the stream name minus the env suffix:
  const schemaName = argv.schemaName || streamName.replace(/-.*/, '')

  console.log('loading ...', dataOrPath)
  if (fs.existsSync(dataOrPath)) {
    console.log(`Loading ${dataOrPath}`)
    dataOrPath = fs.readFileSync(dataOrPath, 'utf8')
  }

  const data = JSON.parse(dataOrPath)
  const count = Array.isArray(data) ? data.length : 1

  client.write(streamName, data, { avroSchemaName: schemaName })
    .then((resp) => {
      console.log(`Wrote ${count} record(s) to ${streamName}`)
    }).catch((e) => {
      console.log(`Encountered error: ${e}`)
    })
}

function decodeData(data) {
  // Schema name is the stream name minus the env suffix:
  const schemaName = argv.schemaName

  client.decodeData(schemaName, data)
    .then((resp) => {
      console.log(`Decoded data to ${resp}`)
    }).catch((e) => {
      console.log(`Encountered error: ${e}`)
    })
}

function writeBulkToStream (streamName, file, template, options) {
  options = Object.assign({
    offset: 0,
    batchSize: 100
  }, options)

  // Schema name is the stream name minus the env suffix:
  const schemaName = argv.schemaName || streamName.replace(/-.*/, '')

  const records = fs.readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.split(','))
    .filter((line) => line.length > 0 && (line.length > 1 || line[0]))

  console.log(`Bulk writing ${records.length} records`)
  _writeBulkToStreamRecurse(streamName, records, template, { offset: options.offset, schemaName })
}

function _writeBulkToStreamRecurse (streamName, records, template, options) {
  options = Object.assign({
    offset: 0,
    batchSize: 100
  }, options)
  if (!options.offset) options.offset = 0

  const data = records.slice(options.offset, options.offset + options.batchSize)
    .map((line) => {
      const matches = template.match(/{{\d+}}/)
      const doc = matches.reduce((s, match) => {
        const index = parseInt(match.replace(/[{}]/g, ''))
        s = s.replace(match, line[index])
        return s
      }, template)
      return JSON.parse(doc)
    })

  let task = () => client.write(streamName, data, { avroSchemaName: options.schemaName })
  if (argv.dryrun) {
    console.log('client.write(', streamName, data, { avroSchemaName: options.schemaName })
    task = () => Promise.resolve()
  }
  task()
    .then((resp) => {
      // Wrote records undefined-NaN of 10 to IndexDocument-qa

      console.log(`Wrote records ${options.offset}-${Math.min(records.length, options.offset + options.batchSize)} of ${records.length} to ${streamName}`)

      if (options.offset + options.batchSize >= records.length) {
        console.log('All done')
      } else {
        options.offset += options.batchSize
        return _writeBulkToStreamRecurse(streamName, records, template, options)
      }
    }).catch((e) => {
      console.log(`Encountered error: ${e}`)
    })
}

function eventFileContent (records, streamName) {
  // Encode as firehose event file?
  if (argv.firehose) {
    return {
      'invocationId': 'invocationIdExample',
      'deliveryStreamArn': 'arn:aws:kinesis:deliveryStream/CircTransAnon-production',
      'sourceKinesisStreamArn': `arn:aws:kinesis:us-east-1:946183545209:stream/${streamName}`,
      'region': 'us-east-1',
      'records': records.map((record) => {
        return {
          'recordId': '49546986683135544286507457936321625675700192471156785154',
          'approximateArrivalTimestamp': 1495072949453,
          'kinesisRecordMetadata': {
            'sequenceNumber': '49545115243490985018280067714973144582180062593244200961',
            'subsequenceNumber': '123456',
            'partitionKey': 'partitionKey-03',
            'shardId': 'shardId-000000000000',
            'approximateArrivalTimestamp': 1495072949453
          },
          'data': record
        }
      })
    }
  }

  // Otherwise, return normal kinesis event:
  return {
    'Records': records.map((record) => {
      return {
        'kinesis': {
          'kinesisSchemaVersion': '1.0',
          'sequenceNumber': '49586053432934900701673372692451976307549532375698374658',
          'approximateArrivalTimestamp': '2018-09-13T16:39:03.217Z',
          'data': record,
          'partitionKey': '5b9a92a72271f'
        },
        'eventSource': 'aws:kinesis',
        'eventVersion': '1.0',
        'eventName': 'aws:kinesis:record',
        'awsRegion': 'us-east-1',
        'invokeIdentityArn': 'arn:aws:iam::224280085904:role/lambda_basic_execution',
        'eventSourceARN': `arn:aws:kinesis:us-east-1:224280085904:stream/${streamName}`
      }
    })
  }
}

function decodeEventFile (infile, outfile, options) {
  const data = JSON.parse(fs.readFileSync(infile))
  // Ensure given file is a kinesis event file
  if (!Array.isArray(data.Records) || data.Records[0].eventSource !== 'aws:kinesis') {
    throw new Error('Given file does not appear to be a Kinesis event file')
  }

  const records = data.Records.map((record) => record.kinesis.data)
  console.log('data: ', records)

  Promise.all(
    records.map(
      (record) => {
        console.log('return client.decodeData(' + options.schemaName + ', ', record)
        return client.decodeData(options.schemaName, record)
      }
    )
  ).then((decodedRecords) => {
    console.log('Decoded records: ', decodedRecords)
    if (outfile) fs.writeFileSync(outfile, JSON.stringify(eventFileContent(decodedRecords, options.schemaName), null, 2))
  })
}

function encodeEventFile (infile, outfile, options) {
  if (!infile) throw new Error('Must specify infile')
  if (!options.schemaName) throw new Error('Must specify --schemaName')

  const data = JSON.parse(fs.readFileSync(infile))
  // Incoming data may just be the data to encode or it may be a fully formed
  // kinesis event file. Handle both.
  let records = null
  // If event file is a complete kinesis event file, extract the records
  if (Array.isArray(data.Records) && data.Records[0].eventSource === 'aws:kinesis') {
    // event.Records) throw new Error('Invalid event file. No Records found')
    records = data.Records.map((record) => record.kinesis.data)

  // Otherwise, event file is assumed to just be the record(s):
  } else {
    records = Array.isArray(data) ? data : [data]
  }

  Promise.all(
    records.map(
      (record) => {
        console.log('client.encodeData(', options.schemaName, record)
        return client.encodeData(options.schemaName, record)
          .then((encodedBuffer) => encodedBuffer.toString('base64'))
      }
    )
  ).then((encodedRecords) => {
    if (outfile) fs.writeFileSync(outfile, JSON.stringify(eventFileContent(encodedRecords, options.schemaName), null, 2))
    console.log('events: ', encodedRecords)
  })
}

dotenv.config({ path: argv.envfile })

setProfile(argv.profile)

const client = new Client({ nyplDataApiClientBase: process.env.NYPL_API_BASE_URL })

switch (argv._[0]) {
  case 'write':
    requireAwsCredentials()
    writeToStream(argv._[1], argv._[2])
    break
  case 'write-bulk':
    requireAwsCredentials()
    writeBulkToStream(argv._[1], argv._[2], argv._[3], { offset: argv.offset, batchSize: argv.batchSize })
    break
  case 'encode-event-file':
    encodeEventFile(argv._[1], argv._[2], { schemaName: argv.schemaName })
    break
  case 'decode-event-file':
    decodeEventFile(argv._[1], argv._[2], { schemaName: argv.schemaName })
    break
  case 'decode-data':
    decodeData(argv._[1], { schemaName: argv.schemaName })
    break
  default:
    console.log(`Don't understand arguments: ${argv._.join(', ')}`)
}
