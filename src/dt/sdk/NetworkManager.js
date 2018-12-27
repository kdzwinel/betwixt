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
 * @unrestricted
 */
SDK.NetworkManager = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    this._dispatcher = new SDK.NetworkDispatcher(this);
    this._networkAgent = target.networkAgent();
    target.registerNetworkDispatcher(this._dispatcher);
    if (Common.moduleSetting('cacheDisabled').get())
      this._networkAgent.setCacheDisabled(true);

    this._networkAgent.enable(undefined, undefined, SDK.NetworkManager.MAX_EAGER_POST_REQUEST_BODY_LENGTH);

    this._bypassServiceWorkerSetting = Common.settings.createSetting('bypassServiceWorker', false);
    if (this._bypassServiceWorkerSetting.get())
      this._bypassServiceWorkerChanged();
    this._bypassServiceWorkerSetting.addChangeListener(this._bypassServiceWorkerChanged, this);

    Common.moduleSetting('cacheDisabled').addChangeListener(this._cacheDisabledSettingChanged, this);
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @return {?SDK.NetworkManager}
   */
  static forRequest(request) {
    return request[SDK.NetworkManager._networkManagerForRequestSymbol];
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @return {boolean}
   */
  static canReplayRequest(request) {
    return !!request[SDK.NetworkManager._networkManagerForRequestSymbol] &&
        request.resourceType() === Common.resourceTypes.XHR;
  }

  /**
   * @param {!SDK.NetworkRequest} request
   */
  static replayRequest(request) {
    const manager = request[SDK.NetworkManager._networkManagerForRequestSymbol];
    if (!manager)
      return;
    manager._networkAgent.replayXHR(request.requestId());
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @param {string} query
   * @param {boolean} caseSensitive
   * @param {boolean} isRegex
   * @return {!Promise<!Array<!Common.ContentProvider.SearchMatch>>}
   */
  static async searchInRequest(request, query, caseSensitive, isRegex) {
    const manager = SDK.NetworkManager.forRequest(request);
    if (!manager)
      return [];
    const response = await manager._networkAgent.invoke_searchInResponseBody(
        {requestId: request.requestId(), query: query, caseSensitive: caseSensitive, isRegex: isRegex});
    return response.result || [];
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @return {!Promise<!SDK.NetworkRequest.ContentData>}
   */
  static async requestContentData(request) {
    if (request.resourceType() === Common.resourceTypes.WebSocket)
      return {error: 'Content for WebSockets is currently not supported', content: null, encoded: false};
    if (!request.finished)
      await request.once(SDK.NetworkRequest.Events.FinishedLoading);
    const manager = SDK.NetworkManager.forRequest(request);
    if (!manager)
      return {error: 'No network manager for request', content: null, encoded: false};
    const response = await manager._networkAgent.invoke_getResponseBody({requestId: request.requestId()});
    const error = response[Protocol.Error] || null;
    return {error: error, content: error ? null : response.body, encoded: response.base64Encoded};
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @return {!Promise<?string>}
   */
  static requestPostData(request) {
    const manager = SDK.NetworkManager.forRequest(request);
    if (manager)
      return manager._networkAgent.getRequestPostData(request.backendRequestId());
    console.error('No network manager for request');
    return /** @type {!Promise<?string>} */ (Promise.resolve(null));
  }

  /**
   * @param {!SDK.NetworkManager.Conditions} conditions
   * @return {!Protocol.Network.ConnectionType}
   * TODO(allada): this belongs to NetworkConditionsSelector, which should hardcode/guess it.
   */
  static _connectionType(conditions) {
    if (!conditions.download && !conditions.upload)
      return Protocol.Network.ConnectionType.None;
    let types = SDK.NetworkManager._connectionTypes;
    if (!types) {
      SDK.NetworkManager._connectionTypes = [];
      types = SDK.NetworkManager._connectionTypes;
      types.push(['2g', Protocol.Network.ConnectionType.Cellular2g]);
      types.push(['3g', Protocol.Network.ConnectionType.Cellular3g]);
      types.push(['4g', Protocol.Network.ConnectionType.Cellular4g]);
      types.push(['bluetooth', Protocol.Network.ConnectionType.Bluetooth]);
      types.push(['wifi', Protocol.Network.ConnectionType.Wifi]);
      types.push(['wimax', Protocol.Network.ConnectionType.Wimax]);
    }
    for (const type of types) {
      if (conditions.title.toLowerCase().indexOf(type[0]) !== -1)
        return type[1];
    }
    return Protocol.Network.ConnectionType.Other;
  }

  /**
   * @param {!Object} headers
   * @return {!Object<string, string>}
   */
  static lowercaseHeaders(headers) {
    const newHeaders = {};
    for (const headerName in headers)
      newHeaders[headerName.toLowerCase()] = headers[headerName];
    return newHeaders;
  }

  /**
   * @param {string} url
   * @return {!SDK.NetworkRequest}
   */
  inflightRequestForURL(url) {
    return this._dispatcher._inflightRequestsByURL[url];
  }

  /**
   * @param {!Common.Event} event
   */
  _cacheDisabledSettingChanged(event) {
    const enabled = /** @type {boolean} */ (event.data);
    this._networkAgent.setCacheDisabled(enabled);
  }

  /**
   * @override
   */
  dispose() {
    Common.moduleSetting('cacheDisabled').removeChangeListener(this._cacheDisabledSettingChanged, this);
  }

  _bypassServiceWorkerChanged() {
    this._networkAgent.setBypassServiceWorker(this._bypassServiceWorkerSetting.get());
  }
};

SDK.SDKModel.register(SDK.NetworkManager, SDK.Target.Capability.Network, true);

/** @enum {symbol} */
SDK.NetworkManager.Events = {
  RequestStarted: Symbol('RequestStarted'),
  RequestUpdated: Symbol('RequestUpdated'),
  RequestFinished: Symbol('RequestFinished'),
  RequestUpdateDropped: Symbol('RequestUpdateDropped'),
  ResponseReceived: Symbol('ResponseReceived'),
  MessageGenerated: Symbol('MessageGenerated'),
  RequestRedirected: Symbol('RequestRedirected'),
};

/** @typedef {{message: string, requestId: string, warning: boolean}} */
SDK.NetworkManager.Message;

SDK.NetworkManager._MIMETypes = {
  'text/html': {'document': true},
  'text/xml': {'document': true},
  'text/plain': {'document': true},
  'application/xhtml+xml': {'document': true},
  'image/svg+xml': {'document': true},
  'text/css': {'stylesheet': true},
  'text/xsl': {'stylesheet': true},
  'text/vtt': {'texttrack': true},
};

/**
 * @typedef {{
 *   download: number,
 *   upload: number,
 *   latency: number,
 *   title: string,
 * }}
 **/
SDK.NetworkManager.Conditions;

/** @type {!SDK.NetworkManager.Conditions} */
SDK.NetworkManager.NoThrottlingConditions = {
  title: Common.UIString('Online'),
  download: -1,
  upload: -1,
  latency: 0
};

/** @type {!SDK.NetworkManager.Conditions} */
SDK.NetworkManager.OfflineConditions = {
  title: Common.UIString('Offline'),
  download: 0,
  upload: 0,
  latency: 0,
};

/** @type {!SDK.NetworkManager.Conditions} */
SDK.NetworkManager.Slow3GConditions = {
  title: Common.UIString('Slow 3G'),
  download: 500 * 1024 / 8 * .8,
  upload: 500 * 1024 / 8 * .8,
  latency: 400 * 5,
};

/** @type {!SDK.NetworkManager.Conditions} */
SDK.NetworkManager.Fast3GConditions = {
  title: Common.UIString('Fast 3G'),
  download: 1.6 * 1024 * 1024 / 8 * .9,
  upload: 750 * 1024 / 8 * .9,
  latency: 150 * 3.75,
};

/** @typedef {{url: string, enabled: boolean}} */
SDK.NetworkManager.BlockedPattern;

SDK.NetworkManager._networkManagerForRequestSymbol = Symbol('NetworkManager');

SDK.NetworkManager.MAX_EAGER_POST_REQUEST_BODY_LENGTH = 64 * 1024;  // bytes

/**
 * @implements {Protocol.NetworkDispatcher}
 * @unrestricted
 */
SDK.NetworkDispatcher = class {
  /**
   * @param {!SDK.NetworkManager} manager
   */
  constructor(manager) {
    this._manager = manager;
    /** @type {!Object<!Protocol.Network.RequestId, !SDK.NetworkRequest>} */
    this._inflightRequestsById = {};
    /** @type {!Object<string, !SDK.NetworkRequest>} */
    this._inflightRequestsByURL = {};
  }

  /**
   * @param {!Protocol.Network.Headers} headersMap
   * @return {!Array.<!SDK.NetworkRequest.NameValue>}
   */
  _headersMapToHeadersArray(headersMap) {
    const result = [];
    for (const name in headersMap) {
      const values = headersMap[name].split('\n');
      for (let i = 0; i < values.length; ++i)
        result.push({name: name, value: values[i]});
    }
    return result;
  }

  /**
   * @param {!SDK.NetworkRequest} networkRequest
   * @param {!Protocol.Network.Request} request
   */
  _updateNetworkRequestWithRequest(networkRequest, request) {
    networkRequest.requestMethod = request.method;
    networkRequest.setRequestHeaders(this._headersMapToHeadersArray(request.headers));
    networkRequest.setRequestFormData(!!request.hasPostData, request.postData || null);
    networkRequest.setInitialPriority(request.initialPriority);
    networkRequest.mixedContentType = request.mixedContentType || Protocol.Security.MixedContentType.None;
    networkRequest.setReferrerPolicy(request.referrerPolicy);
  }

  /**
   * @param {!SDK.NetworkRequest} networkRequest
   * @param {!Protocol.Network.Response=} response
   */
  _updateNetworkRequestWithResponse(networkRequest, response) {
    if (response.url && networkRequest.url() !== response.url)
      networkRequest.setUrl(response.url);
    networkRequest.mimeType = response.mimeType;
    networkRequest.statusCode = response.status;
    networkRequest.statusText = response.statusText;
    networkRequest.responseHeaders = this._headersMapToHeadersArray(response.headers);
    if (response.encodedDataLength >= 0)
      networkRequest.setTransferSize(response.encodedDataLength);
    if (response.headersText)
      networkRequest.responseHeadersText = response.headersText;
    if (response.requestHeaders) {
      networkRequest.setRequestHeaders(this._headersMapToHeadersArray(response.requestHeaders));
      networkRequest.setRequestHeadersText(response.requestHeadersText || '');
    }

    networkRequest.connectionReused = response.connectionReused;
    networkRequest.connectionId = String(response.connectionId);
    if (response.remoteIPAddress)
      networkRequest.setRemoteAddress(response.remoteIPAddress, response.remotePort || -1);

    if (response.fromServiceWorker)
      networkRequest.fetchedViaServiceWorker = true;

    if (response.fromDiskCache)
      networkRequest.setFromDiskCache();
    networkRequest.timing = response.timing;

    networkRequest.protocol = response.protocol;

    networkRequest.setSecurityState(response.securityState);

    if (!this._mimeTypeIsConsistentWithType(networkRequest)) {
      const message = Common.UIString(
          'Resource interpreted as %s but transferred with MIME type %s: "%s".', networkRequest.resourceType().title(),
          networkRequest.mimeType, networkRequest.url());
      this._manager.dispatchEventToListeners(
          SDK.NetworkManager.Events.MessageGenerated,
          {message: message, requestId: networkRequest.requestId(), warning: true});
    }

    if (response.securityDetails)
      networkRequest.setSecurityDetails(response.securityDetails);
  }

  /**
   * @param {!SDK.NetworkRequest} networkRequest
   * @return {boolean}
   */
  _mimeTypeIsConsistentWithType(networkRequest) {
    // If status is an error, content is likely to be of an inconsistent type,
    // as it's going to be an error message. We do not want to emit a warning
    // for this, though, as this will already be reported as resource loading failure.
    // Also, if a URL like http://localhost/wiki/load.php?debug=true&lang=en produces text/css and gets reloaded,
    // it is 304 Not Modified and its guessed mime-type is text/php, which is wrong.
    // Don't check for mime-types in 304-resources.
    if (networkRequest.hasErrorStatusCode() || networkRequest.statusCode === 304 || networkRequest.statusCode === 204)
      return true;

    const resourceType = networkRequest.resourceType();
    if (resourceType !== Common.resourceTypes.Stylesheet && resourceType !== Common.resourceTypes.Document &&
        resourceType !== Common.resourceTypes.TextTrack)
      return true;


    if (!networkRequest.mimeType)
      return true;  // Might be not known for cached resources with null responses.

    if (networkRequest.mimeType in SDK.NetworkManager._MIMETypes)
      return resourceType.name() in SDK.NetworkManager._MIMETypes[networkRequest.mimeType];

    return false;
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.ResourcePriority} newPriority
   * @param {!Protocol.Network.MonotonicTime} timestamp
   */
  resourceChangedPriority(requestId, newPriority, timestamp) {
    const networkRequest = this._inflightRequestsById[requestId];
    if (networkRequest)
      networkRequest.setPriority(newPriority);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.SignedExchangeInfo} info
   */
  signedExchangeReceived(requestId, info) {
    // While loading a signed exchange, a signedExchangeReceived event is sent
    // between two requestWillBeSent events.
    // 1. The first requestWillBeSent is sent while starting the navigation (or
    //    prefetching).
    // 2. This signedExchangeReceived event is sent when the browser detects the
    //    signed exchange.
    // 3. The second requestWillBeSent is sent with the generated redirect
    //    response and a new redirected request which URL is the inner request
    //    URL of the signed exchange.
    let networkRequest = this._inflightRequestsById[requestId];
    // |requestId| is available only for navigation requests. If the request was
    // sent from a renderer process for prefetching, it is not available. In the
    // case, need to fallback to look for the URL.
    // TODO(crbug/841076): Sends the request ID of prefetching to the browser
    // process and DevTools to find the matching request.
    if (!networkRequest) {
      networkRequest = this._inflightRequestsByURL[info.outerResponse.url];
      if (!networkRequest)
        return;
    }
    networkRequest.setSignedExchangeInfo(info);
    networkRequest.setResourceType(Common.resourceTypes.SignedExchange);

    this._updateNetworkRequestWithResponse(networkRequest, info.outerResponse);
    this._updateNetworkRequest(networkRequest);
    this._manager.dispatchEventToListeners(SDK.NetworkManager.Events.ResponseReceived, networkRequest);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.LoaderId} loaderId
   * @param {string} documentURL
   * @param {!Protocol.Network.Request} request
   * @param {!Protocol.Network.MonotonicTime} time
   * @param {!Protocol.Network.TimeSinceEpoch} wallTime
   * @param {!Protocol.Network.Initiator} initiator
   * @param {!Protocol.Network.Response=} redirectResponse
   * @param {!Protocol.Network.ResourceType=} resourceType
   * @param {!Protocol.Page.FrameId=} frameId
   */
  requestWillBeSent(
      requestId, loaderId, documentURL, request, time, wallTime, initiator, redirectResponse, resourceType, frameId) {
    let networkRequest = this._inflightRequestsById[requestId];
    if (networkRequest) {
      // FIXME: move this check to the backend.
      if (!redirectResponse)
        return;
      // If signedExchangeReceived event has already been sent for the request,
      // ignores the internally generated |redirectResponse|. The
      // |outerResponse| of SignedExchangeInfo was set to |networkRequest| in
      // signedExchangeReceived().
      if (!networkRequest.signedExchangeInfo()) {
        this.responseReceived(
            requestId, loaderId, time, Protocol.Network.ResourceType.Other, redirectResponse, frameId);
      }
      networkRequest = this._appendRedirect(requestId, time, request.url);
      this._manager.dispatchEventToListeners(SDK.NetworkManager.Events.RequestRedirected, networkRequest);
    } else {
      networkRequest =
          this._createNetworkRequest(requestId, frameId || '', loaderId, request.url, documentURL, initiator);
    }
    networkRequest.hasNetworkData = true;
    this._updateNetworkRequestWithRequest(networkRequest, request);
    networkRequest.setIssueTime(time, wallTime);
    networkRequest.setResourceType(
        resourceType ? Common.resourceTypes[resourceType] : Protocol.Network.ResourceType.Other);

    this._startNetworkRequest(networkRequest);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   */
  requestServedFromCache(requestId) {
    const networkRequest = this._inflightRequestsById[requestId];
    if (!networkRequest)
      return;

    networkRequest.setFromMemoryCache();
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.LoaderId} loaderId
   * @param {!Protocol.Network.MonotonicTime} time
   * @param {!Protocol.Network.ResourceType} resourceType
   * @param {!Protocol.Network.Response} response
   * @param {!Protocol.Page.FrameId=} frameId
   */
  responseReceived(requestId, loaderId, time, resourceType, response, frameId) {
    const networkRequest = this._inflightRequestsById[requestId];
    const lowercaseHeaders = SDK.NetworkManager.lowercaseHeaders(response.headers);
    if (!networkRequest) {
      // We missed the requestWillBeSent.
      const eventData = {};
      eventData.url = response.url;
      eventData.frameId = frameId || '';
      eventData.loaderId = loaderId;
      eventData.resourceType = resourceType;
      eventData.mimeType = response.mimeType;
      const lastModifiedHeader = lowercaseHeaders['last-modified'];
      eventData.lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : null;
      this._manager.dispatchEventToListeners(SDK.NetworkManager.Events.RequestUpdateDropped, eventData);
      return;
    }

    networkRequest.responseReceivedTime = time;
    networkRequest.setResourceType(Common.resourceTypes[resourceType]);

    // net::ParsedCookie::kMaxCookieSize = 4096 (net/cookies/parsed_cookie.h)
    if ('set-cookie' in lowercaseHeaders && lowercaseHeaders['set-cookie'].length > 4096) {
      const message = Common.UIString(
          'Set-Cookie header is ignored in response from url: %s. Cookie length should be less than or equal to 4096 characters.',
          response.url);
      this._manager.dispatchEventToListeners(
          SDK.NetworkManager.Events.MessageGenerated, {message: message, requestId: requestId, warning: true});
    }

    if ('public-key-pins' in lowercaseHeaders || 'public-key-pins-report-only' in lowercaseHeaders) {
      if (!this._hpkpDomains)
        this._hpkpDomains = new Set();
      const parsed = new Common.ParsedURL(response.url);
      if (parsed.isValid && !this._hpkpDomains.has(parsed.host)) {
        this._hpkpDomains.add(parsed.host);
        const message = Common.UIString(
            'HTTP-Based Public Key Pinning is deprecated. Chrome 69 and later will ignore HPKP response headers. (Host: %s)',
            parsed.host);
        this._manager.dispatchEventToListeners(
            SDK.NetworkManager.Events.MessageGenerated, {message: message, requestId: requestId, warning: true});
      }
    }

    this._updateNetworkRequestWithResponse(networkRequest, response);

    this._updateNetworkRequest(networkRequest);
    this._manager.dispatchEventToListeners(SDK.NetworkManager.Events.ResponseReceived, networkRequest);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.MonotonicTime} time
   * @param {number} dataLength
   * @param {number} encodedDataLength
   */
  dataReceived(requestId, time, dataLength, encodedDataLength) {
    let networkRequest = this._inflightRequestsById[requestId];
    if (!networkRequest)
      networkRequest = this._maybeAdoptMainResourceRequest(requestId);
    if (!networkRequest)
      return;

    networkRequest.resourceSize += dataLength;
    if (encodedDataLength !== -1)
      networkRequest.increaseTransferSize(encodedDataLength);
    networkRequest.endTime = time;

    this._updateNetworkRequest(networkRequest);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.MonotonicTime} finishTime
   * @param {number} encodedDataLength
   * @param {boolean=} shouldReportCorbBlocking
   */
  loadingFinished(requestId, finishTime, encodedDataLength, shouldReportCorbBlocking) {
    let networkRequest = this._inflightRequestsById[requestId];
    if (!networkRequest)
      networkRequest = this._maybeAdoptMainResourceRequest(requestId);
    if (!networkRequest)
      return;
    this._finishNetworkRequest(networkRequest, finishTime, encodedDataLength, shouldReportCorbBlocking);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.MonotonicTime} time
   * @param {!Protocol.Network.ResourceType} resourceType
   * @param {string} localizedDescription
   * @param {boolean=} canceled
   * @param {!Protocol.Network.BlockedReason=} blockedReason
   */
  loadingFailed(requestId, time, resourceType, localizedDescription, canceled, blockedReason) {
    const networkRequest = this._inflightRequestsById[requestId];
    if (!networkRequest)
      return;

    networkRequest.failed = true;
    networkRequest.setResourceType(Common.resourceTypes[resourceType]);
    networkRequest.canceled = !!canceled;
    if (blockedReason) {
      networkRequest.setBlockedReason(blockedReason);
      if (blockedReason === Protocol.Network.BlockedReason.Inspector) {
        const message = Common.UIString('Request was blocked by DevTools: "%s".', networkRequest.url());
        this._manager.dispatchEventToListeners(
            SDK.NetworkManager.Events.MessageGenerated, {message: message, requestId: requestId, warning: true});
      }
    }
    networkRequest.localizedFailDescription = localizedDescription;
    this._finishNetworkRequest(networkRequest, time, -1);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {string} requestURL
   * @param {!Protocol.Network.Initiator=} initiator
   */
  webSocketCreated(requestId, requestURL, initiator) {
    const networkRequest = new SDK.NetworkRequest(requestId, requestURL, '', '', '', initiator || null);
    networkRequest[SDK.NetworkManager._networkManagerForRequestSymbol] = this._manager;
    networkRequest.setResourceType(Common.resourceTypes.WebSocket);
    this._startNetworkRequest(networkRequest);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.MonotonicTime} time
   * @param {!Protocol.Network.TimeSinceEpoch} wallTime
   * @param {!Protocol.Network.WebSocketRequest} request
   */
  webSocketWillSendHandshakeRequest(requestId, time, wallTime, request) {
    const networkRequest = this._inflightRequestsById[requestId];
    if (!networkRequest)
      return;

    networkRequest.requestMethod = 'GET';
    networkRequest.setRequestHeaders(this._headersMapToHeadersArray(request.headers));
    networkRequest.setIssueTime(time, wallTime);

    this._updateNetworkRequest(networkRequest);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.MonotonicTime} time
   * @param {!Protocol.Network.WebSocketResponse} response
   */
  webSocketHandshakeResponseReceived(requestId, time, response) {
    const networkRequest = this._inflightRequestsById[requestId];
    if (!networkRequest)
      return;

    networkRequest.statusCode = response.status;
    networkRequest.statusText = response.statusText;
    networkRequest.responseHeaders = this._headersMapToHeadersArray(response.headers);
    networkRequest.responseHeadersText = response.headersText || '';
    if (response.requestHeaders)
      networkRequest.setRequestHeaders(this._headersMapToHeadersArray(response.requestHeaders));
    if (response.requestHeadersText)
      networkRequest.setRequestHeadersText(response.requestHeadersText);
    networkRequest.responseReceivedTime = time;
    networkRequest.protocol = 'websocket';

    this._updateNetworkRequest(networkRequest);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.MonotonicTime} time
   * @param {!Protocol.Network.WebSocketFrame} response
   */
  webSocketFrameReceived(requestId, time, response) {
    const networkRequest = this._inflightRequestsById[requestId];
    if (!networkRequest)
      return;

    networkRequest.addFrame(response, time, false);
    networkRequest.responseReceivedTime = time;

    this._updateNetworkRequest(networkRequest);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.MonotonicTime} time
   * @param {!Protocol.Network.WebSocketFrame} response
   */
  webSocketFrameSent(requestId, time, response) {
    const networkRequest = this._inflightRequestsById[requestId];
    if (!networkRequest)
      return;

    networkRequest.addFrame(response, time, true);
    networkRequest.responseReceivedTime = time;

    this._updateNetworkRequest(networkRequest);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.MonotonicTime} time
   * @param {string} errorMessage
   */
  webSocketFrameError(requestId, time, errorMessage) {
    const networkRequest = this._inflightRequestsById[requestId];
    if (!networkRequest)
      return;

    networkRequest.addFrameError(errorMessage, time);
    networkRequest.responseReceivedTime = time;

    this._updateNetworkRequest(networkRequest);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.MonotonicTime} time
   */
  webSocketClosed(requestId, time) {
    const networkRequest = this._inflightRequestsById[requestId];
    if (!networkRequest)
      return;
    this._finishNetworkRequest(networkRequest, time, -1);
  }

  /**
   * @override
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.MonotonicTime} time
   * @param {string} eventName
   * @param {string} eventId
   * @param {string} data
   */
  eventSourceMessageReceived(requestId, time, eventName, eventId, data) {
    const networkRequest = this._inflightRequestsById[requestId];
    if (!networkRequest)
      return;
    networkRequest.addEventSourceMessage(time, eventName, eventId, data);
  }

  /**
   * @override
   * @param {!Protocol.Network.InterceptionId} interceptionId
   * @param {!Protocol.Network.Request} request
   * @param {!Protocol.Page.FrameId} frameId
   * @param {!Protocol.Network.ResourceType} resourceType
   * @param {boolean} isNavigationRequest
   * @param {boolean=} isDownload
   * @param {string=} redirectUrl
   * @param {!Protocol.Network.AuthChallenge=} authChallenge
   * @param {!Protocol.Network.ErrorReason=} responseErrorReason
   * @param {number=} responseStatusCode
   * @param {!Protocol.Network.Headers=} responseHeaders
   */
  requestIntercepted(
      interceptionId, request, frameId, resourceType, isNavigationRequest, isDownload, redirectUrl, authChallenge,
      responseErrorReason, responseStatusCode, responseHeaders) {
    SDK.multitargetNetworkManager._requestIntercepted(new SDK.MultitargetNetworkManager.InterceptedRequest(
        this._manager.target().networkAgent(), interceptionId, request, frameId, resourceType, isNavigationRequest,
        isDownload, redirectUrl, authChallenge, responseErrorReason, responseStatusCode, responseHeaders));
  }

  /**
   * @param {!Protocol.Network.RequestId} requestId
   * @param {!Protocol.Network.MonotonicTime} time
   * @param {string} redirectURL
   * @return {!SDK.NetworkRequest}
   */
  _appendRedirect(requestId, time, redirectURL) {
    const originalNetworkRequest = this._inflightRequestsById[requestId];
    let redirectCount = 0;
    for (let redirect = originalNetworkRequest.redirectSource(); redirect; redirect = redirect.redirectSource())
      redirectCount++;

    originalNetworkRequest.markAsRedirect(redirectCount);
    this._finishNetworkRequest(originalNetworkRequest, time, -1);
    const newNetworkRequest = this._createNetworkRequest(
        requestId, originalNetworkRequest.frameId, originalNetworkRequest.loaderId, redirectURL,
        originalNetworkRequest.documentURL, originalNetworkRequest.initiator());
    newNetworkRequest.setRedirectSource(originalNetworkRequest);
    originalNetworkRequest.setRedirectDestination(newNetworkRequest);
    return newNetworkRequest;
  }

  /**
   * @param {string} requestId
   * @return {?SDK.NetworkRequest}
   */
  _maybeAdoptMainResourceRequest(requestId) {
    const request = SDK.multitargetNetworkManager._inflightMainResourceRequests.get(requestId);
    if (!request)
      return null;
    const oldDispatcher = SDK.NetworkManager.forRequest(request)._dispatcher;
    delete oldDispatcher._inflightRequestsById[requestId];
    delete oldDispatcher._inflightRequestsByURL[request.url()];
    this._inflightRequestsById[requestId] = request;
    this._inflightRequestsByURL[request.url()] = request;
    request[SDK.NetworkManager._networkManagerForRequestSymbol] = this._manager;
    return request;
  }

  /**
   * @param {!SDK.NetworkRequest} networkRequest
   */
  _startNetworkRequest(networkRequest) {
    this._inflightRequestsById[networkRequest.requestId()] = networkRequest;
    this._inflightRequestsByURL[networkRequest.url()] = networkRequest;
    // The following relies on the fact that loaderIds and requestIds are
    // globally unique and that the main request has them equal.
    if (networkRequest.loaderId === networkRequest.requestId()) {
      SDK.multitargetNetworkManager._inflightMainResourceRequests.set(networkRequest.requestId(), networkRequest);
      delete this._hpkpDomains;
    }

    this._manager.dispatchEventToListeners(SDK.NetworkManager.Events.RequestStarted, networkRequest);
  }

  /**
   * @param {!SDK.NetworkRequest} networkRequest
   */
  _updateNetworkRequest(networkRequest) {
    this._manager.dispatchEventToListeners(SDK.NetworkManager.Events.RequestUpdated, networkRequest);
  }

  /**
   * @param {!SDK.NetworkRequest} networkRequest
   * @param {!Protocol.Network.MonotonicTime} finishTime
   * @param {number} encodedDataLength
   * @param {boolean=} shouldReportCorbBlocking
   */
  _finishNetworkRequest(networkRequest, finishTime, encodedDataLength, shouldReportCorbBlocking) {
    networkRequest.endTime = finishTime;
    networkRequest.finished = true;
    if (encodedDataLength >= 0)
      networkRequest.setTransferSize(encodedDataLength);
    this._manager.dispatchEventToListeners(SDK.NetworkManager.Events.RequestFinished, networkRequest);
    delete this._inflightRequestsById[networkRequest.requestId()];
    delete this._inflightRequestsByURL[networkRequest.url()];
    SDK.multitargetNetworkManager._inflightMainResourceRequests.delete(networkRequest.requestId());

    if (shouldReportCorbBlocking) {
      const message = Common.UIString(
          `Cross-Origin Read Blocking (CORB) blocked cross-origin response %s with MIME type %s. ` +
              `See https://www.chromestatus.com/feature/5629709824032768 for more details.`,
          networkRequest.url(), networkRequest.mimeType);
      this._manager.dispatchEventToListeners(
          SDK.NetworkManager.Events.MessageGenerated,
          {message: message, requestId: networkRequest.requestId(), warning: true});
    }

    if (Common.moduleSetting('monitoringXHREnabled').get() &&
        networkRequest.resourceType().category() === Common.resourceCategories.XHR) {
      const message = Common.UIString(
          (networkRequest.failed || networkRequest.hasErrorStatusCode()) ? '%s failed loading: %s "%s".' :
                                                                           '%s finished loading: %s "%s".',
          networkRequest.resourceType().title(), networkRequest.requestMethod, networkRequest.url());
      this._manager.dispatchEventToListeners(
          SDK.NetworkManager.Events.MessageGenerated,
          {message: message, requestId: networkRequest.requestId(), warning: false});
    }
  }

  /**
   * @param {!Protocol.Network.RequestId} requestId
   * @param {string} frameId
   * @param {!Protocol.Network.LoaderId} loaderId
   * @param {string} url
   * @param {string} documentURL
   * @param {?Protocol.Network.Initiator} initiator
   */
  _createNetworkRequest(requestId, frameId, loaderId, url, documentURL, initiator) {
    const request = new SDK.NetworkRequest(requestId, url, documentURL, frameId, loaderId, initiator);
    request[SDK.NetworkManager._networkManagerForRequestSymbol] = this._manager;
    return request;
  }
};

/**
 * @implements {SDK.SDKModelObserver<!SDK.NetworkManager>}
 * @unrestricted
 */
SDK.MultitargetNetworkManager = class extends Common.Object {
  constructor() {
    super();
    this._userAgentOverride = '';
    /** @type {!Set<!Protocol.NetworkAgent>} */
    this._agents = new Set();
    /** @type {!Map<string, !SDK.NetworkRequest>} */
    this._inflightMainResourceRequests = new Map();
    /** @type {!SDK.NetworkManager.Conditions} */
    this._networkConditions = SDK.NetworkManager.NoThrottlingConditions;
    /** @type {?Promise} */
    this._updatingInterceptionPatternsPromise = null;

    // TODO(allada) Remove these and merge it with request interception.
    this._blockingEnabledSetting = Common.moduleSetting('requestBlockingEnabled');
    this._blockedPatternsSetting = Common.settings.createSetting('networkBlockedPatterns', []);
    this._effectiveBlockedURLs = [];
    this._updateBlockedPatterns();

    /** @type {!Multimap<!SDK.MultitargetNetworkManager.RequestInterceptor, !SDK.MultitargetNetworkManager.InterceptionPattern>} */
    this._urlsForRequestInterceptor = new Multimap();

    SDK.targetManager.observeModels(SDK.NetworkManager, this);
  }

  /**
   * @param {string} uaString
   * @return {string}
   */
  static patchUserAgentWithChromeVersion(uaString) {
    // Patches Chrome/CriOS version from user agent ("1.2.3.4" when user agent is: "Chrome/1.2.3.4").
    const chromeRegex = new RegExp('(?:^|\\W)Chrome/(\\S+)');
    const chromeMatch = navigator.userAgent.match(chromeRegex);
    if (chromeMatch && chromeMatch.length > 1)
      return String.sprintf(uaString, chromeMatch[1]);
    return uaString;
  }

  /**
   * @override
   * @param {!SDK.NetworkManager} networkManager
   */
  modelAdded(networkManager) {
    const networkAgent = networkManager.target().networkAgent();
    if (this._extraHeaders)
      networkAgent.setExtraHTTPHeaders(this._extraHeaders);
    if (this._currentUserAgent())
      networkAgent.setUserAgentOverride(this._currentUserAgent());
    if (this._effectiveBlockedURLs.length)
      networkAgent.setBlockedURLs(this._effectiveBlockedURLs);
    if (this.isIntercepting())
      networkAgent.setRequestInterception(this._urlsForRequestInterceptor.valuesArray());
    this._agents.add(networkAgent);
    if (this.isThrottling())
      this._updateNetworkConditions(networkAgent);
  }

  /**
   * @override
   * @param {!SDK.NetworkManager} networkManager
   */
  modelRemoved(networkManager) {
    for (const entry of this._inflightMainResourceRequests) {
      const manager = SDK.NetworkManager.forRequest(/** @type {!SDK.NetworkRequest} */ (entry[1]));
      if (manager !== networkManager)
        continue;
      this._inflightMainResourceRequests.delete(/** @type {string} */ (entry[0]));
    }
    this._agents.delete(networkManager.target().networkAgent());
  }

  /**
   * @return {boolean}
   */
  isThrottling() {
    return this._networkConditions.download >= 0 || this._networkConditions.upload >= 0 ||
        this._networkConditions.latency > 0;
  }

  /**
   * @return {boolean}
   */
  isOffline() {
    return !this._networkConditions.download && !this._networkConditions.upload;
  }

  /**
   * @param {!SDK.NetworkManager.Conditions} conditions
   */
  setNetworkConditions(conditions) {
    this._networkConditions = conditions;
    for (const agent of this._agents)
      this._updateNetworkConditions(agent);
    this.dispatchEventToListeners(SDK.MultitargetNetworkManager.Events.ConditionsChanged);
  }

  /**
   * @return {!SDK.NetworkManager.Conditions}
   */
  networkConditions() {
    return this._networkConditions;
  }

  /**
   * @param {!Protocol.NetworkAgent} networkAgent
   */
  _updateNetworkConditions(networkAgent) {
    const conditions = this._networkConditions;
    if (!this.isThrottling()) {
      networkAgent.emulateNetworkConditions(false, 0, 0, 0);
    } else {
      networkAgent.emulateNetworkConditions(
          this.isOffline(), conditions.latency, conditions.download < 0 ? 0 : conditions.download,
          conditions.upload < 0 ? 0 : conditions.upload, SDK.NetworkManager._connectionType(conditions));
    }
  }

  /**
   * @param {!Protocol.Network.Headers} headers
   */
  setExtraHTTPHeaders(headers) {
    this._extraHeaders = headers;
    for (const agent of this._agents)
      agent.setExtraHTTPHeaders(this._extraHeaders);
  }

  /**
   * @return {string}
   */
  _currentUserAgent() {
    return this._customUserAgent ? this._customUserAgent : this._userAgentOverride;
  }

  _updateUserAgentOverride() {
    const userAgent = this._currentUserAgent();
    for (const agent of this._agents)
      agent.setUserAgentOverride(userAgent);
  }

  /**
   * @param {string} userAgent
   */
  setUserAgentOverride(userAgent) {
    if (this._userAgentOverride === userAgent)
      return;
    this._userAgentOverride = userAgent;
    if (!this._customUserAgent)
      this._updateUserAgentOverride();
    this.dispatchEventToListeners(SDK.MultitargetNetworkManager.Events.UserAgentChanged);
  }

  /**
   * @return {string}
   */
  userAgentOverride() {
    return this._userAgentOverride;
  }

  /**
   * @param {string} userAgent
   */
  setCustomUserAgentOverride(userAgent) {
    this._customUserAgent = userAgent;
    this._updateUserAgentOverride();
  }

  // TODO(allada) Move all request blocking into interception and let view manage blocking.
  /**
   * @return {!Array<!SDK.NetworkManager.BlockedPattern>}
   */
  blockedPatterns() {
    return this._blockedPatternsSetting.get().slice();
  }

  /**
   * @return {boolean}
   */
  blockingEnabled() {
    return this._blockingEnabledSetting.get();
  }

  /**
   * @return {boolean}
   */
  isBlocking() {
    return !!this._effectiveBlockedURLs.length;
  }

  /**
   * @param {!Array<!SDK.NetworkManager.BlockedPattern>} patterns
   */
  setBlockedPatterns(patterns) {
    this._blockedPatternsSetting.set(patterns);
    this._updateBlockedPatterns();
    this.dispatchEventToListeners(SDK.MultitargetNetworkManager.Events.BlockedPatternsChanged);
  }

  /**
   * @param {boolean} enabled
   */
  setBlockingEnabled(enabled) {
    if (this._blockingEnabledSetting.get() === enabled)
      return;
    this._blockingEnabledSetting.set(enabled);
    this._updateBlockedPatterns();
    this.dispatchEventToListeners(SDK.MultitargetNetworkManager.Events.BlockedPatternsChanged);
  }

  _updateBlockedPatterns() {
    const urls = [];
    if (this._blockingEnabledSetting.get()) {
      for (const pattern of this._blockedPatternsSetting.get()) {
        if (pattern.enabled)
          urls.push(pattern.url);
      }
    }

    if (!urls.length && !this._effectiveBlockedURLs.length)
      return;
    this._effectiveBlockedURLs = urls;
    for (const agent of this._agents)
      agent.setBlockedURLs(this._effectiveBlockedURLs);
  }

  /**
   * @return {boolean}
   */
  isIntercepting() {
    return !!this._urlsForRequestInterceptor.size;
  }

  /**
   * @param {!Array<!SDK.MultitargetNetworkManager.InterceptionPattern>} patterns
   * @param {!SDK.MultitargetNetworkManager.RequestInterceptor} requestInterceptor
   * @return {!Promise}
   */
  setInterceptionHandlerForPatterns(patterns, requestInterceptor) {
    // Note: requestInterceptors may recieve interception requests for patterns they did not subscribe to.
    this._urlsForRequestInterceptor.deleteAll(requestInterceptor);
    for (const newPattern of patterns)
      this._urlsForRequestInterceptor.set(requestInterceptor, newPattern);
    return this._updateInterceptionPatternsOnNextTick();
  }

  /**
   * @return {!Promise}
   */
  _updateInterceptionPatternsOnNextTick() {
    // This is used so we can register and unregister patterns in loops without sending lots of protocol messages.
    if (!this._updatingInterceptionPatternsPromise)
      this._updatingInterceptionPatternsPromise = Promise.resolve().then(this._updateInterceptionPatterns.bind(this));
    return this._updatingInterceptionPatternsPromise;
  }

  /**
   * @return {!Promise}
   */
  _updateInterceptionPatterns() {
    if (!Common.moduleSetting('cacheDisabled').get())
      Common.moduleSetting('cacheDisabled').set(true);
    this._updatingInterceptionPatternsPromise = null;
    const promises = /** @type {!Array<!Promise>} */ ([]);
    for (const agent of this._agents)
      promises.push(agent.setRequestInterception(this._urlsForRequestInterceptor.valuesArray()));
    this.dispatchEventToListeners(SDK.MultitargetNetworkManager.Events.InterceptorsChanged);
    return Promise.all(promises);
  }

  /**
   * @param {!SDK.MultitargetNetworkManager.InterceptedRequest} interceptedRequest
   */
  async _requestIntercepted(interceptedRequest) {
    for (const requestInterceptor of this._urlsForRequestInterceptor.keysArray()) {
      await requestInterceptor(interceptedRequest);
      if (interceptedRequest.hasResponded())
        return;
    }
    if (!interceptedRequest.hasResponded())
      interceptedRequest.continueRequestWithoutChange();
  }

  clearBrowserCache() {
    for (const agent of this._agents)
      agent.clearBrowserCache();
  }

  clearBrowserCookies() {
    for (const agent of this._agents)
      agent.clearBrowserCookies();
  }

  /**
   * @param {string} origin
   * @return {!Promise<!Array<string>>}
   */
  getCertificate(origin) {
    const target = SDK.targetManager.mainTarget();
    return target.networkAgent().getCertificate(origin).then(certificate => certificate || []);
  }

  /**
   * @param {string} url
   * @param {function(number, !Object.<string, string>, string)} callback
   */
  loadResource(url, callback) {
    const headers = {};

    const currentUserAgent = this._currentUserAgent();
    if (currentUserAgent)
      headers['User-Agent'] = currentUserAgent;

    if (Common.moduleSetting('cacheDisabled').get())
      headers['Cache-Control'] = 'no-cache';

    Host.ResourceLoader.load(url, headers, callback);
  }
};

/** @enum {symbol} */
SDK.MultitargetNetworkManager.Events = {
  BlockedPatternsChanged: Symbol('BlockedPatternsChanged'),
  ConditionsChanged: Symbol('ConditionsChanged'),
  UserAgentChanged: Symbol('UserAgentChanged'),
  InterceptorsChanged: Symbol('InterceptorsChanged')
};

SDK.MultitargetNetworkManager.InterceptedRequest = class {
  /**
   * @param {!Protocol.NetworkAgent} networkAgent
   * @param {!Protocol.Network.InterceptionId} interceptionId
   * @param {!Protocol.Network.Request} request
   * @param {!Protocol.Page.FrameId} frameId
   * @param {!Protocol.Network.ResourceType} resourceType
   * @param {boolean} isNavigationRequest
   * @param {boolean=} isDownload
   * @param {string=} redirectUrl
   * @param {!Protocol.Network.AuthChallenge=} authChallenge
   * @param {!Protocol.Network.ErrorReason=} responseErrorReason
   * @param {number=} responseStatusCode
   * @param {!Protocol.Network.Headers=} responseHeaders
   */
  constructor(
      networkAgent, interceptionId, request, frameId, resourceType, isNavigationRequest, isDownload, redirectUrl,
      authChallenge, responseErrorReason, responseStatusCode, responseHeaders) {
    this._networkAgent = networkAgent;
    this._interceptionId = interceptionId;
    this._hasResponded = false;
    this.request = request;
    this.frameId = frameId;
    this.resourceType = resourceType;
    this.isNavigationRequest = isNavigationRequest;
    this.isDownload = !!isDownload;
    this.redirectUrl = redirectUrl;
    this.authChallenge = authChallenge;
    this.responseErrorReason = responseErrorReason;
    this.responseStatusCode = responseStatusCode;
    this.responseHeaders = responseHeaders;
  }

  /**
   * @return {boolean}
   */
  hasResponded() {
    return this._hasResponded;
  }

  /**
   * @param {!Blob} contentBlob
   */
  async continueRequestWithContent(contentBlob) {
    this._hasResponded = true;
    const headers = [
      'HTTP/1.1 200 OK',
      'Date: ' + (new Date()).toUTCString(),
      'Server: Chrome Devtools Request Interceptor',
      'Connection: closed',
      'Content-Length: ' + contentBlob.size,
      'Content-Type: ' + contentBlob.type || 'text/x-unknown',
    ];
    const encodedResponse = await blobToBase64(new Blob([headers.join('\r\n'), '\r\n\r\n', contentBlob]));
    this._networkAgent.continueInterceptedRequest(this._interceptionId, undefined, encodedResponse);

    /**
     * @param {!Blob} blob
     * @return {!Promise<string>}
     */
    async function blobToBase64(blob) {
      const reader = new FileReader();
      const fileContentsLoadedPromise = new Promise(resolve => reader.onloadend = resolve);
      reader.readAsDataURL(blob);
      await fileContentsLoadedPromise;
      if (reader.error) {
        console.error('Could not convert blob to base64.', reader.error);
        return '';
      }
      const result = reader.result;
      if (result === undefined) {
        console.error('Could not convert blob to base64.');
        return '';
      }
      return result.substring(result.indexOf(',') + 1);
    }
  }

  continueRequestWithoutChange() {
    console.assert(!this._hasResponded);
    this._hasResponded = true;
    this._networkAgent.continueInterceptedRequest(this._interceptionId);
  }

  /**
   * @param {!Protocol.Network.ErrorReason} errorReason
   */
  continueRequestWithError(errorReason) {
    console.assert(!this._hasResponded);
    this._hasResponded = true;
    this._networkAgent.continueInterceptedRequest(this._interceptionId, errorReason);
  }

  /**
   * @return {!Promise<!SDK.NetworkRequest.ContentData>}
   */
  async responseBody() {
    const response =
        await this._networkAgent.invoke_getResponseBodyForInterception({interceptionId: this._interceptionId});
    const error = response[Protocol.Error] || null;
    return {error: error, content: error ? null : response.body, encoded: response.base64Encoded};
  }
};

/** @typedef {!{urlPattern: string, interceptionStage: !Protocol.Network.InterceptionStage}} */
SDK.MultitargetNetworkManager.InterceptionPattern;

/** @typedef {!function(!SDK.MultitargetNetworkManager.InterceptedRequest):!Promise} */
SDK.MultitargetNetworkManager.RequestInterceptor;

/**
 * @type {!SDK.MultitargetNetworkManager}
 */
SDK.multitargetNetworkManager;
