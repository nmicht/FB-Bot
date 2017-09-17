/* jshint node: true, devel: true */
'use strict';

const
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),
  request = require('request');

var app = express();
app.set('port', 5000);
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.json({ verify: verifyRequestSignature }));

/*
 * Open config/default.json and set your config values before running this server
 * You can restart the node server without reconfiguring anything
 * However, whenever you restart ngrok you must (in this order):
 *   1. reset the serverURL param in config\default.json
 *   2. restart this node server
 *   3. revalidate the webhook url in your App Dashboard
 */

// App Dashboard > Dashboard > click the Show button in the App Secret field
const APP_SECRET = config.get('appSecret');

// App Dashboard > Webhooks > Edit Subscription > copy whatever random value you decide to use in the Verify Token field
const VALIDATION_TOKEN = config.get('validationToken');

// App Dashboard > Messenger > Settings > Token Generation > select your page > copy the token that appears
const PAGE_ACCESS_TOKEN = config.get('pageAccessToken');

// Get this from your ngrok console but leave out the 'https://'
// DO NOT INCLUDE THE PROTOCOL, it should just be [subdomain].ngrok.io
const SERVER_URL = config.get('serverURL');

// Avoid accidental misconfiguration by hard coding the protocol
const IMG_BASE_PATH = 'https://' + SERVER_URL + "/assets/screenshots/";

// make sure that everything has been properly configured
if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
  console.error("Missing config values");
  process.exit(1);
}

app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VALIDATION_TOKEN) {
        console.log("[app.get] Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Validation token mismatch.");
    res.sendStatus(403);
  }
});

app.post('/webhook', function (req, res) {
  console.log("message received!");
  var data = req.body;
  if (data.object == 'page') {
    // entries from multiple pages may be batched in one request
    data.entry.forEach(function(pageEntry) {
      let message = pageEntry.messaging[0].message;
      console.log(message.text);

      // iterate over each messaging event for this page
      pageEntry.messaging.forEach(function(messagingEvent) {

        if (messagingEvent.message) {
          processMessageFromPage(messagingEvent);
        } else {
          console.log("[app.post] not prepared to handle this message type.");
        }
      });
    });
    res.sendStatus(200);
  }
});

/*
* called when a message is sent to your page
*
*/
function processMessageFromPage(event) {
  let senderID = event.sender.id;
  let pageID = event.recipient.id;
  let timeOfMessage = event.timestamp;
  let message = event.message;
  console.log("[processMessageFromPage] user (%d) page (%d) timestamp (%d) and message (%s)",
              senderID, pageID, timeOfMessage, JSON.stringify(message));
  // the 'message' object format varies depending on the message type
  let messageText = message.text;
  if (messageText) {
    console.log("[processMessageFromPage]: %s", messageText);
    sendTextMessage(senderID, messageText);
  }
}

/*
 * Verify that the request came from Facebook. You should expect a hash of
 * the App Secret from your App Dashboard to be present in the x-hub-signature
 * header field.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // In DEV, log an error. In PROD, throw an error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', APP_SECRET)
                        .update(buf)
                        .digest('hex');

    console.log("received  %s", signatureHash);
    console.log("exepected %s", expectedHash);

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

/*
* Send a text message using the Send API.
* @recipientId integer senderID
*/
function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText // utf-8, 640-character max
    }
  };
  console.log("[sendTextMessage] %s", JSON.stringify(messageData));
  callSendAPI(messageData);
}

/*
* Call the Send API. If the call succeeds, the
* message id is returned in the response.
*
*/
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData
    }, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log("[callSendAPI] success!");
      } else {
        console.error("[callSendAPI] Send API call failed");
      }
  });
}

/*
 * Start your server
 */
app.listen(app.get('port'), function() {
  console.log('[app.listen] Node app is running on port', app.get('port'));
});

module.exports = app;
