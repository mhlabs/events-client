const AWS = require("aws-sdk");
const jsondiffpatch = require("jsondiffpatch").create();
var jp = require("jsonpath");
const { v4: uuidv4 } = require("uuid");
const s3Bucket = process.env.LargeNodesBucket;

class Client {
  constructor({
    eventBridgeClient = new AWS.EventBridge(),
    eventBusName = "default",
    source = process.env.StackName,
    s3Client = new AWS.S3()
  }) {
    this.busName = eventBusName;
    this.source = source || process.env.StackName;
    this.eventBridgeClient = eventBridgeClient;
    this.s3Client = s3Client;
  }

  async prepare(detailType, event, largeNodes) {
    if (!this.isEvent(event)) {
      event = { data: event, metadata: {} };
    }
    this.jsonDiff(event);
    if (largeNodes) {
      // && this.isToolarge(event)) {
      await this.handleLargeNodes(detailType, event, largeNodes);
      event.metadata.largeNodes = largeNodes;
    }
    return {
      Source: this.source,
      DetailType: detailType,
      Detail: JSON.stringify(event),
      EventBusName: this.busName
    };
  }

  isToolarge(event) {
    return this.lengthInUtf8Bytes(event) > 250000; // really 256k, but leaving a buffer
  }

  async handleLargeNodes(detailType, event, largeNodes) {
    for (const path of largeNodes) {
      let node = jp.query(event, path);
      if (node) {
        // const key = `${this.busName}/${this.source}/${detailType}/${uuidv4()}`;
        // await this.s3Client.putObject( {Bucket: s3Bucket, Key: key, Body: JSON.stringify({ data: node}), ContentType: 'application/json; charset=utf-8', }).promise()
      }
      node = null; // { type: "s3-bridge", bucket: s3Bucket, key: key };
      jp.value(event, path, node);
    }
  }

  lengthInUtf8Bytes(str) {
    var m = encodeURIComponent(str).match(/%[89ABab]/g);
    return str.length + (m ? m.length : 0);
  }

  async send(detailType, events, largeNodes) {
    if (this.isDynamoDB(events)) {
      const tempLargeNodes = [];
      if (largeNodes) {
        for (const node of largeNodes) {
          tempLargeNodes.push(node.replace("$.", "$.data.old."));
          tempLargeNodes.push(node.replace("$.", "$.data.new."));
        }
        largeNodes = tempLargeNodes;
      }
      events = this.unmarshallDynamoDBEvent(events);
    }

    events = Array.isArray(events) ? events : [events];
    this.validate(detailType, events);

    const eventList = { Entries: [] };
    for (let event of events) {
      eventList.Entries.push(await this.prepare(detailType, event, largeNodes));
    }

    try {
      const result = await this.eventBridgeClient
        .putEvents(eventList)
        .promise();      
      return {
        FailedCount: result.FailedEntryCount,
        FailedReasons: result.Entries.filter(e => !e.EventId),
        Events: events
      };
    } catch (err) {
      console.log(JSON.stringify(eventList, null, 2));
      throw err;
    }

  }

  isDynamoDB(event) {
    return event.Records && event.Records[0].eventSource === "aws:dynamodb";
  }

  unmarshallDynamoDBEvent(event) {
    return event.Records.map(p => {
      const oldImage = AWS.DynamoDB.Converter.unmarshall(p.dynamodb.OldImage);
      const newImage = AWS.DynamoDB.Converter.unmarshall(p.dynamodb.NewImage);
      return { old: oldImage, new: newImage };
    });
  }

  validate(detailType, events) {
    const validationResult = this.validateNull(detailType, events);
    if (validationResult.length > 0) {
      throw `Cannot be null: ${validationResult}`;
    }
    if (events.length < 1 || events.length > 10) {
      throw `Events must be between between 1 and 10 inclusive. Got ${events.length}`;
    }
  }

  validateNull(detailType, entries) {
    return [
      { detailType },
      { entries },
      { source: this.source },
      { busName: this.busName }
    ]
      .filter(p => !p[Object.keys(p)[0]])
      .map(p => Object.keys(p)[0]);
  }

  isEvent(obj) {
    const keys = Object.keys(obj);
    if (
      keys.length === 2 &&
      keys.includes("data") &&
      keys.includes("metadata")
    ) {
      return true;
    }
    return false;
  }

  isNullOrEmpty(obj) {
    return !obj || Object.keys(obj).length === 0;
  }

  jsonDiff(event) {
    if (
      !this.isNullOrEmpty(event.data.new) &&
      !this.isNullOrEmpty(event.data.old)
    ) {
      event.metadata.diff = jsondiffpatch.diff(event.data.old, event.data.new);
      event.metadata.action = "update";
    }

    if (
      !this.isNullOrEmpty(event.data.new) &&
      this.isNullOrEmpty(event.data.old)
    ) {
      event.metadata.action = "create";
    }

    if (
      this.isNullOrEmpty(event.data.new) &&
      !this.isNullOrEmpty(event.data.old)
    ) {
      event.metadata.action = "delete";
    }
  }
}

exports.Client = Client;
