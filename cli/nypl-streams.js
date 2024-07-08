#!/usr/bin/env node

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
const { fromIni } = require('@aws-sdk/credential-providers')

const Client = require('../index')
const argv = require('minimist')(process.argv.slice(2))

if (!argv.envfile) throw new Error('Must specify --envfile; See config/sample.env')

if (!argv.profile) throw new Error('Must specify --profile')

function writeToStream (streamName, data) {
  const schemaName = argv.schemaName

  data = JSON.parse(data)

  client.write(streamName, data, { avroSchemaName: schemaName })
    .then((resp) => {
      console.log(`Wrote record to ${streamName}`)
    }).catch((e) => {
      console.log(`Encountered error: ${e}`)
    })
}

dotenv.config({ path: argv.envfile })

const client = new Client({
  nyplDataApiClientBase: process.env.NYPL_API_BASE_URL,
  awsClientOptions: { credentials: fromIni({ profile: argv.profile }) }
})

switch (argv._[0]) {
  case 'write':
    writeToStream(argv._[1], argv._[2])
    break
  default:
    console.log(`Don't understand arguments: ${argv._.join(', ')}`)
}
