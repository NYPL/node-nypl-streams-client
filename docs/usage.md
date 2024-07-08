## Classes

<dl>
<dt><a href="#Client">Client</a></dt>
<dd></dd>
</dl>

## Functions

<dl>
<dt><a href="#AvroValidationError">AvroValidationError()</a></dt>
<dd><p>A AvroValidationError is thrown when avsc fails to encode/decode data.</p>
</dd>
</dl>

## Typedefs

<dl>
<dt><a href="#ClientConstructorOptions">ClientConstructorOptions</a> : <code>Object</code></dt>
<dd></dd>
<dt><a href="#AwsClientOptions">AwsClientOptions</a> : <code>Object</code></dt>
<dd></dd>
<dt><a href="#WriteOptions">WriteOptions</a> : <code>Object</code></dt>
<dd></dd>
<dt><a href="#WriteResponse">WriteResponse</a> : <code>Object</code></dt>
<dd></dd>
</dl>

<a name="Client"></a>

## Client
**Kind**: global class  

* [Client](#Client)
    * [new Client(options)](#new_Client_new)
    * [.write(streamName, data, options)](#Client+write) ⇒ <code>Promise.&lt;WriteReponse&gt;</code>
    * [.kinesisClient()](#Client+kinesisClient) ⇒ <code>Promise.&lt;AWS.Kinesis&gt;</code>
    * [.dataApiClient()](#Client+dataApiClient) ⇒ <code>Promise.&lt;NyplClient&gt;</code>
    * [.encodeData(schemaName, data)](#Client+encodeData) ⇒ <code>Promise</code>
    * [.decodeData(schemaName, data)](#Client+decodeData) ⇒ <code>Promise</code>
    * [.decodeAvroBufferString(bufferString, avroObject, encodeType)](#Client+decodeAvroBufferString) ⇒
    * [.getAvroType()](#Client+getAvroType) ⇒ <code>Promise.&lt;avsc.Type&gt;</code>
    * [._defaultSchema()](#Client+_defaultSchema)

<a name="new_Client_new"></a>

### new Client(options)

| Param | Type | Description |
| --- | --- | --- |
| options | [<code>ClientConstructorOptions</code>](#ClientConstructorOptions) | A hash of options |

<a name="Client+write"></a>

### client.write(streamName, data, options) ⇒ <code>Promise.&lt;WriteReponse&gt;</code>
Write data to named stream.

**Kind**: instance method of [<code>Client</code>](#Client)  
**Returns**: <code>Promise.&lt;WriteReponse&gt;</code> - A promise that resolves a WriteReponse obj

Note, the `data` arg can be an object or array of objects.  

| Param | Type | Description |
| --- | --- | --- |
| streamName | <code>string</code> | Name of stream to write to. |
| data | <code>Object</code> \| <code>Array</code> | Object (or array of objects) to write. |
| options | [<code>WriteOptions</code>](#WriteOptions) |  |

<a name="Client+kinesisClient"></a>

### client.kinesisClient() ⇒ <code>Promise.&lt;AWS.Kinesis&gt;</code>
**Kind**: instance method of [<code>Client</code>](#Client)  
**Returns**: <code>Promise.&lt;AWS.Kinesis&gt;</code> - A Promise that resolves an instance of
    AWS.Kinesis  
<a name="Client+dataApiClient"></a>

### client.dataApiClient() ⇒ <code>Promise.&lt;NyplClient&gt;</code>
**Kind**: instance method of [<code>Client</code>](#Client)  
**Returns**: <code>Promise.&lt;NyplClient&gt;</code> - A Promise that resolves an instance of
    the NYPL Data API Client
    ( https://www.npmjs.com/package/@nypl/nypl-data-api-client )  
<a name="Client+encodeData"></a>

### client.encodeData(schemaName, data) ⇒ <code>Promise</code>
Returns Promise that resolves the given data encoded against the named schema

**Kind**: instance method of [<code>Client</code>](#Client)  

| Param | Type |
| --- | --- |
| schemaName | <code>String</code> | 
| data | <code>Object</code> \| <code>String</code> | 

<a name="Client+decodeData"></a>

### client.decodeData(schemaName, data) ⇒ <code>Promise</code>
Returns a Promise that resolves the given data decoded against the given schema.

**Kind**: instance method of [<code>Client</code>](#Client)  

| Param | Type |
| --- | --- |
| schemaName | <code>String</code> | 
| data | <code>Object</code> \| <code>String</code> | 

<a name="Client+decodeAvroBufferString"></a>

### client.decodeAvroBufferString(bufferString, avroObject, encodeType) ⇒
Returns a decoded Avro Object from a given encoded Buffer

**Kind**: instance method of [<code>Client</code>](#Client)  
**Returns**: Returns a deserialized buffer  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| bufferString | <code>String</code> |  |  |
| avroObject | <code>Object</code> |  |  |
| encodeType | <code>String</code> | <code>base64</code> | default encode type base64. |

<a name="Client+getAvroType"></a>

### client.getAvroType() ⇒ <code>Promise.&lt;avsc.Type&gt;</code>
Returns an avro type instance by schema name

**Kind**: instance method of [<code>Client</code>](#Client)  
**Returns**: <code>Promise.&lt;avsc.Type&gt;</code> - A Promise that resolves an avsc.Type instance  
<a name="Client+_defaultSchema"></a>

### client.\_defaultSchema()
Given a stream name (e.g. MyEventStream-qa) returns the conventional schema name (MyEventStream)

**Kind**: instance method of [<code>Client</code>](#Client)  
<a name="AvroValidationError"></a>

## AvroValidationError()
A AvroValidationError is thrown when avsc fails to encode/decode data.

**Kind**: global function  
<a name="ClientConstructorOptions"></a>

## ClientConstructorOptions : <code>Object</code>
**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| nyplDataApiClientBase | <code>string</code> | Base URL for API (e.g. 'https://[FQDN]/api/v0.1/').    If missing, client will check process.env.NYPL_API_BASE_URL |
| writeBatchSize | <code>number</code> | How many records to write to a stream    at once. Default 500.    http://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html |
| recordsPerSecond | <code>number</code> | How many records to write to a    stream in a single 1s period. Default 500. AWS max is 1000/s. See:    http://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html |
| waitBetweenDescribeCallsInSeconds | <code>number</code> | How many seconds to    pause between describe calls (i.e. when waiting for active stream).    Default 4 |
| maxDescribeCallRetries | <code>number</code> | Maximum describe calls to make    before giving up (i.e. when waiting for active stream). Default 10. |
| logLevel | <code>string</code> | Set [log level](https://github.com/pimterry/loglevel)    (i.e. info, error, warn, debug). Default env.LOG_LEVEL or 'error' |
| awsClientOptions | [<code>AwsClientOptions</code>](#AwsClientOptions) | AWS client options |

<a name="AwsClientOptions"></a>

## AwsClientOptions : <code>Object</code>
**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| region | <code>string</code> | AWS region to use. Default us-east-1 |
| profile | <code>string</code> | Named profile to use for from local credentials file. |

<a name="WriteOptions"></a>

## WriteOptions : <code>Object</code>
**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| avroEncode | <code>boolean</code> | Whether or not to Name of avro schema to use to encode. |
| avroSchemaName | <code>string</code> | Name of avro schema to use to encode.     Defaults to `streamName` (with -qa/-production suffix removed). |

<a name="WriteResponse"></a>

## WriteResponse : <code>Object</code>
**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| Records | <code>Array</code> | Array of records written |
| FailedRecordCount | <code>number</code> | Number of records that failed |
| unmergedResponses | <code>Array</code> | Raw AWS responses (for debugging     mult. batch jobs) |

