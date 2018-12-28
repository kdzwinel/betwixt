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

    // TODO we never remove requests from here - see #8
    this._connections = new Map();

    const proxy = MITMProxy();

    proxy.onRequest(handleIncomingRequest.bind(this));
    proxy.onResponse(handleIncomingResponse.bind(this));
    proxy.onError(handleProxyError.bind(this));

    proxy.listen({
      port: options.port,
      sslCaDir: options.sslCaDir,
    });
  }

  getConnection(id) {
    return this._connections.get(id);
  }
}

function handleIncomingRequest(context, callback) {
  const connection = new CapturedConnection();

  this._connections.set(connection.getId(), connection);
  // eslint-disable-next-line no-param-reassign
  context.log = {
    id: connection.getId(),
  };

  const trafficInterceptor = this;
  const chunks = [];

  context.onRequestData((ctx, chunk, cb) => {
    chunks.push(chunk);

    return cb(null, chunk);
  });

  context.onRequestEnd((ctx, cb) => {
    connection.setRequest(ctx.clientToProxyRequest, ctx.isSSL, (Buffer.concat(chunks)).toString());
    trafficInterceptor.emit('request', connection);

    return cb();
  });

  return callback();
}

function handleIncomingResponse(context, callback) {
  const request = context.clientToProxyRequest;
  const response = context.serverToProxyResponse;

  this.emit('log', `Response arrived: ${request.method} ${request.url} ${response.statusCode}`);

  const connectionId = context.log && context.log.id;
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

  const trafficInterceptor = this;

  context.onResponseData((ctx, chunk, cb) => {
    connection.registerDataReceived(chunk);

    trafficInterceptor.emit('response-data', connection, {
      time: getTime(),
      encodedLength: chunk.length,
    });

    return cb(null, chunk);
  });
  context.onResponseEnd((ctx, cb) => {
    connection.registerResponseFinished();

    // after whole body was received and unpacked we can push its size to the front-end
    trafficInterceptor.emit('response-data', connection, {
      time: connection.getTiming().responseFinished,
      length: connection.getSize(),
      encodedLength: 0,
    });

    trafficInterceptor.emit('response-finished', connection);

    return cb();
  });

  callback();
}

function handleProxyError(ctx, error) {
  this.emit('error', `Proxy error: ${error}`);
}

module.exports = TrafficInterceptor;
