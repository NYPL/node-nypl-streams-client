#!/usr/bin/env node

const client = require('@nypl/nypl-streams-client')
const argv = require('minimist')(process.argv.slice(2))

console.log('argv: ', client, argv)
switch (argv._[0]) {
}
