'use strict';

const http = require('http');
const httpProxy = require('http-proxy');
const url = require('url');
const EventEmitter = require('events');
const Agent = require('agentkeepalive');
const CapturedConnection = require('./captured-connection');
const getTime = require('./init-time');

/**
 * Responsible for creating and maintaining proxy server and exposing information about passing traffic.
 */
class TrafficInterceptor extends EventEmitter {
    constructor(port) {
        super();

        //TODO we never remove requests from here - see #8
        this._connections = new Map();

        let agent = new Agent({
            keepAlive: true
        });

        this._proxy = httpProxy.createProxyServer({agent})
            .on('proxyReq', handleIncomingRequest.bind(this))
            .on('proxyRes', handleIncomingResponse.bind(this))
            .on('error', handleProxyError.bind(this));

        this._server = http.createServer(handleHTTPRequest.bind(this))
            .on('error', (error) => {
                this.emit('error', error);
            })
            .listen(port);
    }

    getConnection(id) {
        return this._connections.get(id);
    }
}

function handleHTTPRequest(req, res) {
    this.emit('log', 'Request recorded: ' + req.method + ' ' + req.url);

    let target = url.parse(req.url);

    this._proxy.web(req, res, {
        target: target.protocol + '//' + target.host
    });
}

function handleIncomingRequest(proxyReq, req, res, options) {
    let connection = new CapturedConnection();
    connection.setRequest(proxyReq, req);

    this._connections.set(connection.getId(), connection);
    req.log = {
        id: connection.getId()
    };

    this.emit('request', connection);
}

function handleIncomingResponse(proxyRes, req, res) {
    this.emit('log', 'Response arrived: ' + req.method + ' ' + req.url + ' ' + res.statusCode);

    let connectionId = req.log && req.log.id;
    let connection = null;

    if (connectionId) {
        connection = this.getConnection(connectionId);
    }

    if (!connection) {
        this.emit('error', 'Connection not found.');
        return;
    }

    connection.setResponse(proxyRes, res);
    connection.registerResponseReceived();
    this.emit('response-received', connection);

    let _end = res.end;
    let _write = res.write;
    let trafficInterceptor = this;

    res.write = function(chunk) {
        _write.apply(res, arguments);
        connection.registerDataReceived(chunk);

        trafficInterceptor.emit('response-data', connection, {
            time: getTime,
            encodedLength: chunk.length
        });
    };

    res.end = function() {
        _end.apply(res, arguments);

        connection.registerResponseFinished();

        //after whole body was received and unpacked we can push its size to the front-end
        trafficInterceptor.emit('response-data', connection, {
            time: connection.getTiming().responseFinished,
            length: connection.getSize(),
            encodedLength: 0
        });

        trafficInterceptor.emit('response-finished', connection);
    };
}

function handleProxyError(error) {
    this.emit('error', 'Proxy error:', error);
}

module.exports = TrafficInterceptor;
