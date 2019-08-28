# Order SMS Notification

### how to install in an account

 - first install vtex.sms-provider in version 0.x (any version higher than 0.5.0 since we fixed a bug in 0.5.1)

 - then configure a trigger in MasterData v2 in the `order` data entity. (tldr; make a schema with name `order-sms-notification` in `order` entity SUBSTITUTING {{accountName}} in action uri with the proper account name) ex.:
 ```
{
    "properties": {
        "orderId": {
            "type": "string",
            "title": "Order Id"
        },
        "status": {
            "type": "string",
            "title": "Status"
        }
    },
    "required": [
        "orderId",
        "status"
    ],
    "v-indexed": [
        "orderId",
        "status"
    ],
    "v-default-fields": [
        "id",
        "orderId",
        "status",
        "_self"
    ],
    "v-triggers": [
        {
            "name": "send-sms",
            "condition": "status=ready-for-handling",
            "active": true,
            "action": {
                "type": "http",
                "uri": "https://{{accountName}}.myvtex.com/_v/order-sms-notification",
                "method": "POST",
                "headers": {
                    "content-type": "application/json"
                },
                "body": {
                    "orderId": "{!orderId}",
                    "accountName": "{!accountName}"
                }
            }
        }
    ]
}
 ```
