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
const streamsClient = new NyplStreamsClient({ nyplDataApiClientBase: 'https://example.com/api/v0.1/' })
```

See [docs/usage.md](docs/usage.md) for complete documentation of Client methods and use.

### Example 1: Writing data to a stream

To write a single record to a stream (encoded to "MyStream" schema):

```js
try {
  const response = await streamsClient.write('MyStream', { id: 'id1', field1: 1, field2: 2 })
  console.log('Finished writing to stream ' + response.Records.length)
} catch (e) {
  console.error('Error writing to stream: ', e)
}
```

To write multiple records to a stream, batched and rate-limited to avoid write errors:

```js
const records = [ { id: 'id1', field1: 1, field2: 2 }, { id: 'id2', field1: 1 }, ... ] // Array of any length
const options = {
  recordsPerSecond: 500 // This is the default and well below the 1000/s AWS constraint
}
try {
  const response = await streamsClient.write('MyStream', records, options)
  console.log('Finished writing to stream ' + resp.Records.length)
  console.log(`Failed to write: ${resp.FailedRecordCount} record(s)`)
} catch (e) {
  console.error('Error writing to stream: ', e)
}
```

Above will resolve after `records.length / 500` seconds. The resolved value is a hash merged from the hashes returned from each putRecords call.

### Example 2: Decoding data obtained from a stream

The streams client can be used for decoding data obtained directly from a stream (i.e. via a Lambda Kinesis source).

Example lambda handler with a kinesis trigger:

```js
exports.handler = async (event, context, callback) => {
  // Initialize streams client:
  const streamsClient = new NyplStreamsClient({ nyplDataApiClientBase: 'http://example.com/api/v0.1/' })
  const record = event.Records[0]

  if (record.kinesis) {
    const encoded = event.Records.map(record => record.kinesis.data)

    try {
      const decoded = await streamsClient.decodeData('SchemaName', encoded)
    } catch (e) => {
      console.error('Error decoding event: ', e)
    }
  }
}
```

## CLI

The library includes a CLI for writing arbitary events to streams. Care should be taken to construct events that confirm to the relevant schema.

For example, to write a `SierraBibRetrievalRequest` encoded event to the `SierraBibRetriever-qa` stream:
```
./cli/nypl-streams.js --envfile config/qa.env --profile nypl-digital-dev write SierraBibRetriever-qa --schemaName SierraBibRetrievalRequest '{ "id": "21747246" }'
```

## Git workflow

 - Cut feature branch from main.
 - Create PR to merge feature branch into main
 - After PR approved by multiple co-workers, the author merges the PR.

### Publishing to NPMJS

Once the PR has been approved and merged, check out the target branch locally and:

1. Bump the version:

 - Bump the version number in `package.json`
 - Run `nvm use; npm i` to update `package-lock.json`
 - Commit changes
 - Git tag it (e.g. `git tag -a v2.1.1`)
 - Push changes to origin (including tags via `git push --tags`)

2. Publish changes to NPMJS:

 - Run npm publish --dry-run to verify nothing is being packaged that should not be!
 - `npm publish`

## Testing

```js
npm test
```
