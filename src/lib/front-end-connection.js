'use strict';

const ipc = require('electron').ipcMain;
const EventEmitter = require('events');

/**
 * Responsible for creating and maintaining ipc connection with the frontend.
 */
class FrontEndConnection extends EventEmitter {

    constructor(receiver) {
        super();

        this._receiver = receiver;

        ipc.on('frontend-message', handleFrontEndMessage.bind(this));
    }

    respond(id, result) {
        sendMessage.call(this, {
            id,
            result
        });
    }

    send(method, params) {
        sendMessage.call(this, {
            method,
            params
        });
    }
}

function sendMessage(data) {
    this._receiver.send('backend-message', {
        data
    });
    this.emit('log', 'Sent Message: ' + JSON.stringify(data));
}

function handleFrontEndMessage(event, message) {
    this.emit('message', message);
    this.emit('log', 'Received Message: ' + JSON.stringify(message));
}

module.exports = FrontEndConnection;
