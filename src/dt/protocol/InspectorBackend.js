/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/** @typedef {string} */
Protocol.Error = Symbol('Protocol.Error');

/**
 * @unrestricted
 */
Protocol.InspectorBackend = class {
  constructor() {
    /** @type {!Map<string, !Protocol.InspectorBackend._AgentPrototype>} */
    this._agentPrototypes = new Map();
    /** @type {!Map<string, !Protocol.InspectorBackend._DispatcherPrototype>} */
    this._dispatcherPrototypes = new Map();
    this._initialized = false;
  }

  /**
   * @param {string} error
   * @param {!Object} messageObject
   */
  static reportProtocolError(error, messageObject) {
    console.error(error + ': ' + JSON.stringify(messageObject));
  }

  /**
   * @return {boolean}
   */
  isInitialized() {
    return this._initialized;
  }

  /**
   * @param {string} domain
   */
  _addAgentGetterMethodToProtocolTargetPrototype(domain) {
    let upperCaseLength = 0;
    while (upperCaseLength < domain.length && domain[upperCaseLength].toLowerCase() !== domain[upperCaseLength])
      ++upperCaseLength;

    const methodName = domain.substr(0, upperCaseLength).toLowerCase() + domain.slice(upperCaseLength) + 'Agent';

    /**
     * @this {Protocol.TargetBase}
     */
    function agentGetter() {
      return this._agents[domain];
    }

    Protocol.TargetBase.prototype[methodName] = agentGetter;

    /**
     * @this {Protocol.TargetBase}
     */
    function registerDispatcher(dispatcher) {
      this.registerDispatcher(domain, dispatcher);
    }

    Protocol.TargetBase.prototype['register' + domain + 'Dispatcher'] = registerDispatcher;
  }

  /**
   * @param {string} domain
   * @return {!Protocol.InspectorBackend._AgentPrototype}
   */
  _agentPrototype(domain) {
    if (!this._agentPrototypes.has(domain)) {
      this._agentPrototypes.set(domain, new Protocol.InspectorBackend._AgentPrototype(domain));
      this._addAgentGetterMethodToProtocolTargetPrototype(domain);
    }

    return this._agentPrototypes.get(domain);
  }

  /**
   * @param {string} domain
   * @return {!Protocol.InspectorBackend._DispatcherPrototype}
   */
  _dispatcherPrototype(domain) {
    if (!this._dispatcherPrototypes.has(domain))
      this._dispatcherPrototypes.set(domain, new Protocol.InspectorBackend._DispatcherPrototype());
    return this._dispatcherPrototypes.get(domain);
  }

  /**
   * @param {string} method
   * @param {!Array.<!Object>} signature
   * @param {!Array.<string>} replyArgs
   * @param {boolean} hasErrorData
   */
  registerCommand(method, signature, replyArgs, hasErrorData) {
    const domainAndMethod = method.split('.');
    this._agentPrototype(domainAndMethod[0]).registerCommand(domainAndMethod[1], signature, replyArgs, hasErrorData);
    this._initialized = true;
  }

  /**
   * @param {string} type
   * @param {!Object} values
   */
  registerEnum(type, values) {
    const domainAndName = type.split('.');
    const domain = domainAndName[0];
    if (!Protocol[domain])
      Protocol[domain] = {};

    Protocol[domain][domainAndName[1]] = values;
    this._initialized = true;
  }

  /**
   * @param {string} eventName
   * @param {!Object} params
   */
  registerEvent(eventName, params) {
    const domain = eventName.split('.')[0];
    this._dispatcherPrototype(domain).registerEvent(eventName, params);
    this._initialized = true;
  }

  /**
   * @param {function(T)} clientCallback
   * @param {string} errorPrefix
   * @param {function(new:T,S)=} constructor
   * @param {T=} defaultValue
   * @return {function(?string, S)}
   * @template T,S
   */
  wrapClientCallback(clientCallback, errorPrefix, constructor, defaultValue) {
    /**
     * @param {?string} error
     * @param {S} value
     * @template S
     */
    function callbackWrapper(error, value) {
      if (error) {
        console.error(errorPrefix + error);
        clientCallback(defaultValue);
        return;
      }
      if (constructor)
        clientCallback(new constructor(value));
      else
        clientCallback(value);
    }
    return callbackWrapper;
  }
};

Protocol.DevToolsStubErrorCode = -32015;

Protocol.inspectorBackend = new Protocol.InspectorBackend();

/**
 * @interface
 */
Protocol.Connection = function() {};

Protocol.Connection.prototype = {
  /**
   * @param {function((!Object|string))} onMessage
   */
  setOnMessage(onMessage) {},

  /**
   * @param {function(string)} onDisconnect
   */
  setOnDisconnect(onDisconnect) {},

  /**
   * @param {string} message
   */
  sendRawMessage(message) {},

  /**
   * @return {!Promise}
   */
  disconnect() {},
};

Protocol.test = {
  /**
   * This will get called for every protocol message.
   * Protocol.test.dumpProtocol = console.log
   * @type {?function(string)}
   */
  dumpProtocol: null,

  /**
   * Runs a function when no protocol activity is present.
   * Protocol.test.deprecatedRunAfterPendingDispatches(() => console.log('done'))
   * @type {?function(function()=)}
   */
  deprecatedRunAfterPendingDispatches: null,

  /**
   * Sends a raw message over main connection.
   * Protocol.test.sendRawMessage('Page.enable', {}, console.log)
   */
  sendRawMessage: null,

  /**
   * Set to true to not log any errors.
   */
  suppressRequestErrors: false,

  /**
   * Set to get notified about any messages sent over protocol.
   * @type {?function({domain: string, method: string, params: !Object, id: number})}
   */
  onMessageSent: null,

  /**
   * Set to get notified about any messages received over protocol.
   * @type {?function(!Object)}
   */
  onMessageReceived: null,
};

/**
 * @param {function():!Protocol.Connection} factory
 */
Protocol.Connection.setFactory = function(factory) {
  Protocol.Connection._factory = factory;
};


/** @type {function():!Protocol.Connection} */
Protocol.Connection._factory;

/**
 * Takes error and result.
 * @typedef {function(?Object, ?Object)}
 */
Protocol._Callback;

// TODO(dgozman): we are not reporting generic errors in tests, but we should
// instead report them and just have some expected errors in test expectations.
Protocol._GenericError = -32000;
Protocol._ConnectionClosedErrorCode = -32001;

Protocol.SessionRouter = class {
  constructor() {
    this._connection = Protocol.Connection._factory();
    this._lastMessageId = 1;
    this._pendingResponsesCount = 0;
    this._domainToLogger = new Map();

    /** @type {!Map<string, {target: !Protocol.TargetBase, callbacks: !Map<number, !Protocol._Callback>}>} */
    this._sessions = new Map();

    /** @type {!Array<function()>} */
    this._pendingScripts = [];

    Protocol.test.deprecatedRunAfterPendingDispatches = this._deprecatedRunAfterPendingDispatches.bind(this);
    Protocol.test.sendRawMessage = this._sendRawMessageForTesting.bind(this);

    this._connection.setOnMessage(this._onMessage.bind(this));

    this._connection.setOnDisconnect(reason => {
      const session = this._sessions.get('');
      if (session)
        session.target.dispose(reason);
    });
  }

  /**
   * @param {!Protocol.TargetBase} target
   * @param {string} sessionId
   */
  registerSession(target, sessionId) {
    this._sessions.set(sessionId, {target, callbacks: new Map()});
  }

  /**
   * @param {string} sessionId
   */
  unregisterSession(sessionId) {
    const session = this._sessions.get(sessionId);
    for (const callback of session.callbacks.values())
      Protocol.SessionRouter.dispatchConnectionError(callback);
    this._sessions.delete(sessionId);
  }

  /**
   * @return {number}
   */
  _nextMessageId() {
    return this._lastMessageId++;
  }

  /**
   * @param {string} sessionId
   * @param {string} domain
   * @param {string} method
   * @param {?Object} params
   * @param {!Protocol._Callback} callback
   */
  sendMessage(sessionId, domain, method, params, callback) {
    const messageObject = {};
    const messageId = this._nextMessageId();
    messageObject.id = messageId;
    messageObject.method = method;
    if (params)
      messageObject.params = params;
    if (sessionId)
      messageObject.sessionId = sessionId;

    if (Protocol.test.dumpProtocol)
      Protocol.test.dumpProtocol('frontend: ' + JSON.stringify(messageObject));

    if (Protocol.test.onMessageSent) {
      const paramsObject = JSON.parse(JSON.stringify(params || {}));
      Protocol.test.onMessageSent({domain, method, params: /** @type {!Object} */ (paramsObject), id: messageId});
    }

    ++this._pendingResponsesCount;
    this._sessions.get(sessionId).callbacks.set(messageId, callback);
    this._connection.sendRawMessage(JSON.stringify(messageObject));
  }

  /**
   * @param {string} method
   * @param {?Object} params
   * @param {?function(...*)} callback
   */
  _sendRawMessageForTesting(method, params, callback) {
    const domain = method.split('.')[0];
    this.sendMessage('', domain, method, params, callback || (() => {}));
  }

  /**
   * @param {!Object|string} message
   */
  _onMessage(message) {
    if (Protocol.test.dumpProtocol)
      Protocol.test.dumpProtocol('backend: ' + ((typeof message === 'string') ? message : JSON.stringify(message)));

    if (Protocol.test.onMessageReceived) {
      const messageObjectCopy = JSON.parse((typeof message === 'string') ? message : JSON.stringify(message));
      Protocol.test.onMessageReceived(/** @type {!Object} */ (messageObjectCopy));
    }

    const messageObject = /** @type {!Object} */ ((typeof message === 'string') ? JSON.parse(message) : message);

    const sessionId = messageObject.sessionId || '';
    const session = this._sessions.get(sessionId);
    if (!session) {
      Protocol.InspectorBackend.reportProtocolError('Protocol Error: the message with wrong session id', messageObject);
      return;
    }

    if (session.target._needsNodeJSPatching)
      Protocol.NodeURL.patch(messageObject);

    if ('id' in messageObject) {  // just a response for some request
      const callback = session.callbacks.get(messageObject.id);
      session.callbacks.delete(messageObject.id);
      if (!callback) {
        Protocol.InspectorBackend.reportProtocolError('Protocol Error: the message with wrong id', messageObject);
        return;
      }

      callback(messageObject.error, messageObject.result);
      --this._pendingResponsesCount;

      if (this._pendingScripts.length && !this._pendingResponsesCount)
        this._deprecatedRunAfterPendingDispatches();
    } else {
      if (!('method' in messageObject)) {
        Protocol.InspectorBackend.reportProtocolError('Protocol Error: the message without method', messageObject);
        return;
      }

      const method = messageObject.method.split('.');
      const domainName = method[0];
      if (!(domainName in session.target._dispatchers)) {
        Protocol.InspectorBackend.reportProtocolError(
            `Protocol Error: the message ${messageObject.method} is for non-existing domain '${domainName}'`,
            messageObject);
        return;
      }

      session.target._dispatchers[domainName].dispatch(method[1], messageObject);
    }
  }

  /**
   * @param {function()=} script
   */
  _deprecatedRunAfterPendingDispatches(script) {
    if (script)
      this._pendingScripts.push(script);

    // Execute all promises.
    setTimeout(() => {
      if (!this._pendingResponsesCount)
        this._executeAfterPendingDispatches();
      else
        this._deprecatedRunAfterPendingDispatches();
    }, 0);
  }

  _executeAfterPendingDispatches() {
    if (!this._pendingResponsesCount) {
      const scripts = this._pendingScripts;
      this._pendingScripts = [];
      for (let id = 0; id < scripts.length; ++id)
        scripts[id]();
    }
  }

  /**
   * @param {!Protocol._Callback} callback
   */
  static dispatchConnectionError(callback) {
    const error = {
      message: 'Connection is closed, can\'t dispatch pending call',
      code: Protocol._ConnectionClosedErrorCode,
      data: null
    };
    setTimeout(() => callback(error, null), 0);
  }
};

/**
 * @unrestricted
 */
Protocol.TargetBase = class {
  /**
   * @param {boolean} needsNodeJSPatching
   * @param {?Protocol.TargetBase} parentTarget
   * @param {string} sessionId
   */
  constructor(needsNodeJSPatching, parentTarget, sessionId) {
    this._needsNodeJSPatching = needsNodeJSPatching;
    this._sessionId = sessionId;

    this._router = parentTarget ? parentTarget._router : new Protocol.SessionRouter();
    this._router.registerSession(this, this._sessionId);

    this._agents = {};
    for (const [domain, agentPrototype] of Protocol.inspectorBackend._agentPrototypes) {
      this._agents[domain] = Object.create(/** @type {!Protocol.InspectorBackend._AgentPrototype} */ (agentPrototype));
      this._agents[domain]._target = this;
    }

    this._dispatchers = {};
    for (const [domain, dispatcherPrototype] of Protocol.inspectorBackend._dispatcherPrototypes) {
      this._dispatchers[domain] =
          Object.create(/** @type {!Protocol.InspectorBackend._DispatcherPrototype} */ (dispatcherPrototype));
      this._dispatchers[domain]._dispatchers = [];
    }
  }

  /**
   * @param {string} domain
   * @param {!Object} dispatcher
   */
  registerDispatcher(domain, dispatcher) {
    if (!this._dispatchers[domain])
      return;
    this._dispatchers[domain].addDomainDispatcher(dispatcher);
  }

  /**
   * @param {string} reason
   */
  dispose(reason) {
    this._router.unregisterSession(this._sessionId);
    this._router = null;
  }

  /**
   * @return {boolean}
   */
  isDisposed() {
    return !this._router;
  }

  markAsNodeJSForTest() {
    this._needsNodeJSPatching = true;
  }
};

/**
 * @unrestricted
 */
Protocol.InspectorBackend._AgentPrototype = class {
  /**
   * @param {string} domain
   */
  constructor(domain) {
    this._replyArgs = {};
    this._hasErrorData = {};
    this._domain = domain;
  }

  /**
   * @param {string} methodName
   * @param {!Array.<!Object>} signature
   * @param {!Array.<string>} replyArgs
   * @param {boolean} hasErrorData
   */
  registerCommand(methodName, signature, replyArgs, hasErrorData) {
    const domainAndMethod = this._domain + '.' + methodName;

    /**
     * @param {...*} vararg
     * @this {Protocol.InspectorBackend._AgentPrototype}
     * @return {!Promise.<*>}
     */
    function sendMessagePromise(vararg) {
      const params = Array.prototype.slice.call(arguments);
      return Protocol.InspectorBackend._AgentPrototype.prototype._sendMessageToBackendPromise.call(
          this, domainAndMethod, signature, params);
    }

    this[methodName] = sendMessagePromise;

    /**
     * @param {!Object} request
     * @return {!Promise}
     * @this {Protocol.InspectorBackend._AgentPrototype}
     */
    function invoke(request) {
      return this._invoke(domainAndMethod, request);
    }

    this['invoke_' + methodName] = invoke;

    this._replyArgs[domainAndMethod] = replyArgs;
    if (hasErrorData)
      this._hasErrorData[domainAndMethod] = true;
  }

  /**
   * @param {string} method
   * @param {!Array.<!Object>} signature
   * @param {!Array.<*>} args
   * @param {function(string)} errorCallback
   * @return {?Object}
   */
  _prepareParameters(method, signature, args, errorCallback) {
    const params = {};
    let hasParams = false;

    for (const param of signature) {
      const paramName = param['name'];
      const typeName = param['type'];
      const optionalFlag = param['optional'];

      if (!args.length && !optionalFlag) {
        errorCallback(
            `Protocol Error: Invalid number of arguments for method '${method}' call. ` +
            `It must have the following arguments ${JSON.stringify(signature)}'.`);
        return null;
      }

      const value = args.shift();
      if (optionalFlag && typeof value === 'undefined')
        continue;

      if (typeof value !== typeName) {
        errorCallback(
            `Protocol Error: Invalid type of argument '${paramName}' for method '${method}' call. ` +
            `It must be '${typeName}' but it is '${typeof value}'.`);
        return null;
      }

      params[paramName] = value;
      hasParams = true;
    }

    if (args.length) {
      errorCallback(`Protocol Error: Extra ${args.length} arguments in a call to method '${method}'.`);
      return null;
    }

    return hasParams ? params : null;
  }

  /**
   * @param {string} method
   * @param {!Array<!Object>} signature
   * @param {!Array<*>} args
   * @return {!Promise<?>}
   */
  _sendMessageToBackendPromise(method, signature, args) {
    let errorMessage;
    /**
     * @param {string} message
     */
    function onError(message) {
      console.error(message);
      errorMessage = message;
    }
    const params = this._prepareParameters(method, signature, args, onError);
    if (errorMessage)
      return Promise.resolve(null);

    return new Promise(resolve => {
      const callback = (error, result) => {
        if (error && !Protocol.test.suppressRequestErrors && error.code !== Protocol.DevToolsStubErrorCode &&
            error.code !== Protocol._GenericError && error.code !== Protocol._ConnectionClosedErrorCode)
          console.error('Request ' + method + ' failed. ' + JSON.stringify(error));


        if (error) {
          resolve(null);
          return;
        }
        const args = this._replyArgs[method];
        resolve(result && args.length ? result[args[0]] : undefined);
      };

      if (!this._target._router)
        Protocol.SessionRouter.dispatchConnectionError(callback);
      else
        this._target._router.sendMessage(this._target._sessionId, this._domain, method, params, callback);
    });
  }

  /**
   * @param {string} method
   * @param {?Object} request
   * @return {!Promise<!Object>}
   */
  _invoke(method, request) {
    return new Promise(fulfill => {
      const callback = (error, result) => {
        if (error && !Protocol.test.suppressRequestErrors && error.code !== Protocol.DevToolsStubErrorCode &&
            error.code !== Protocol._GenericError && error.code !== Protocol._ConnectionClosedErrorCode)
          console.error('Request ' + method + ' failed. ' + JSON.stringify(error));


        if (!result)
          result = {};
        if (error)
          result[Protocol.Error] = error.message;
        fulfill(result);
      };

      if (!this._target._router)
        Protocol.SessionRouter.dispatchConnectionError(callback);
      else
        this._target._router.sendMessage(this._target._sessionId, this._domain, method, request, callback);
    });
  }
};

/**
 * @unrestricted
 */
Protocol.InspectorBackend._DispatcherPrototype = class {
  constructor() {
    this._eventArgs = {};
  }

  /**
   * @param {string} eventName
   * @param {!Object} params
   */
  registerEvent(eventName, params) {
    this._eventArgs[eventName] = params;
  }

  /**
   * @param {!Object} dispatcher
   */
  addDomainDispatcher(dispatcher) {
    this._dispatchers.push(dispatcher);
  }

  /**
   * @param {string} functionName
   * @param {!Object} messageObject
   */
  dispatch(functionName, messageObject) {
    if (!this._dispatchers.length)
      return;

    if (!this._eventArgs[messageObject.method]) {
      Protocol.InspectorBackend.reportProtocolError(
          `Protocol Error: Attempted to dispatch an unspecified method '${messageObject.method}'`, messageObject);
      return;
    }

    const params = [];
    if (messageObject.params) {
      const paramNames = this._eventArgs[messageObject.method];
      for (let i = 0; i < paramNames.length; ++i)
        params.push(messageObject.params[paramNames[i]]);
    }

    for (let index = 0; index < this._dispatchers.length; ++index) {
      const dispatcher = this._dispatchers[index];
      if (functionName in dispatcher)
        dispatcher[functionName].apply(dispatcher, params);
    }
  }
};
