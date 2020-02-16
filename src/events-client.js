const AWS = require("aws-sdk");
const jsondiffpatch = require("jsondiffpatch").create();
const v8n = require("v8n");

class Client {
  constructor({
    eventBridgeClient = new AWS.EventBridge(),
    eventBusName = "default",
    source = process.env.StackName
  }) {
    this.busName = eventBusName;
    this.source = source || process.env.StackName;
    this.eventBridgeClient = eventBridgeClient;
  }

  async send(detailType, events) {
    if (this.isDynamoDB(events)) {
      events = this.parseDynamoDB(events)
    }

    events = Array.isArray(events) ? events : [events];
    this.validate(detailType, events);

    const eventList = { Entries: [] };
    for (let event of events) {
      if (!this.isEvent(event)) {
        event = { data: event, metadata: {} };
      }
      this.jsonDiff(event);
      eventList.Entries.push({
        Source: this.source,
        DetailType: detailType,
        Detail: JSON.stringify(event),
        EventBusName: this.busName
      });
    }

    const result = await this.eventBridgeClient.putEvents(eventList).promise();
    return {
      FailedCount: result.FailedEntryCount,
      FailedReasons: result.Entries.filter(e => !e.EventId)
    };
  }

  isDynamoDB(event) {
    return event.Records && event.Records[0].eventSource === "aws:dynamodb";
  }

  parseDynamoDB(event) {
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

    if (events < 1 || events > 10) {
      throw `Event smust be between between 1 and 10 inclusive. Got ${events.length}`;
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
    return !obj || Object.keys(obj).length === 0
  }

  jsonDiff(event) {
    if (!this.isNullOrEmpty(event.data.new) && !this.isNullOrEmpty(event.data.old)) {
      event.metadata.diff = jsondiffpatch.diff(event.data.old, event.data.new);
      event.metadata.action = "update";
    }

    if (!this.isNullOrEmpty(event.data.new) && this.isNullOrEmpty(event.data.old)) {
      event.metadata.action = "create";
    }

    if (this.isNullOrEmpty(event.data.new) && !this.isNullOrEmpty(event.data.old)) {
      event.metadata.action = "delete";
    }
  }
}

module.exports = {
  Client
};
