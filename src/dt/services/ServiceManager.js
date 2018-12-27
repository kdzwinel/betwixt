// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Services.ServiceManager = class {
  /**
   * @param {string} serviceName
   * @return {!Promise<?Services.ServiceManager.Service>}
   */
  createRemoteService(serviceName) {
    if (!this._remoteConnection) {
      const url = Runtime.queryParam('service-backend');
      if (!url) {
        console.error('No endpoint address specified');
        return /** @type {!Promise<?Services.ServiceManager.Service>} */ (Promise.resolve(null));
      }
      this._remoteConnection =
          new Services.ServiceManager.Connection(new Services.ServiceManager.RemoteServicePort(url));
    }
    return this._remoteConnection._createService(serviceName);
  }

  /**
   * @param {string} appName
   * @param {string} serviceName
   * @return {!Promise<?Services.ServiceManager.Service>}
   */
  createAppService(appName, serviceName) {
    let url = appName + '.js';
    const remoteBase = Runtime.queryParam('remoteBase');
    const debugFrontend = Runtime.queryParam('debugFrontend');
    const isUnderTest = Host.isUnderTest();

    const queryParams = [];
    if (remoteBase)
      queryParams.push('remoteBase=' + remoteBase);
    if (debugFrontend)
      queryParams.push('debugFrontend=' + debugFrontend);
    if (isUnderTest)
      queryParams.push('isUnderTest=true');

    if (queryParams.length)
      url += `?${queryParams.join('&')}`;

    const worker = new Worker(url);
    const connection = new Services.ServiceManager.Connection(new Services.ServiceManager.WorkerServicePort(worker));
    return connection._createService(serviceName);
  }
};

/**
 * @unrestricted
 */
Services.ServiceManager.Connection = class {
  /**
   * @param {!ServicePort} port
   */
  constructor(port) {
    this._port = port;
    this._port.setHandlers(this._onMessage.bind(this), this._connectionClosed.bind(this));

    this._lastId = 1;
    /** @type {!Map<number, function(?Object)>}*/
    this._callbacks = new Map();
    /** @type {!Map<string, !Services.ServiceManager.Service>}*/
    this._services = new Map();
  }

  /**
   * @param {string} serviceName
   * @return {!Promise<?Services.ServiceManager.Service>}
   */
  _createService(serviceName) {
    return this._sendCommand(serviceName + '.create').then(result => {
      if (!result) {
        console.error('Could not initialize service: ' + serviceName);
        return null;
      }
      const service = new Services.ServiceManager.Service(this, serviceName, result.id);
      this._services.set(serviceName + ':' + result.id, service);
      return service;
    });
  }

  /**
   * @param {!Services.ServiceManager.Service} service
   */
  _serviceDisposed(service) {
    this._services.delete(service._serviceName + ':' + service._objectId);
    if (!this._services.size) {
      // Terminate the connection since it is no longer used.
      this._port.close();
    }
  }

  /**
   * @param {string} method
   * @param {!Object=} params
   * @return {!Promise<?Object>}
   */
  _sendCommand(method, params) {
    const id = this._lastId++;
    const message = JSON.stringify({id: id, method: method, params: params || {}});
    return this._port.send(message).then(success => {
      if (!success)
        return Promise.resolve(null);
      return new Promise(fulfill => this._callbacks.set(id, fulfill));
    });
  }

  /**
   * @param {string} data
   */
  _onMessage(data) {
    let object;
    try {
      object = JSON.parse(data);
    } catch (e) {
      console.error(e);
      return;
    }
    if (object.id) {
      if (object.error)
        console.error('Service error: ' + object.error);
      this._callbacks.get(object.id)(object.error ? null : object.result);
      this._callbacks.delete(object.id);
      return;
    }

    const tokens = object.method.split('.');
    const serviceName = tokens[0];
    const methodName = tokens[1];
    const service = this._services.get(serviceName + ':' + object.params.id);
    if (!service) {
      console.error('Unable to lookup stub for ' + serviceName + ':' + object.params.id);
      return;
    }
    service._dispatchNotification(methodName, object.params);
  }

  _connectionClosed() {
    for (const callback of this._callbacks.values())
      callback(null);
    this._callbacks.clear();
    for (const service of this._services.values())
      service._dispatchNotification('disposed');
    this._services.clear();
  }
};

/**
 * @unrestricted
 */
Services.ServiceManager.Service = class {
  /**
   * @param {!Services.ServiceManager.Connection} connection
   * @param {string} serviceName
   * @param {string} objectId
   */
  constructor(connection, serviceName, objectId) {
    this._connection = connection;
    this._serviceName = serviceName;
    this._objectId = objectId;
    /** @type {!Map<string, function(!Object=)>}*/
    this._notificationHandlers = new Map();
  }

  /**
   * @return {!Promise}
   */
  dispose() {
    const params = {id: this._objectId};
    return this._connection._sendCommand(this._serviceName + '.dispose', params).then(() => {
      this._connection._serviceDisposed(this);
    });
  }

  /**
   * @param {string} methodName
   * @param {function(!Object=)} handler
   */
  on(methodName, handler) {
    this._notificationHandlers.set(methodName, handler);
  }

  /**
   * @param {string} methodName
   * @param {!Object=} params
   * @return {!Promise}
   */
  send(methodName, params) {
    params = params || {};
    params.id = this._objectId;
    return this._connection._sendCommand(this._serviceName + '.' + methodName, params);
  }

  /**
   * @param {string} methodName
   * @param {!Object=} params
   */
  _dispatchNotification(methodName, params) {
    const handler = this._notificationHandlers.get(methodName);
    if (!handler) {
      console.error('Could not report notification \'' + methodName + '\' on \'' + this._objectId + '\'');
      return;
    }
    handler(params);
  }
};

/**
 * @implements {ServicePort}
 * @unrestricted
 */
Services.ServiceManager.RemoteServicePort = class {
  /**
   * @param {string} url
   */
  constructor(url) {
    this._url = url;
  }

  /**
   * @override
   * @param {function(string)} messageHandler
   * @param {function(string)} closeHandler
   */
  setHandlers(messageHandler, closeHandler) {
    this._messageHandler = messageHandler;
    this._closeHandler = closeHandler;
  }

  /**
   * @return {!Promise<boolean>}
   */
  _open() {
    if (!this._connectionPromise)
      this._connectionPromise = new Promise(promiseBody.bind(this));
    return this._connectionPromise;

    /**
     * @param {function(boolean)} fulfill
     * @this {Services.ServiceManager.RemoteServicePort}
     */
    function promiseBody(fulfill) {
      let socket;
      try {
        socket = new WebSocket(/** @type {string} */ (this._url));
        socket.onmessage = onMessage.bind(this);
        socket.onclose = onClose.bind(this);
        socket.onopen = onConnect.bind(this);
      } catch (e) {
        fulfill(false);
      }

      /**
       * @this {Services.ServiceManager.RemoteServicePort}
       */
      function onConnect() {
        this._socket = socket;
        fulfill(true);
      }

      /**
       * @param {!Event} event
       * @this {Services.ServiceManager.RemoteServicePort}
       */
      function onMessage(event) {
        this._messageHandler(event.data);
      }

      /**
       * @this {Services.ServiceManager.RemoteServicePort}
       */
      function onClose() {
        if (!this._socket)
          fulfill(false);
        this._socketClosed(!!this._socket);
      }
    }
  }

  /**
   * @override
   * @param {string} message
   * @return {!Promise<boolean>}
   */
  send(message) {
    return this._open().then(() => {
      if (this._socket) {
        this._socket.send(message);
        return true;
      }
      return false;
    });
  }

  /**
   * @override
   * @return {!Promise}
   */
  close() {
    return this._open().then(() => {
      if (this._socket) {
        this._socket.close();
        this._socketClosed(true);
      }
      return true;
    });
  }

  /**
   * @param {boolean=} notifyClient
   */
  _socketClosed(notifyClient) {
    this._socket = null;
    delete this._connectionPromise;
    if (notifyClient)
      this._closeHandler();
  }
};

/**
 * @implements {ServicePort}
 * @unrestricted
 */
Services.ServiceManager.WorkerServicePort = class {
  /**
   * @param {!Worker} worker
   */
  constructor(worker) {
    this._worker = worker;

    let fulfill;
    this._workerPromise = new Promise(resolve => fulfill = resolve);

    this._worker.onmessage = onMessage.bind(this);
    this._worker.onclose = this._closeHandler;

    /**
     * @param {!Event} event
     * @this {Services.ServiceManager.WorkerServicePort}
     */
    function onMessage(event) {
      if (event.data === 'workerReady') {
        fulfill(true);
        return;
      }
      this._messageHandler(event.data);
    }
  }

  /**
   * @override
   * @param {function(string)} messageHandler
   * @param {function(string)} closeHandler
   */
  setHandlers(messageHandler, closeHandler) {
    this._messageHandler = messageHandler;
    this._closeHandler = closeHandler;
  }

  /**
   * @override
   * @param {string} message
   * @return {!Promise<boolean>}
   */
  send(message) {
    return this._workerPromise.then(() => {
      try {
        this._worker.postMessage(message);
        return true;
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * @override
   * @return {!Promise}
   */
  close() {
    return this._workerPromise.then(() => {
      if (this._worker)
        this._worker.terminate();
      return false;
    });
  }
};

Services.serviceManager = new Services.ServiceManager();
