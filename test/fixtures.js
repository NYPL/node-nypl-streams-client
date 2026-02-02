const sinon = require('sinon')
const md5 = require('md5')
const fs = require('fs')

/**
 * Given an GET path, builds a local path unique to the query
 */
function fixturePath (url) {
  // Use md5 on that to get a short, (mostly) unique string suitable as
  // a filename.
  return `./test/fixtures/query-${md5(url)}.json`
}

/**
 * Enable data-api-client fixtures. Will attempt to serve static files from
 * ./fixtures based on request URL.
 *
 * If process.env.UPDATE_FIXTURES=all, all fixtures will be updated (based on
 * NYPL_API_BASE_URL).
 *
 * If process.env.UPDATE_FIXTURES=if-missing, only those fixtures that are
 * missing will be updated (based on NYPL_API_BASE_URL). Useful for adding new
 * fixtures without introducing trivial changes to existing.
 */
function enableFixtures () {
  const NyplDataApiClient = require('@nypl/nypl-data-api-client')

  // If tests are run with `UPDATE_FIXTURES=[all|if-missing] npm test`, rebuild fixtures:
  if (process.env.UPDATE_FIXTURES) {
    // Create a ref to the original get method, bound to a client instance:
    const originalMethod = NyplDataApiClient.prototype.get.bind(new NyplDataApiClient())

    sinon.stub(NyplDataApiClient.prototype, 'get').callsFake((url) => {
      return fixtureExists(url).then((exists) => {
        // If it doesn't exist, or we're updating everything, update it:
        if (process.env.UPDATE_FIXTURES === 'all' || !exists) {
          console.log(`Writing ${fixturePath(url)} because ${process.env.UPDATE_FIXTURES === 'all' ? 'we\'re updating everything' : 'it doesn\'t exist'}`)
          return originalMethod(url, { authenticate: false })
            // Now write the response to local fixture:
            .then((resp) => writeResponseToFixture(url, resp))
            // And for good measure, let's immediately rely on the local fixture:
            .then(() => clientSearchViaFixtures(url))
        } else {
          return clientSearchViaFixtures(url)
        }
      })
    })
  } else {
    // Any internal call to app.esClient.search should load a local fixture:
    sinon.stub(NyplDataApiClient.prototype, 'get').callsFake(clientSearchViaFixtures)
  }
}

/**
 * Emulates NyplDataApiClient.prototype.get via local fixtures
 */
function clientSearchViaFixtures (url) {
  const path = fixturePath(url)
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf8', (err, content) => {
      if (err) {
        console.error(`Missing fixture (${path}) for `, url)
        return reject(err)
      }

      return resolve(JSON.parse(content))
    })
  })
}

/**
 * Determine if the fixture for the given query exists on disk, async.
 *
 * @returns {Promise<boolean>} A promise that resolves a boolean: true if fixture exists, false otherwise.
 */
function fixtureExists (url) {
  const path = fixturePath(url)
  return new Promise((resolve, reject) => {
    fs.access(path, (err, fd) => {
      const exists = !err
      return resolve(exists)
    })
  })
}

/**
 * Given a URL, this function:
 *  - determines the fixture path and
 *  - writes the given response to a local fixture
 */
function writeResponseToFixture (url, resp) {
  const path = fixturePath(url)
  return new Promise((resolve, reject) => {
    fs.writeFile(path, JSON.stringify(resp, null, 2), (err, res) => {
      if (err) return reject(err)

      return resolve()
    })
  })
}

/**
 * Use in `after/afterEach` to restore (de-mock)
 */
function disableFixtures () {
  const nyplDataApiClient = require('@nypl/nypl-data-api-client')
  nyplDataApiClient.prototype.get.restore()
}

module.exports = {
  enableFixtures,
  disableFixtures
}
