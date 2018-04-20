const chai = require('chai')
const assert = chai.assert
const expect = chai.expect
const chaiAsPromised = require('chai-as-promised')

const fixtures = require('./fixtures')
const Client = require('../index')
chai.use(chaiAsPromised)

describe('Client', function () {
  this.timeout(30000)

  before(function () {
    fixtures.enableFixtures()
  })

  after(function () {
    fixtures.disableFixtures()
  })

  describe('Stream Client Decoding from Schema', () => {
    const client = new Client()
    const singleRecord = {
      'Records': [
        {
          'kinesis': {
            'kinesisSchemaVersion': '1.0',
            'partitionKey': 's1',
            'sequenceNumber': '00000000000000000000000000000000000000000000000000000001',
            'data': 'EmIxODUwMTQ3OAZiaWI=',
            'approximateArrivalTimestamp': 1428537600
          },
          'eventSource': 'aws:kinesis',
          'eventVersion': '1.0',
          'eventID': 'shardId-000000000000:00000000000000000000000000000000000000000000000000000001',
          'eventName': 'aws:kinesis:record',
          'invokeIdentityArn': 'arn:aws:iam::EXAMPLE',
          'awsRegion': 'us-east-1',
          'eventSourceARN': 'arn:aws:kinesis:us-east-1:224280085904:stream/IndexDocument'
        }
      ]
    }

    const multipleRecords = {
      'Records': [
        {
          'kinesis': {
            'kinesisSchemaVersion': '1.0',
            'partitionKey': 's1',
            'sequenceNumber': '00000000000000000000000000000000000000000000000000000001',
            'data': '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',
            'approximateArrivalTimestamp': 1428537600
          },
          'eventSource': 'aws:kinesis',
          'eventVersion': '1.0',
          'eventID': 'shardId-000000000000:00000000000000000000000000000000000000000000000000000001',
          'eventName': 'aws:kinesis:record',
          'invokeIdentityArn': 'arn:aws:iam::EXAMPLE',
          'awsRegion': 'us-east-1',
          'eventSourceARN': 'arn:aws:kinesis:us-east-1:224280085904:stream/Bib'
        },
        {
          'kinesis': {
            'kinesisSchemaVersion': '1.0',
            'partitionKey': 's1',
            'sequenceNumber': '00000000000000000000000000000000000000000000000000000001',
            'data': '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',
            'approximateArrivalTimestamp': 1428537600
          },
          'eventSource': 'aws:kinesis',
          'eventVersion': '1.0',
          'eventID': 'shardId-000000000000:00000000000000000000000000000000000000000000000000000001',
          'eventName': 'aws:kinesis:record',
          'invokeIdentityArn': 'arn:aws:iam::EXAMPLE',
          'awsRegion': 'us-east-1',
          'eventSourceARN': 'arn:aws:kinesis:us-east-1:224280085904:stream/Bib'
        }
      ]
    }

    it('should fail if the schemaName parameter is not defined', () => {
      const decodedData = client.decodeData('', singleRecord.Records[0].kinesis.data)
      expect(decodedData).to.equal(null)
    })

    it('should fail if the schemaName parameter is an empty string', () => {
      const decodedData = client.decodeData(' ', singleRecord.Records[0].kinesis.data)
      expect(decodedData).to.equal(null)
    })

    it('should fail if the schemaName parameter is not of type string', () => {
      const decodedData = client.decodeData(['IndexDocument'], singleRecord.Records[0].kinesis.data)
      expect(decodedData).to.equal(null)
    })

    it('should fail if the data object parameter is not defined', () => {
      const decodedData = client.decodeData('IndexDocument', undefined)
      expect(decodedData).to.equal(null)
    })

    it('should fail if the schema is not valid', () => {
      const incorrectSchema = 'IndexLaLaLa'
      const decodedData = client.decodeData(incorrectSchema, singleRecord.Records[0].kinesis.data)
      expect(decodedData).to.be.rejectedWith(Error)
    })

    it('should fail if the encoded string does NOT match the Schema', () => {
      const incorrectEncodedString = 'EmIxODUwMTQ3OAZiaWXX8282='
      const decodedData = client.decodeData('IndexDocument', incorrectEncodedString)
      return assert.isRejected(decodedData, Error)
    })

    it('should return a promise for a single record', () => {
      const decodedData = client.decodeData('IndexDocument', singleRecord.Records[0].kinesis.data)
      expect(decodedData).to.be.a('promise')
    })

    it('should resolve a single record given a correct schemaName and single block of encoded data', () => {
      const decodedData = client.decodeData('IndexDocument', singleRecord.Records[0].kinesis.data)

      return decodedData.then((result) => {
        expect(result).to.be.an('object')
        expect(result).to.have.property('uri')
        expect(result).to.have.property('type')
      })
    })

    it('should return a promise for multiple records', () => {
      const decodedData = client.decodeData('Bib', multipleRecords.Records.map((i) => i.kinesis.data))
      expect(decodedData).to.be.a('promise')
    })

    it('should resolve multiple records given a correct schemaName and multiple blocks of encoded data', () => {
      const decodedData = client.decodeData('Bib', multipleRecords.Records.map((payload) => payload.kinesis.data))

      return decodedData.then((results) => {
        expect(results).to.be.an('array')

        results.forEach((result) => {
          expect(result).to.have.any.keys('nyplSource', 'id', 'nyplType')
          expect(result.nyplType).to.equal('bib')
        })

        expect(results[0].id).to.equal('11422992')
        expect(results[1].id).to.equal('10018031')
      })
    })
  })
})
