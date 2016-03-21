'use strict';

const MITMProxy = require('http-mitm-proxy');
const EventEmitter = require('events');
const CapturedConnection = require('./captured-connection');
const getTime = require('./init-time');

/**
 * Responsible for creating and maintaining proxy server and exposing information about passing traffic.
 */
class TrafficInterceptor extends EventEmitter {
    constructor(options) {
        super();

        //TODO we never remove requests from here - see #8
        this._connections = new Map();

        let proxy = new MITMProxy();

        proxy.onRequest(handleIncomingRequest.bind(this));
        proxy.onResponse(handleIncomingResponse.bind(this));
        proxy.onError(handleProxyError.bind(this));

        proxy.listen({
            port: options.port,
            sslCaDir: options.sslCaDir
        });
    }

    getConnection(id) {
        return this._connections.get(id);
    }
}

function handleIncomingRequest(ctx, callback) {
    let connection = new CapturedConnection();

    this._connections.set(connection.getId(), connection);
    ctx.log = {
        id: connection.getId()
    };

    let trafficInterceptor = this;
    let chunks = [];

    ctx.onRequestData(function(ctx, chunk, callback) {
        chunks.push(chunk);

        return callback(null, chunk);
    });

    ctx.onRequestEnd(function(ctx, callback) {
        connection.setRequest(ctx.clientToProxyRequest, ctx.isSSL, (Buffer.concat(chunks)).toString());
        trafficInterceptor.emit('request', connection);

        return callback();
    });

    return callback();
}

function handleIncomingResponse(ctx, callback) {
    let request = ctx.clientToProxyRequest;
    let response = ctx.serverToProxyResponse;

    this.emit('log', 'Response arrived: ' + request.method + ' ' + request.url + ' ' + response.statusCode);

    let connectionId = ctx.log && ctx.log.id;
    let connection = null;

    if (connectionId) {
        connection = this.getConnection(connectionId);
    }

    if (!connection) {
        this.emit('error', 'Connection not found.');
        return;
    }

    connection.setResponse(response);
    connection.registerResponseReceived();
    this.emit('response-received', connection);

    let trafficInterceptor = this;

    ctx.onResponseData(function(ctx, chunk, callback) {
        connection.registerDataReceived(chunk);

        trafficInterceptor.emit('response-data', connection, {
            time: getTime(),
            encodedLength: chunk.length
        });

        return callback(null, chunk);
    });
    ctx.onResponseEnd(function(ctx, callback) {
        connection.registerResponseFinished();

        //after whole body was received and unpacked we can push its size to the front-end
        trafficInterceptor.emit('response-data', connection, {
            time: connection.getTiming().responseFinished,
            length: connection.getSize(),
            encodedLength: 0
        });

        trafficInterceptor.emit('response-finished', connection);

        return callback();
    });

    return callback();
}

function handleProxyError(ctx, error) {
    this.emit('error', 'Proxy error: ' + error);
}

module.exports = TrafficInterceptor;
