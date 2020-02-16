## @mhlabs/events-client

A thin client for Amazon EventBridge that has as purpose to enforce a message pattern convention following this contract:

```
{
    "source": "my-source",
    "detail-type": "my-detail-type"
    ...,
    "detail": {
        "metadata": {
            ...
        },
        "data": {
            ...
        }
    }
}
```

If an event originates from a DynamoDB event, the new and old image will be added under data along with a JSON diff under `metadata`:

```
{
    "source": "my-source",
    "detail-type": "my-detail-type"
    ...,
    "detail": {
        "metadata": {
            "diff": {
                "Price": [3, 5]
            },
            "action": "update"
        },
        "data": {
            {
                "old": {
                    "Id": "123",
                    "Price": 3
                },
                "new": {
                    "Id": "123",
                    "Price": 5
                }
            }
        }
    }
}
```

The JSON diff will only be added if both `old` and `new` are assigend.

If `old` is `null` and `new` is assigned, then `metadata.action` will be set to `create`.

If `new` is `null` and `old` is assigned, then `metadata.action` will be set to `delete`.

## Usage

`npm install --save @mhlabs/events-client`

```
const events = require("@mhlabs/events-client");
const client = new events.Client(eventBridgeClient, eventBusName, source);
```

_All constructor arguments are optional and defaults to_:

- eventBridgeClient: new AWS.EventBridgeClient()
- eventBusName: "default"
- source: `process.env.StackName

This is intended to run in AWS Lambda and will by default use the CloudFormation stack's name, as source.

To send a single event:

```
const eventDetail = { id: 123, value: 10 }
await client.send("my-detail-type", eventDetail);
```

To send multiple events. Max 10 per batch:
```
const eventDetail = [{ id: 123, value: 10 }, { id: 234, value: 15 }]
await client.send("my-detail-type", eventDetail);
```

To send DynamoDB events from a lambda trigger:
```
async function handler(dynamoDbEvent, context) {
    await client.send("my-detail-type", dynamoDbEvent);
}
```

