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

/**
 * @implements {SDK.SDKModelObserver<!SDK.NetworkManager>}
 */
SDK.NetworkLog = class extends Common.Object {
  constructor() {
    super();
    /** @type {!Array<!SDK.NetworkRequest>} */
    this._requests = [];
    /** @type {!Set<!SDK.NetworkRequest>} */
    this._requestsSet = new Set();
    /** @type {!Map<!SDK.NetworkManager, !SDK.NetworkLog.PageLoad>} */
    this._pageLoadForManager = new Map();
    this._isRecording = true;
    SDK.targetManager.observeModels(SDK.NetworkManager, this);
  }

  /**
   * @override
   * @param {!SDK.NetworkManager} networkManager
   */
  modelAdded(networkManager) {
    const eventListeners = [];
    eventListeners.push(
        networkManager.addEventListener(SDK.NetworkManager.Events.RequestStarted, this._onRequestStarted, this));
    eventListeners.push(
        networkManager.addEventListener(SDK.NetworkManager.Events.RequestUpdated, this._onRequestUpdated, this));
    eventListeners.push(
        networkManager.addEventListener(SDK.NetworkManager.Events.RequestRedirected, this._onRequestRedirect, this));
    eventListeners.push(
        networkManager.addEventListener(SDK.NetworkManager.Events.RequestFinished, this._onRequestUpdated, this));
    eventListeners.push(networkManager.addEventListener(
        SDK.NetworkManager.Events.MessageGenerated, this._networkMessageGenerated.bind(this, networkManager)));

    const resourceTreeModel = networkManager.target().model(SDK.ResourceTreeModel);
    if (resourceTreeModel) {
      eventListeners.push(
          resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.WillReloadPage, this._willReloadPage, this));
      eventListeners.push(resourceTreeModel.addEventListener(
          SDK.ResourceTreeModel.Events.MainFrameNavigated, this._onMainFrameNavigated, this));
      eventListeners.push(resourceTreeModel.addEventListener(SDK.ResourceTreeModel.Events.Load, this._onLoad, this));
      eventListeners.push(resourceTreeModel.addEventListener(
          SDK.ResourceTreeModel.Events.DOMContentLoaded, this._onDOMContentLoaded.bind(this, resourceTreeModel)));
    }

    networkManager[SDK.NetworkLog._events] = eventListeners;
  }

  /**
   * @override
   * @param {!SDK.NetworkManager} networkManager
   */
  modelRemoved(networkManager) {
    this._removeNetworkManagerListeners(networkManager);
  }

  /**
   * @param {!SDK.NetworkManager} networkManager
   */
  _removeNetworkManagerListeners(networkManager) {
    Common.EventTarget.removeEventListeners(networkManager[SDK.NetworkLog._events]);
  }

  /**
   * @param {boolean} enabled
   */
  setIsRecording(enabled) {
    if (this._isRecording === enabled)
      return;
    this._isRecording = enabled;
    if (enabled) {
      SDK.targetManager.observeModels(SDK.NetworkManager, this);
    } else {
      SDK.targetManager.unobserveModels(SDK.NetworkManager, this);
      SDK.targetManager.models(SDK.NetworkManager).forEach(this._removeNetworkManagerListeners.bind(this));
    }
  }

  /**
   * @param {string} url
   * @return {?SDK.NetworkRequest}
   */
  requestForURL(url) {
    return this._requests.find(request => request.url() === url) || null;
  }

  /**
   * @return {!Array<!SDK.NetworkRequest>}
   */
  requests() {
    return this._requests;
  }

  /**
   * @param {!SDK.NetworkManager} networkManager
   * @param {!Protocol.Network.RequestId} requestId
   * @return {?SDK.NetworkRequest}
   */
  requestByManagerAndId(networkManager, requestId) {
    // We itterate backwards because the last item will likely be the one needed for console network request lookups.
    for (let i = this._requests.length - 1; i >= 0; i--) {
      const request = this._requests[i];
      if (requestId === request.requestId() && networkManager === SDK.NetworkManager.forRequest(request))
        return request;
    }
    return null;
  }

  /**
   * @param {!SDK.NetworkManager} networkManager
   * @param {string} url
   * @return {?SDK.NetworkRequest}
   */
  _requestByManagerAndURL(networkManager, url) {
    for (const request of this._requests) {
      if (url === request.url() && networkManager === SDK.NetworkManager.forRequest(request))
        return request;
    }
    return null;
  }

  /**
   * @param {!SDK.NetworkRequest} request
   */
  _initializeInitiatorSymbolIfNeeded(request) {
    if (!request[SDK.NetworkLog._initiatorDataSymbol]) {
      /** @type {!{info: ?SDK.NetworkLog._InitiatorInfo, chain: !Set<!SDK.NetworkRequest>, request: (?SDK.NetworkRequest|undefined)}} */
      request[SDK.NetworkLog._initiatorDataSymbol] = {
        info: null,
        chain: null,
        request: undefined,
      };
    }
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @return {!SDK.NetworkLog._InitiatorInfo}
   */
  initiatorInfoForRequest(request) {
    this._initializeInitiatorSymbolIfNeeded(request);
    if (request[SDK.NetworkLog._initiatorDataSymbol].info)
      return request[SDK.NetworkLog._initiatorDataSymbol].info;

    let type = SDK.NetworkRequest.InitiatorType.Other;
    let url = '';
    let lineNumber = -Infinity;
    let columnNumber = -Infinity;
    let scriptId = null;
    let initiatorStack = null;
    const initiator = request.initiator();

    const redirectSource = request.redirectSource();
    if (redirectSource) {
      type = SDK.NetworkRequest.InitiatorType.Redirect;
      url = redirectSource.url();
    } else if (initiator) {
      if (initiator.type === Protocol.Network.InitiatorType.Parser) {
        type = SDK.NetworkRequest.InitiatorType.Parser;
        url = initiator.url ? initiator.url : url;
        lineNumber = initiator.lineNumber ? initiator.lineNumber : lineNumber;
      } else if (initiator.type === Protocol.Network.InitiatorType.Script) {
        for (let stack = initiator.stack; stack; stack = stack.parent) {
          const topFrame = stack.callFrames.length ? stack.callFrames[0] : null;
          if (!topFrame)
            continue;
          type = SDK.NetworkRequest.InitiatorType.Script;
          url = topFrame.url || Common.UIString('<anonymous>');
          lineNumber = topFrame.lineNumber;
          columnNumber = topFrame.columnNumber;
          scriptId = topFrame.scriptId;
          break;
        }
        if (!initiator.stack && initiator.url) {
          type = SDK.NetworkRequest.InitiatorType.Script;
          url = initiator.url;
          lineNumber = initiator.lineNumber || 0;
        }
        if (initiator.stack && initiator.stack.callFrames && initiator.stack.callFrames.length)
          initiatorStack = initiator.stack || null;
      } else if (initiator.type === Protocol.Network.InitiatorType.Preload) {
        type = SDK.NetworkRequest.InitiatorType.Preload;
      } else if (initiator.type === Protocol.Network.InitiatorType.SignedExchange) {
        type = SDK.NetworkRequest.InitiatorType.SignedExchange;
        url = initiator.url;
      }
    }

    request[SDK.NetworkLog._initiatorDataSymbol].info = {
      type: type,
      url: url,
      lineNumber: lineNumber,
      columnNumber: columnNumber,
      scriptId: scriptId,
      stack: initiatorStack
    };
    return request[SDK.NetworkLog._initiatorDataSymbol].info;
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @return {!SDK.NetworkLog.InitiatorGraph}
   */
  initiatorGraphForRequest(request) {
    /** @type {!Set<!SDK.NetworkRequest>} */
    const initiated = new Set();
    const networkManager = SDK.NetworkManager.forRequest(request);
    for (const otherRequest of this._requests) {
      const otherRequestManager = SDK.NetworkManager.forRequest(request);
      if (networkManager === otherRequestManager && this._initiatorChain(otherRequest).has(request))
        initiated.add(otherRequest);
    }
    return {initiators: this._initiatorChain(request), initiated: initiated};
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @return {!Set<!SDK.NetworkRequest>}
   */
  _initiatorChain(request) {
    this._initializeInitiatorSymbolIfNeeded(request);
    let initiatorChainCache =
        /** @type {?Set<!SDK.NetworkRequest>} */ (request[SDK.NetworkLog._initiatorDataSymbol].chain);
    if (initiatorChainCache)
      return initiatorChainCache;

    initiatorChainCache = new Set();

    let checkRequest = request;
    do {
      if (checkRequest[SDK.NetworkLog._initiatorDataSymbol].chain) {
        initiatorChainCache.addAll(checkRequest[SDK.NetworkLog._initiatorDataSymbol].chain);
        break;
      }
      if (initiatorChainCache.has(checkRequest))
        break;
      initiatorChainCache.add(checkRequest);
      checkRequest = this._initiatorRequest(checkRequest);
    } while (checkRequest);
    request[SDK.NetworkLog._initiatorDataSymbol].chain = initiatorChainCache;
    return initiatorChainCache;
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @return {?SDK.NetworkRequest}
   */
  _initiatorRequest(request) {
    this._initializeInitiatorSymbolIfNeeded(request);
    if (request[SDK.NetworkLog._initiatorDataSymbol].request !== undefined)
      return request[SDK.NetworkLog._initiatorDataSymbol].request;
    const url = this.initiatorInfoForRequest(request).url;
    const networkManager = SDK.NetworkManager.forRequest(request);
    request[SDK.NetworkLog._initiatorDataSymbol].request =
        networkManager ? this._requestByManagerAndURL(networkManager, url) : null;
    return request[SDK.NetworkLog._initiatorDataSymbol].request;
  }

  _willReloadPage() {
    if (!Common.moduleSetting('network_log.preserve-log').get())
      this.reset();
  }

  /**
   * @param {!Common.Event} event
   */
  _onMainFrameNavigated(event) {
    const mainFrame = /** @type {!SDK.ResourceTreeFrame} */ (event.data);
    const manager = mainFrame.resourceTreeModel().target().model(SDK.NetworkManager);
    if (!manager || mainFrame.resourceTreeModel().target().parentTarget())
      return;

    const oldRequests = this._requests;
    const oldManagerRequests = this._requests.filter(request => SDK.NetworkManager.forRequest(request) === manager);
    const oldRequestsSet = this._requestsSet;
    this._requests = [];
    this._requestsSet = new Set();
    this.dispatchEventToListeners(SDK.NetworkLog.Events.Reset);

    // Preserve requests from the new session.
    let currentPageLoad = null;
    const requestsToAdd = [];
    for (const request of oldManagerRequests) {
      if (request.loaderId !== mainFrame.loaderId)
        continue;
      if (!currentPageLoad) {
        currentPageLoad = new SDK.NetworkLog.PageLoad(request);
        let redirectSource = request.redirectSource();
        while (redirectSource) {
          requestsToAdd.push(redirectSource);
          redirectSource = redirectSource.redirectSource();
        }
      }
      requestsToAdd.push(request);
    }

    // Preserve service worker requests from the new session.
    const serviceWorkerRequestsToAdd = [];
    for (const swRequest of oldRequests) {
      const networkManager = SDK.NetworkManager.forRequest(swRequest);
      if (!networkManager)
        continue;
      const target = networkManager.target();
      if (!(target.type() === SDK.Target.Type.Worker && target.parentTarget().type() === SDK.Target.Type.ServiceWorker))
        continue;

      // If there is a matching request that came before this one, keep it.
      const keepRequest = requestsToAdd.some(
          request => request.url() === swRequest.url() && request.issueTime() <= swRequest.issueTime());
      if (keepRequest)
        serviceWorkerRequestsToAdd.push(swRequest);
    }
    requestsToAdd.push(...serviceWorkerRequestsToAdd);

    for (const request of requestsToAdd) {
      oldRequestsSet.delete(request);
      this._requests.push(request);
      this._requestsSet.add(request);
      currentPageLoad.bindRequest(request);
      this.dispatchEventToListeners(SDK.NetworkLog.Events.RequestAdded, request);
    }

    if (Common.moduleSetting('network_log.preserve-log').get()) {
      for (const request of oldRequestsSet) {
        this._requests.push(request);
        this._requestsSet.add(request);
        this.dispatchEventToListeners(SDK.NetworkLog.Events.RequestAdded, request);
      }
    }

    if (currentPageLoad)
      this._pageLoadForManager.set(manager, currentPageLoad);
  }

  /**
   * @param {!Array<!SDK.NetworkRequest>} requests
   */
  importRequests(requests) {
    this.reset();
    this._requests = [];
    this._requestsSet.clear();
    for (const request of requests) {
      this._requests.push(request);
      this._requestsSet.add(request);
      this.dispatchEventToListeners(SDK.NetworkLog.Events.RequestAdded, request);
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _onRequestStarted(event) {
    const request = /** @type {!SDK.NetworkRequest} */ (event.data);
    this._requests.push(request);
    this._requestsSet.add(request);
    const manager = SDK.NetworkManager.forRequest(request);
    const pageLoad = manager ? this._pageLoadForManager.get(manager) : null;
    if (pageLoad)
      pageLoad.bindRequest(request);
    this.dispatchEventToListeners(SDK.NetworkLog.Events.RequestAdded, request);
  }

  /**
   * @param {!Common.Event} event
   */
  _onRequestUpdated(event) {
    const request = /** @type {!SDK.NetworkRequest} */ (event.data);
    if (!this._requestsSet.has(request))
      return;
    this.dispatchEventToListeners(SDK.NetworkLog.Events.RequestUpdated, request);
  }

  /**
   * @param {!Common.Event} event
   */
  _onRequestRedirect(event) {
    const request = /** @type {!SDK.NetworkRequest} */ (event.data);
    delete request[SDK.NetworkLog._initiatorDataSymbol];
  }

  /**
   * @param {!SDK.ResourceTreeModel} resourceTreeModel
   * @param {!Common.Event} event
   */
  _onDOMContentLoaded(resourceTreeModel, event) {
    const networkManager = resourceTreeModel.target().model(SDK.NetworkManager);
    const pageLoad = networkManager ? this._pageLoadForManager.get(networkManager) : null;
    if (pageLoad)
      pageLoad.contentLoadTime = /** @type {number} */ (event.data);
  }

  /**
   * @param {!Common.Event} event
   */
  _onLoad(event) {
    const networkManager = event.data.resourceTreeModel.target().model(SDK.NetworkManager);
    const pageLoad = networkManager ? this._pageLoadForManager.get(networkManager) : null;
    if (pageLoad)
      pageLoad.loadTime = /** @type {number} */ (event.data.loadTime);
  }

  reset() {
    this._requests = [];
    this._requestsSet.clear();
    const managers = new Set(SDK.targetManager.models(SDK.NetworkManager));
    for (const manager of this._pageLoadForManager.keys()) {
      if (!managers.has(manager))
        this._pageLoadForManager.delete(manager);
    }

    this.dispatchEventToListeners(SDK.NetworkLog.Events.Reset);
  }

  /**
   * @param {!SDK.NetworkManager} networkManager
   * @param {!Common.Event} event
   */
  _networkMessageGenerated(networkManager, event) {
    const message = /** @type {!SDK.NetworkManager.Message} */ (event.data);
    const consoleMessage = new SDK.ConsoleMessage(
        networkManager.target().model(SDK.RuntimeModel), SDK.ConsoleMessage.MessageSource.Network,
        message.warning ? SDK.ConsoleMessage.MessageLevel.Warning : SDK.ConsoleMessage.MessageLevel.Info,
        message.message);
    this.associateConsoleMessageWithRequest(consoleMessage, message.requestId);
    SDK.consoleModel.addMessage(consoleMessage);
  }

  /**
   * @param {!SDK.ConsoleMessage} consoleMessage
   * @param {!Protocol.Network.RequestId} requestId
   */
  associateConsoleMessageWithRequest(consoleMessage, requestId) {
    const target = consoleMessage.target();
    const networkManager = target ? target.model(SDK.NetworkManager) : null;
    if (!networkManager)
      return;
    const request = this.requestByManagerAndId(networkManager, requestId);
    if (!request)
      return;
    consoleMessage[SDK.NetworkLog._requestSymbol] = request;
    const initiator = request.initiator();
    if (initiator) {
      consoleMessage.stackTrace = initiator.stack || undefined;
      if (initiator.url) {
        consoleMessage.url = initiator.url;
        consoleMessage.line = initiator.lineNumber || 0;
      }
    }
  }

  /**
   * @param {!SDK.ConsoleMessage} consoleMessage
   * @return {?SDK.NetworkRequest}
   */
  static requestForConsoleMessage(consoleMessage) {
    return consoleMessage[SDK.NetworkLog._requestSymbol] || null;
  }
};

SDK.NetworkLog.PageLoad = class {
  /**
   * @param {!SDK.NetworkRequest} mainRequest
   */
  constructor(mainRequest) {
    this.id = ++SDK.NetworkLog.PageLoad._lastIdentifier;
    this.url = mainRequest.url();
    this.startTime = mainRequest.startTime;
    /** @type {number} */
    this.loadTime;
    /** @type {number} */
    this.contentLoadTime;
    this.mainRequest = mainRequest;

    this._showDataSaverWarningIfNeeded();
  }

  async _showDataSaverWarningIfNeeded() {
    const manager = SDK.NetworkManager.forRequest(this.mainRequest);
    if (!manager)
      return;
    if (!this.mainRequest.finished)
      await this.mainRequest.once(SDK.NetworkRequest.Events.FinishedLoading);
    const saveDataHeader = this.mainRequest.requestHeaderValue('Save-Data');
    if (!SDK.NetworkLog.PageLoad._dataSaverMessageWasShown && saveDataHeader && saveDataHeader === 'on') {
      const message = Common.UIString(
          'Consider disabling %s while debugging. For more info see: %s', Common.UIString('Chrome Data Saver'),
          'https://support.google.com/chrome/?p=datasaver');
      manager.dispatchEventToListeners(
          SDK.NetworkManager.Events.MessageGenerated,
          {message: message, requestId: this.mainRequest.requestId(), warning: true});
      SDK.NetworkLog.PageLoad._dataSaverMessageWasShown = true;
    }
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @return {?SDK.NetworkLog.PageLoad}
   */
  static forRequest(request) {
    return request[SDK.NetworkLog.PageLoad._pageLoadForRequestSymbol] || null;
  }

  /**
   * @param {!SDK.NetworkRequest} request
   */
  bindRequest(request) {
    request[SDK.NetworkLog.PageLoad._pageLoadForRequestSymbol] = this;
  }
};

SDK.NetworkLog.PageLoad._lastIdentifier = 0;
SDK.NetworkLog.PageLoad._pageLoadForRequestSymbol = Symbol('PageLoadForRequest');
SDK.NetworkLog._requestSymbol = Symbol('_request');

SDK.NetworkLog.PageLoad._dataSaverMessageWasShown = false;

/** @typedef {!{initiators: !Set<!SDK.NetworkRequest>, initiated: !Set<!SDK.NetworkRequest>}} */
SDK.NetworkLog.InitiatorGraph;

SDK.NetworkLog.Events = {
  Reset: Symbol('Reset'),
  RequestAdded: Symbol('RequestAdded'),
  RequestUpdated: Symbol('RequestUpdated')
};

/** @typedef {!{type: !SDK.NetworkRequest.InitiatorType, url: string, lineNumber: number, columnNumber: number, scriptId: ?string, stack: ?Protocol.Runtime.StackTrace}} */
SDK.NetworkLog._InitiatorInfo;

SDK.NetworkLog._initiatorDataSymbol = Symbol('InitiatorData');
SDK.NetworkLog._events = Symbol('SDK.NetworkLog.events');

/** @type {!SDK.NetworkLog} */
SDK.networkLog = new SDK.NetworkLog();
