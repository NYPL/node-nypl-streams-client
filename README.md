# NYPL Streams Client

Helper lib for interacting with the (internal) NYPL Streams

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

Client options include:
 - **nyplDataApiClientBase**: Base URL for the NYPL Data API, as required by [NYPL API client `base_url`](https://github.com/NYPL-discovery/node-nypl-data-api-client). (Alternatively use env NYPL_API_BASE_URL)
 - **writeBatchSize**: Batch size to use when writing records via `putRecords`. AWS max is 500. Default 500
 - **recordsPerSecond**: Max records to write to stream in a given second through any means. AWS max is 1000. Default 500
 - **waitBetweenDescribeCallsInSeconds**: Delay to insert between successive Describe calls (i.e. when checking stream availability. Default 4
 - **maxDescribeCallRetries**: Maximum number of Describe calls to make before failing. Default 10
 - **awsRegion**: AWS region that your kinesis streams are located in. Default 'us-east-1'
 - **logLevel**: Set [log level](https://github.com/pimterry/loglevel) (i.e. info, error, warn, debug). Default env.LOG_LEVEL or 'error'

### streamsClient.write (streamName, data, opts)

Returns a Promise that resolves when the given data has been written to the named stream.

Params:
 - **streamName**: String name of stream to write to. (Also identifies the avro encoding to use.)
 - **data**: An object (or array of objects) to encode and write to the stream
 - **opts**: Optional options hash that may include:
   - **avroEncode**: Boolean indicating whether or not to avro-encode the data before writing. Default `true`
   - **avroSchemaName**: String schema name identifying avro schema to use when encoding data. Defaults to `streamName`.

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
}).catch((e) => console.error('Error writing to stream: ', e))
```

Above will resolve after `records.length / 500` seconds. The resolved value is a hash merged from the hashes returned from each putRecords call.

## Testing

```js
npm test
```
