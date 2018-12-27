// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Protocol.Connection}
 */
SDK.MainConnection = class {
  constructor() {
    this._onMessage = null;
    this._onDisconnect = null;
    this._messageBuffer = '';
    this._messageSize = 0;
    this._eventListeners = [
      InspectorFrontendHost.events.addEventListener(
          InspectorFrontendHostAPI.Events.DispatchMessage, this._dispatchMessage, this),
      InspectorFrontendHost.events.addEventListener(
          InspectorFrontendHostAPI.Events.DispatchMessageChunk, this._dispatchMessageChunk, this),
    ];
  }

  /**
   * @override
   * @param {function((!Object|string))} onMessage
   */
  setOnMessage(onMessage) {
    this._onMessage = onMessage;
  }

  /**
   * @override
   * @param {function(string)} onDisconnect
   */
  setOnDisconnect(onDisconnect) {
    this._onDisconnect = onDisconnect;
  }

  /**
   * @override
   * @param {string} message
   */
  sendRawMessage(message) {
    if (this._onMessage)
      InspectorFrontendHost.sendMessageToBackend(message);
  }

  /**
   * @param {!Common.Event} event
   */
  _dispatchMessage(event) {
    if (this._onMessage)
      this._onMessage.call(null, /** @type {string} */ (event.data));
  }

  /**
   * @param {!Common.Event} event
   */
  _dispatchMessageChunk(event) {
    const messageChunk = /** @type {string} */ (event.data['messageChunk']);
    const messageSize = /** @type {number} */ (event.data['messageSize']);
    if (messageSize) {
      this._messageBuffer = '';
      this._messageSize = messageSize;
    }
    this._messageBuffer += messageChunk;
    if (this._messageBuffer.length === this._messageSize) {
      this._onMessage.call(null, this._messageBuffer);
      this._messageBuffer = '';
      this._messageSize = 0;
    }
  }

  /**
   * @override
   * @return {!Promise}
   */
  disconnect() {
    const onDisconnect = this._onDisconnect;
    Common.EventTarget.removeEventListeners(this._eventListeners);
    this._onDisconnect = null;
    this._onMessage = null;

    let fulfill;
    const promise = new Promise(f => fulfill = f);
    InspectorFrontendHost.reattach(() => {
      if (onDisconnect)
        onDisconnect.call(null, 'force disconnect');
      fulfill();
    });
    return promise;
  }
};

/**
 * @implements {Protocol.Connection}
 */
SDK.WebSocketConnection = class {
  /**
   * @param {string} url
   * @param {function()} onWebSocketDisconnect
   */
  constructor(url, onWebSocketDisconnect) {
    this._socket = new WebSocket(url);
    this._socket.onerror = this._onError.bind(this);
    this._socket.onopen = this._onOpen.bind(this);
    this._socket.onmessage = messageEvent => {
      if (this._onMessage)
        this._onMessage.call(null, /** @type {string} */ (messageEvent.data));
    };
    this._socket.onclose = this._onClose.bind(this);

    this._onMessage = null;
    this._onDisconnect = null;
    this._onWebSocketDisconnect = onWebSocketDisconnect;
    this._connected = false;
    this._messages = [];
  }

  /**
   * @override
   * @param {function((!Object|string))} onMessage
   */
  setOnMessage(onMessage) {
    this._onMessage = onMessage;
  }

  /**
   * @override
   * @param {function(string)} onDisconnect
   */
  setOnDisconnect(onDisconnect) {
    this._onDisconnect = onDisconnect;
  }

  _onError() {
    this._onWebSocketDisconnect.call(null);
    // This is called if error occurred while connecting.
    this._onDisconnect.call(null, 'connection failed');
    this._close();
  }

  _onOpen() {
    this._socket.onerror = console.error;
    this._connected = true;
    for (const message of this._messages)
      this._socket.send(message);
    this._messages = [];
  }

  _onClose() {
    this._onWebSocketDisconnect.call(null);
    this._onDisconnect.call(null, 'websocket closed');
    this._close();
  }

  /**
   * @param {function()=} callback
   */
  _close(callback) {
    this._socket.onerror = null;
    this._socket.onopen = null;
    this._socket.onclose = callback || null;
    this._socket.onmessage = null;
    this._socket.close();
    this._socket = null;
    this._onWebSocketDisconnect = null;
  }

  /**
   * @override
   * @param {string} message
   */
  sendRawMessage(message) {
    if (this._connected)
      this._socket.send(message);
    else
      this._messages.push(message);
  }

  /**
   * @override
   * @return {!Promise}
   */
  disconnect() {
    let fulfill;
    const promise = new Promise(f => fulfill = f);
    this._close(() => {
      if (this._onDisconnect)
        this._onDisconnect.call(null, 'force disconnect');
      fulfill();
    });
    return promise;
  }
};

/**
 * @implements {Protocol.Connection}
 */
SDK.StubConnection = class {
  constructor() {
    this._onMessage = null;
    this._onDisconnect = null;
  }

  /**
   * @override
   * @param {function((!Object|string))} onMessage
   */
  setOnMessage(onMessage) {
    this._onMessage = onMessage;
  }

  /**
   * @override
   * @param {function(string)} onDisconnect
   */
  setOnDisconnect(onDisconnect) {
    this._onDisconnect = onDisconnect;
  }

  /**
   * @override
   * @param {string} message
   */
  sendRawMessage(message) {
    setTimeout(this._respondWithError.bind(this, message), 0);
  }

  /**
   * @param {string} message
   */
  _respondWithError(message) {
    const messageObject = JSON.parse(message);
    const error = {
      message: 'This is a stub connection, can\'t dispatch message.',
      code: Protocol.DevToolsStubErrorCode,
      data: messageObject
    };
    if (this._onMessage)
      this._onMessage.call(null, {id: messageObject.id, error: error});
  }

  /**
   * @override
   * @return {!Promise}
   */
  disconnect() {
    if (this._onDisconnect)
      this._onDisconnect.call(null, 'force disconnect');
    this._onDisconnect = null;
    this._onMessage = null;
    return Promise.resolve();
  }
};

/**
 * @param {function()} createMainTarget
 * @param {function()} websocketConnectionLost
 * @return {!Promise}
 */
SDK.initMainConnection = async function(createMainTarget, websocketConnectionLost) {
  SDK._websocketConnectionLost = websocketConnectionLost;
  SDK._createMainTarget = createMainTarget;
  Protocol.Connection.setFactory(SDK._createMainConnection);
  await SDK._createMainTarget();
  InspectorFrontendHost.connectionReady();
  return Promise.resolve();
};

/**
 * @return {!Protocol.Connection}
 */
SDK._createMainConnection = function() {
  const wsParam = Runtime.queryParam('ws');
  const wssParam = Runtime.queryParam('wss');
  if (wsParam || wssParam) {
    const ws = wsParam ? `ws://${wsParam}` : `wss://${wssParam}`;
    SDK._mainConnection = new SDK.WebSocketConnection(ws, SDK._websocketConnectionLost);
  } else if (InspectorFrontendHost.isHostedMode()) {
    SDK._mainConnection = new SDK.StubConnection();
  } else {
    SDK._mainConnection = new SDK.MainConnection();
  }
  return SDK._mainConnection;
};

/** @type {!Protocol.Connection} */
SDK._mainConnection;

/** @type {function()} */
SDK._createMainTarget;

/** @type {function()} */
SDK._websocketConnectionLost;

/**
 * @param {function((!Object|string))} onMessage
 * @return {!Promise<!Protocol.Connection>}
 */
SDK.interceptMainConnection = async function(onMessage) {
  await SDK._mainConnection.disconnect();
  const connection = SDK._createMainConnection();
  connection.setOnMessage(onMessage);
  connection.setOnDisconnect(SDK._createMainTarget);
  return connection;
};
