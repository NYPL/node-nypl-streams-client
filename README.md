# NYPL Streams Client

This is a helper module for reading and writing to NYPL streams with/without Avro encoding.

## Installation

Install it via npm for use inside your project:

```js
npm i @nypl/nypl-streams-client --save
```

## Usage

```js
const NyplStreamsClient = require('@nypl/nypl-Streams-client')
var streamsClient = new NyplStreamsClient({ nyplDataApiClientBase: 'http://example.com/api/v0.1/' })
```

See [docs/usage.md](docs/usage.md) for complete documentation of Client methods and use.

### Example 1: Writing data to a stream

To write a single record to a stream (encoded to "MyStream" schema):
```js
streamsClient.write('MyStream', { id: 'id1', field1: 1, field2: 2 }).then((resp) => {
  console.log('Finished writing to stream ' + resp.Records.length)
}).catch((e) => console.error('Error writing to stream: ', e))
```

To write multiple records to a stream, batched and rate-limited to avoid write errors:
```js
var records = [ { id: 'id1', field1: 1, field2: 2 }, { id: 'id2', field1: 1 }, ... ] // Array of any length
var options = {
  recordsPerSecond: 500 // This is the default and well below the 1000/s AWS constraint
}
streamsClient.write('MyStream', records, options).then((resp) => {
  console.log('Finished writing to stream ' + resp.Records.length)
  console.log(`Failed to write: ${resp.FailedRecordCount} record(s)`)
}).catch((e) => console.error('Error writing to stream: ', e))
```

Above will resolve after `records.length / 500` seconds. The resolved value is a hash merged from the hashes returned from each putRecords call.

### Example 2: Decoding data obtained from a stream

The streams client can be used for decoding data obtained directly from a stream (i.e. via a Lambda Kinesis source).

Example lambda handler with a kinesis trigger:

```js
exports.handler = function (event, context, callback) {
  // Initialize streams client:
  const streamsClient = new NyplStreamsClient({ nyplDataApiClientBase: 'http://example.com/api/v0.1/' })
  const record = event.Records[0]

  if (record.kinesis) {
    const decodedKinesisData = streamsClient.decodeData('SchemaName', event.Records.map(record => record.kinesis.data));

    // Resolve the Promise and do something with the decoded data
    return decodedKinesisData
      .then((result) => console.log('result:', result))
      .catch((err) => console.log('rejected:', err));
  }
}
```

## CLI

The library includes a CLI for writing arbitary events to streams. Care should be taken to construct events that confirm to the relevant schema.

For example, to write a `SierraBibRetrievalRequest` encoded event to the `SierraBibRetriever-qa` stream:
```
cli/nypl-streams.js --envfile config/qa.env --profile nypl-digital-dev write SierraBibRetriever-qa --schemaName SierraBibRetrievalRequest '{ "id": "21747246" }'
```

Or, to process a whole CSV:
```
cli/nypl-streams.js --envfile config/qa.env --profile nypl-digital-dev write-bulk IndexDocument-qa --schemaName IndexDocument input.csv '{ "uri": "{{0}}", "type": "record" }'
```

## Git workflow

 - Cut feature branch from master.
 - Create PR to merge feature branch into master
 - After PR approved by multiple co-workers, the author merges the PR.
 - Tag master with an appropriate version bump and publish to NPMJS (See https://github.com/NYPL/engineering-general/blob/master/standards/versioning.md#npm-versioning )


## Testing

```js
npm test
```
