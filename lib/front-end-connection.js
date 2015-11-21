'use strict';

const http = require('http');
const WebSocketServer = require('websocket').server;
const EventEmitter = require('events');

/**
 * Responsible for creating and maintaining socket connection with the frontend.
 */
class FrontEndConnection extends EventEmitter {
    constructor(port) {
        super();

        this._wsConnection = null;

        this._httpServer = http.createServer(handleHTTPRequest);
        this._httpServer.on('error', (error) => {
            this.emit('error', error);
        });
        this._httpServer.listen(port, () => {
            this.emit('log', `Server is listening on port ${port}.`);
        });

        this._wsServer = new WebSocketServer({
            httpServer: this._httpServer,
            autoAcceptConnections: false
        });

        this._wsServer.on('request', handleWebSocketRequest.bind(this));
    }

    isConnected() {
        return this._wsConnection !== null;
    }

    respond(id, result) {
        if (!this.isConnected()) {
            throw new Error('No connection.');
        }

        sendWebSocketMessage.call(this, {
            id,
            result
        });
    }

    send(method, params) {
        if (!this.isConnected()) {
            this.emit('error', 'Connection not ready, message not sent.');
            return;
        }

        sendWebSocketMessage.call(this, {
            method,
            params
        });
    }
}

function originIsAllowed(origin) {
    return origin === 'file://';
}

function handleWebSocketClose(reasonCode, description) {
    this.emit('log', `Peer ${this._wsConnection.remoteAddress} disconnected.`);

    this._wsConnection = null;
}

function handleWebSocketError(error) {
    this.emit('error', `Socket error: ${error}.`);

    this._wsConnection.destroy();
    this._wsConnection = null;
}

function sendWebSocketMessage(message) {
    let msgString = JSON.stringify(message);

    this.emit('log', `Sending Message: ${msgString}.`);
    this._wsConnection.sendUTF(msgString);
}

function handleWebSocketMessage(message) {
    if (message.type === 'utf8') {
        this.emit('log', `Received Message: ${message.utf8Data}.`);

        let msgObj;

        try {
            msgObj = JSON.parse(message.utf8Data);
        } catch (e) {
            this.emit('error', 'Message parsing error.');
            return;
        }

        this.emit('message', msgObj);
    } else if (message.type === 'binary') {
        this.emit('error', 'Binary message received.');
    }
}

function handleWebSocketRequest(request) {
    this.emit('log', `Connection from origin ${request.origin}.`);

    if (!originIsAllowed(request.origin)) {
        this.emit('error', `Connection from origin ${request.origin} rejected.`);

        request.reject();
        return;
    }

    if (this.isConnected()) {
        this.emit('error', 'Connection is already active.');

        request.reject();
        return;
    }

    this._wsConnection = request.accept(null, request.origin);
    this._wsConnection.on('message', handleWebSocketMessage.bind(this));
    this._wsConnection.on('close', handleWebSocketClose.bind(this));
    this._wsConnection.on('error', handleWebSocketError.bind(this));
}

function handleHTTPRequest(request, response) {
    response.writeHead(404);
    response.end();
}

module.exports = FrontEndConnection;
