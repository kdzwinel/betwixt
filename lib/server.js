'use strict';

const chalk = require('chalk');
const FrontEndConnection = require('./front-end-connection');
const TrafficInterceptor = require('./traffic-interceptor');
const RDPMessageFormatter = require('./rdp-message-formatter');

let frontEndConnection = new FrontEndConnection(1337);
let trafficInterceptor = new TrafficInterceptor(8008);

// this part is responsible for answering devtools requests
frontEndConnection
    .on('message', (message) => {
        if (message.method === 'Network.getResponseBody') {
            let connectionId = parseInt(message.params.requestId, 10);
            let connection = trafficInterceptor.getConnection(connectionId);

            frontEndConnection.respond(message.id, RDPMessageFormatter.getResponseBody(connection));
        } else if (message.method === 'Page.canScreencast' ||
            message.method === 'Network.canEmulateNetworkConditions' ||
            message.method === 'Emulation.canEmulate') {
            // we want to tell devtools that we don't support emulation, screencasting, etc.
            frontEndConnection.respond(message.id, {result: false});
        } else if (message.method === 'Page.getResourceTree') {
            frontEndConnection.respond(message.id, {
                frameTree: {
                    frame: {
                        id: 1,
                        url: 'http://betwixt',
                        mimeType: 'other'
                    },
                    childFrames: [],
                    resources: []
                }
            });
        } else {
            // for requests that we are not sure about, let's just send an empty object back
            frontEndConnection.respond(message.id, {});
        }
    })
    .on('error', (error) => {
        console.log(chalk.bold.red('FEConnection error: ') + error);
    })
    .on('log', (msg) => {
        console.log(chalk.blue('FEConnection: ') + msg);
    });

// this part is responsible for capturing traffic
trafficInterceptor
    .on('request', (connection) => {
        frontEndConnection.send('Network.requestWillBeSent', RDPMessageFormatter.requestWillBeSent(connection));
    })
    .on('response-received', (connection) => {
        frontEndConnection.send('Network.responseReceived', RDPMessageFormatter.responseReceived(connection));
    })
    .on('response-data', (connection, chunk) => {
        frontEndConnection.send('Network.dataReceived', RDPMessageFormatter.dataReceived(connection, chunk));
    })
    .on('response-finished', (connection) => {
        frontEndConnection.send('Network.loadingFinished', RDPMessageFormatter.loadingFinished(connection));
    })
    .on('error', (error) => {
        console.log(chalk.bold.red('TrafficInterceptor error: ') + error);
    })
    .on('log', (msg) => {
        console.log(chalk.yellow('TrafficInterceptor: ') + msg);
    });

module.exports = {};
