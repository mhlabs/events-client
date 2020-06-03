const AWS = require("aws-sdk");
const events = require("../src/events-client");
const faker = require("faker");
const jp = require("jsonpath");

let eventBridgeClient = new AWS.EventBridge();
let s3Client = new AWS.EventBridge();
const promiseMock = jest.fn();
const s3PromiseMock = jest.fn();
var eventBridgePromise = {
  promise: promiseMock.mockImplementation((request) => {
    return new Promise((resolve, reject) => {
      const response = {
        FailedEntryCount: 0,
        Entries: [],
      };
      resolve(response);
    });
  }),
};
const eventBridgeMock = jest.fn();
eventBridgeClient = {
  putEvents: (req) => {
    eventBridgeMock(req);
    return eventBridgePromise;
  },
};

var s3Promise = {
  promise: s3PromiseMock.mockImplementation((request) => {
    return new Promise((resolve, reject) => {
      const response = {};
      resolve(response);
    });
  }),
};
const s3Mock = jest.fn();
s3Client = {
  putObject: (req) => {
    s3Mock(req);
    return s3Promise;
  },
};

beforeEach(() => {
  eventBridgeMock.mockReset();
});

test("Initialise with default eventbus", async () => {
  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    source: "test",
  });
  await await client.send("test", { a: 1 });
  const request = eventBridgeMock.mock.calls[0][0];
  expect(request.Entries[0].EventBusName).toBe("default");
  expect(eventBridgeMock.mock.calls.length).toBe(1);
});

test("Initialise with custom eventbus", async () => {
  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    source: "test",
    eventBusName: "testbus",
  });
  await await client.send("test", { a: 1 });
  const request = eventBridgeMock.mock.calls[0][0];
  expect(request.Entries[0].EventBusName).toBe("testbus");
  expect(eventBridgeMock.mock.calls.length).toBe(1);
});

test("Initialise with null source", async () => {
  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: null,
  });
  await expect(client.send("test", { a: 1 })).rejects.toEqual(
    "Cannot be null: source"
  );
});

test("Initialise with null detailType", async () => {
  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });
  await expect(client.send(null, { a: 1 })).rejects.toEqual(
    "Cannot be null: detailType"
  );
});

test("Initialise with zero events", async () => {
  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });
  await expect(client.send("test", [])).rejects.toEqual(
    "Events must be between between 1 and 10 inclusive. Got 0"
  );
});

test("Initialise with 1 events", async () => {
  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });
  await client.send("test", { a: 1 });
  expect(eventBridgeMock.mock.calls.length).toBe(1);
});

test("Initialise with 10 events", async () => {
  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });

  const array = Array(10)
    .fill()
    .map((_, i) => {
      return { a: i };
    });

  await client.send("test", array);

  const request = eventBridgeMock.mock.calls[0][0];
  expect(request.Entries.length).toBe(10);
  expect(eventBridgeMock.mock.calls.length).toBe(1);
});

test("Unwrapped events get wrapped", async () => {
  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });

  const testEvent = { a: 1 };
  await client.send("test", testEvent);

  const request = eventBridgeMock.mock.calls[0][0];
  const detail = JSON.parse(request.Entries[0].Detail);
  expect(detail.metadata).toBeTruthy();
  expect(detail.data).toBeTruthy();
  expect(detail.data).toEqual(testEvent);
  expect(Object.keys(detail.metadata).length).toBe(0);
});

test("Wrapped events don't get double-wrapped", async () => {
  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });

  const testEvent = { data: { a: 1 }, metadata: {} };
  await client.send("test", testEvent);

  const request = eventBridgeMock.mock.calls[0][0];
  const detail = JSON.parse(request.Entries[0].Detail);
  expect(detail.metadata).toBeTruthy();
  expect(detail.data).toBeTruthy();
  expect(detail.data.metadata).not.toBeTruthy();
  expect(detail.data.data).not.toBeTruthy();
  expect(detail.data).toEqual(testEvent.data);
  expect(Object.keys(detail.metadata).length).toBe(0);
});

test("Events with new/old get a diff in metadata", async () => {
  // This is only asserting that the metadata is applied. Not testing if jsondiffpatch works as it should

  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });

  const testEvent = {
    data: {
      old: { a: 1, b: { z: { zz: [1] } } },
      new: { a: 2, b: { x: "abc", z: { zz: [2, 2] } } },
    },
    metadata: {},
  };
  await client.send("test", testEvent);
  const request = eventBridgeMock.mock.calls[0][0];
  const detail = JSON.parse(request.Entries[0].Detail);
  console.log(JSON.stringify(detail.metadata.diff, null, 2));
  console.log(detail.metadata.pathDiff);
  expect(detail.metadata.diff).toBeTruthy();
  expect(detail.metadata.pathDiff).toBeTruthy();
});

test("Events with new/old get a diff and action in metadata", async () => {
  // This is only asserting that the metadata is applied. Not testing if jsondiffpatch works as it should

  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });

  const testEvent = {
    data: { old: { a: 1, b: { c: 1 } }, new: { a: 2, b: { c: 2, d: 12 } } },
    metadata: {},
  };

  await client.send("test", testEvent);

  const request = eventBridgeMock.mock.calls[0][0];
  const detail = JSON.parse(request.Entries[0].Detail);
  console.log(JSON.stringify(detail));
  expect(detail.metadata.diff).toBeTruthy();
  expect(detail.metadata.action).toBe("update");
});

test("Events with new/old but no diff don't break", async () => {
  // This is only asserting that the metadata is applied. Not testing if jsondiffpatch works as it should

  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });

  const testEvent = {
    data: { old: { a: 1, b: { c: 1 } }, new: { a: 1, b: { c: 1 } } },
    metadata: {},
  };

  await client.send("test", testEvent);

  const request = eventBridgeMock.mock.calls[0][0];
  const detail = JSON.parse(request.Entries[0].Detail);
  console.log(JSON.stringify(detail));
  expect(detail.metadata.diff).not.toBeTruthy();
  expect(detail.metadata.pathDiff).not.toBeTruthy();
  expect(detail.metadata.action).toBe("update");
});

test("Events with only new get a 'create' action in metadata and no diff", async () => {
  // This is only asserting that the metadata is applied. Not testing if jsondiffpatch works as it should

  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });

  const testEvent = { data: { old: null, new: { a: 2 } }, metadata: {} };
  await client.send("test", testEvent);

  const request = eventBridgeMock.mock.calls[0][0];
  const detail = JSON.parse(request.Entries[0].Detail);

  expect(detail.metadata.diff).not.toBeTruthy();
  expect(detail.metadata.action).toBe("create");
});

test("Events with only old get a 'delete' action in metadata and no diff", async () => {
  // This is only asserting that the metadata is applied. Not testing if jsondiffpatch works as it should

  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });

  const testEvent = { data: { old: { a: 1 }, new: null }, metadata: {} };
  await client.send("test", testEvent);

  const request = eventBridgeMock.mock.calls[0][0];
  const detail = JSON.parse(request.Entries[0].Detail);

  expect(detail.metadata.diff).not.toBeTruthy();
  expect(detail.metadata.action).toBe("delete");
});

test("Parse dynamodb event", async () => {
  // This is only asserting that the metadata is applied. Not testing if jsondiffpatch works as it should

  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });

  const testEvent = require("./dynamodb");
  await client.send("test", testEvent);

  const request = eventBridgeMock.mock.calls[0][0];
  const created = JSON.parse(request.Entries[0].Detail);
  const updated = JSON.parse(request.Entries[1].Detail);
  const deleted = JSON.parse(request.Entries[2].Detail);

  expect(created.metadata.action).toBe("create");
  expect(updated.metadata.action).toBe("update");
  expect(deleted.metadata.action).toBe("delete");
});

test("Parse dynamodb with large item", async () => {
  // This is only asserting that the metadata is applied. Not testing if jsondiffpatch works as it should

  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    eventBusName: "testbus",
    source: "test",
  });

  const testEvent = require("./dynamodb");
  await client.send("test", testEvent, ["$.Message"]);
  const request = eventBridgeMock.mock.calls[0][0];
  const created = JSON.parse(request.Entries[0].Detail);
  const updated = JSON.parse(request.Entries[1].Detail);
  const deleted = JSON.parse(request.Entries[2].Detail);

  expect(created.metadata.action).toBe("create");
  expect(updated.metadata.action).toBe("update");
  expect(deleted.metadata.action).toBe("delete");
});

test(">250k is considered large", async () => {
  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    s3Client: s3Client,
    eventBusName: "testbus",
    source: "test",
  });

  const testEvent = {
    Id: 1234,
    Name: "Item with a large list",
    BigList: [],
  };

  while (client.lengthInUtf8Bytes(JSON.stringify(testEvent)) <= 250000) {
    testEvent.BigList.push(faker.helpers.createCard());
  }
  expect(client.isToolarge(JSON.stringify(testEvent))).toBe(true);
});

test("large nodes get replaced with S3 reference", async () => {
  const client = new events.Client({
    eventBridgeClient: eventBridgeClient,
    s3Client: s3Client,
    eventBusName: "testbus",
    source: "test",
  });

  const testEvent = {
    data: {
      old: {
        Id: 1234,
        Name: "Item with a large list",
        BigList: [],
      },
      new: {
        Id: 1234,
        Name: "Item with a large list",
        BigList: [],
      },
    },
  };

  while (client.lengthInUtf8Bytes(JSON.stringify(testEvent)) <= 125000) {
    testEvent.data.old.BigList.push(faker.helpers.createCard());
    testEvent.data.new.BigList.push(faker.helpers.createCard());
  }
  //  console.log(testEvent);

  await client.handleLargeNodes("test", testEvent, ["$.data.new.BigList"]);
  console.log(testEvent);
});
