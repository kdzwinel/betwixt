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
Extensions.ExtensionServer = class extends Common.Object {
  /**
   * @suppressGlobalPropertiesCheck
   */
  constructor() {
    super();
    this._clientObjects = {};
    this._handlers = {};
    this._subscribers = {};
    this._subscriptionStartHandlers = {};
    this._subscriptionStopHandlers = {};
    this._extraHeaders = {};
    this._requests = {};
    this._lastRequestId = 0;
    this._registeredExtensions = {};
    this._status = new Extensions.ExtensionStatus();
    /** @type {!Array<!Extensions.ExtensionSidebarPane>} */
    this._sidebarPanes = [];
    /** @type {!Array<!Extensions.ExtensionTraceProvider>} */
    this._traceProviders = [];
    /** @type {!Map<string, !Extensions.TracingSession>} */
    this._traceSessions = new Map();

    const commands = Extensions.extensionAPI.Commands;

    this._registerHandler(commands.AddRequestHeaders, this._onAddRequestHeaders.bind(this));
    this._registerHandler(commands.AddTraceProvider, this._onAddTraceProvider.bind(this));
    this._registerHandler(commands.ApplyStyleSheet, this._onApplyStyleSheet.bind(this));
    this._registerHandler(commands.CompleteTraceSession, this._onCompleteTraceSession.bind(this));
    this._registerHandler(commands.CreatePanel, this._onCreatePanel.bind(this));
    this._registerHandler(commands.CreateSidebarPane, this._onCreateSidebarPane.bind(this));
    this._registerHandler(commands.CreateToolbarButton, this._onCreateToolbarButton.bind(this));
    this._registerHandler(commands.EvaluateOnInspectedPage, this._onEvaluateOnInspectedPage.bind(this));
    this._registerHandler(commands.ForwardKeyboardEvent, this._onForwardKeyboardEvent.bind(this));
    this._registerHandler(commands.GetHAR, this._onGetHAR.bind(this));
    this._registerHandler(commands.GetPageResources, this._onGetPageResources.bind(this));
    this._registerHandler(commands.GetRequestContent, this._onGetRequestContent.bind(this));
    this._registerHandler(commands.GetResourceContent, this._onGetResourceContent.bind(this));
    this._registerHandler(commands.Reload, this._onReload.bind(this));
    this._registerHandler(commands.SetOpenResourceHandler, this._onSetOpenResourceHandler.bind(this));
    this._registerHandler(commands.SetResourceContent, this._onSetResourceContent.bind(this));
    this._registerHandler(commands.SetSidebarHeight, this._onSetSidebarHeight.bind(this));
    this._registerHandler(commands.SetSidebarContent, this._onSetSidebarContent.bind(this));
    this._registerHandler(commands.SetSidebarPage, this._onSetSidebarPage.bind(this));
    this._registerHandler(commands.ShowPanel, this._onShowPanel.bind(this));
    this._registerHandler(commands.Subscribe, this._onSubscribe.bind(this));
    this._registerHandler(commands.OpenResource, this._onOpenResource.bind(this));
    this._registerHandler(commands.Unsubscribe, this._onUnsubscribe.bind(this));
    this._registerHandler(commands.UpdateButton, this._onUpdateButton.bind(this));
    window.addEventListener('message', this._onWindowMessage.bind(this), false);  // Only for main window.

    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.AddExtensions, this._addExtensions, this);
    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.SetInspectedTabId, this._setInspectedTabId, this);

    this._initExtensions();
  }

  initializeExtensions() {
    this._initializeCommandIssued = true;
    if (this._pendingExtensionInfos) {
      this._pendingExtensionInfos.forEach(this._addExtension, this);
      delete this._pendingExtensionInfos;
    }
  }

  /**
   * @return {boolean}
   */
  hasExtensions() {
    return !!Object.keys(this._registeredExtensions).length;
  }

  /**
   * @param {string} panelId
   * @param {string} action
   * @param {string=} searchString
   */
  notifySearchAction(panelId, action, searchString) {
    this._postNotification(Extensions.extensionAPI.Events.PanelSearch + panelId, action, searchString);
  }

  /**
   * @param {string} identifier
   * @param {number=} frameIndex
   */
  notifyViewShown(identifier, frameIndex) {
    this._postNotification(Extensions.extensionAPI.Events.ViewShown + identifier, frameIndex);
  }

  /**
   * @param {string} identifier
   */
  notifyViewHidden(identifier) {
    this._postNotification(Extensions.extensionAPI.Events.ViewHidden + identifier);
  }

  /**
   * @param {string} identifier
   */
  notifyButtonClicked(identifier) {
    this._postNotification(Extensions.extensionAPI.Events.ButtonClicked + identifier);
  }

  _inspectedURLChanged(event) {
    if (event.data !== SDK.targetManager.mainTarget())
      return;
    this._requests = {};
    const url = event.data.inspectedURL();
    this._postNotification(Extensions.extensionAPI.Events.InspectedURLChanged, url);
  }

  /**
   * @param {string} providerId
   * @param {string} sessionId
   * @param {!Extensions.TracingSession} session
   */
  startTraceRecording(providerId, sessionId, session) {
    this._traceSessions.set(sessionId, session);
    this._postNotification('trace-recording-started-' + providerId, sessionId);
  }

  /**
   * @param {string} providerId
   */
  stopTraceRecording(providerId) {
    this._postNotification('trace-recording-stopped-' + providerId);
  }

  /**
   * @param {string} type
   * @return {boolean}
   */
  hasSubscribers(type) {
    return !!this._subscribers[type];
  }

  /**
   * @param {string} type
   * @param {...*} vararg
   */
  _postNotification(type, vararg) {
    const subscribers = this._subscribers[type];
    if (!subscribers)
      return;
    const message = {command: 'notify-' + type, arguments: Array.prototype.slice.call(arguments, 1)};
    for (let i = 0; i < subscribers.length; ++i)
      subscribers[i].postMessage(message);
  }

  _onSubscribe(message, port) {
    const subscribers = this._subscribers[message.type];
    if (subscribers) {
      subscribers.push(port);
    } else {
      this._subscribers[message.type] = [port];
      if (this._subscriptionStartHandlers[message.type])
        this._subscriptionStartHandlers[message.type]();
    }
  }

  _onUnsubscribe(message, port) {
    const subscribers = this._subscribers[message.type];
    if (!subscribers)
      return;
    subscribers.remove(port);
    if (!subscribers.length) {
      delete this._subscribers[message.type];
      if (this._subscriptionStopHandlers[message.type])
        this._subscriptionStopHandlers[message.type]();
    }
  }

  _onAddRequestHeaders(message) {
    const id = message.extensionId;
    if (typeof id !== 'string')
      return this._status.E_BADARGTYPE('extensionId', typeof id, 'string');
    let extensionHeaders = this._extraHeaders[id];
    if (!extensionHeaders) {
      extensionHeaders = {};
      this._extraHeaders[id] = extensionHeaders;
    }
    for (const name in message.headers)
      extensionHeaders[name] = message.headers[name];
    const allHeaders = /** @type {!Protocol.Network.Headers} */ ({});
    for (const extension in this._extraHeaders) {
      const headers = this._extraHeaders[extension];
      for (const name in headers) {
        if (typeof headers[name] === 'string')
          allHeaders[name] = headers[name];
      }
    }

    SDK.multitargetNetworkManager.setExtraHTTPHeaders(allHeaders);
  }

  /**
   * @param {*} message
   * @suppressGlobalPropertiesCheck
   */
  _onApplyStyleSheet(message) {
    if (!Runtime.experiments.isEnabled('applyCustomStylesheet'))
      return;
    const styleSheet = createElement('style');
    styleSheet.textContent = message.styleSheet;
    document.head.appendChild(styleSheet);

    UI.themeSupport.addCustomStylesheet(message.styleSheet);
    // Add to all the shadow roots that have already been created
    for (let node = document.body; node; node = node.traverseNextNode(document.body)) {
      if (node instanceof ShadowRoot)
        UI.themeSupport.injectCustomStyleSheets(node);
    }
  }

  _onCreatePanel(message, port) {
    const id = message.id;
    // The ids are generated on the client API side and must be unique, so the check below
    // shouldn't be hit unless someone is bypassing the API.
    if (id in this._clientObjects || UI.inspectorView.hasPanel(id))
      return this._status.E_EXISTS(id);

    const page = this._expandResourcePath(port._extensionOrigin, message.page);
    let persistentId = port._extensionOrigin + message.title;
    persistentId = persistentId.replace(/\s/g, '');
    const panelView = new Extensions.ExtensionServerPanelView(
        persistentId, message.title, new Extensions.ExtensionPanel(this, persistentId, id, page));
    this._clientObjects[id] = panelView;
    UI.inspectorView.addPanel(panelView);
    return this._status.OK();
  }

  _onShowPanel(message) {
    let panelViewId = message.id;
    const panelView = this._clientObjects[message.id];
    if (panelView && panelView instanceof Extensions.ExtensionServerPanelView)
      panelViewId = panelView.viewId();
    UI.inspectorView.showPanel(panelViewId);
  }

  _onCreateToolbarButton(message, port) {
    const panelView = this._clientObjects[message.panel];
    if (!panelView || !(panelView instanceof Extensions.ExtensionServerPanelView))
      return this._status.E_NOTFOUND(message.panel);
    const button = new Extensions.ExtensionButton(
        this, message.id, this._expandResourcePath(port._extensionOrigin, message.icon), message.tooltip,
        message.disabled);
    this._clientObjects[message.id] = button;

    panelView.widget().then(appendButton);

    /**
     * @param {!UI.Widget} panel
     */
    function appendButton(panel) {
      /** @type {!Extensions.ExtensionPanel} panel*/ (panel).addToolbarItem(button.toolbarButton());
    }

    return this._status.OK();
  }

  _onUpdateButton(message, port) {
    const button = this._clientObjects[message.id];
    if (!button || !(button instanceof Extensions.ExtensionButton))
      return this._status.E_NOTFOUND(message.id);
    button.update(this._expandResourcePath(port._extensionOrigin, message.icon), message.tooltip, message.disabled);
    return this._status.OK();
  }

  /**
   * @param {!Object} message
   */
  _onCompleteTraceSession(message) {
    const session = this._traceSessions.get(message.id);
    if (!session)
      return this._status.E_NOTFOUND(message.id);
    this._traceSessions.delete(message.id);
    session.complete(message.url, message.timeOffset);
  }

  _onCreateSidebarPane(message) {
    if (message.panel !== 'elements' && message.panel !== 'sources')
      return this._status.E_NOTFOUND(message.panel);
    const id = message.id;
    const sidebar = new Extensions.ExtensionSidebarPane(this, message.panel, message.title, id);
    this._sidebarPanes.push(sidebar);
    this._clientObjects[id] = sidebar;
    this.dispatchEventToListeners(Extensions.ExtensionServer.Events.SidebarPaneAdded, sidebar);

    return this._status.OK();
  }

  /**
   * @return {!Array.<!Extensions.ExtensionSidebarPane>}
   */
  sidebarPanes() {
    return this._sidebarPanes;
  }

  _onSetSidebarHeight(message) {
    const sidebar = this._clientObjects[message.id];
    if (!sidebar)
      return this._status.E_NOTFOUND(message.id);
    sidebar.setHeight(message.height);
    return this._status.OK();
  }

  _onSetSidebarContent(message, port) {
    const sidebar = this._clientObjects[message.id];
    if (!sidebar)
      return this._status.E_NOTFOUND(message.id);

    /**
     * @this {Extensions.ExtensionServer}
     */
    function callback(error) {
      const result = error ? this._status.E_FAILED(error) : this._status.OK();
      this._dispatchCallback(message.requestId, port, result);
    }
    if (message.evaluateOnPage) {
      return sidebar.setExpression(
          message.expression, message.rootTitle, message.evaluateOptions, port._extensionOrigin, callback.bind(this));
    }
    sidebar.setObject(message.expression, message.rootTitle, callback.bind(this));
  }

  _onSetSidebarPage(message, port) {
    const sidebar = this._clientObjects[message.id];
    if (!sidebar)
      return this._status.E_NOTFOUND(message.id);
    sidebar.setPage(this._expandResourcePath(port._extensionOrigin, message.page));
  }

  _onOpenResource(message) {
    const uiSourceCode = Workspace.workspace.uiSourceCodeForURL(message.url);
    if (uiSourceCode) {
      Common.Revealer.reveal(uiSourceCode.uiLocation(message.lineNumber, 0));
      return this._status.OK();
    }

    const resource = Bindings.resourceForURL(message.url);
    if (resource) {
      Common.Revealer.reveal(resource);
      return this._status.OK();
    }

    const request = SDK.networkLog.requestForURL(message.url);
    if (request) {
      Common.Revealer.reveal(request);
      return this._status.OK();
    }

    return this._status.E_NOTFOUND(message.url);
  }

  _onSetOpenResourceHandler(message, port) {
    const name = this._registeredExtensions[port._extensionOrigin].name || ('Extension ' + port._extensionOrigin);
    if (message.handlerPresent)
      Components.Linkifier.registerLinkHandler(name, this._handleOpenURL.bind(this, port));
    else
      Components.Linkifier.unregisterLinkHandler(name);
  }

  _handleOpenURL(port, contentProvider, lineNumber) {
    port.postMessage(
        {command: 'open-resource', resource: this._makeResource(contentProvider), lineNumber: lineNumber + 1});
  }

  _onReload(message) {
    const options = /** @type {!ExtensionReloadOptions} */ (message.options || {});

    SDK.multitargetNetworkManager.setUserAgentOverride(typeof options.userAgent === 'string' ? options.userAgent : '');
    let injectedScript;
    if (options.injectedScript)
      injectedScript = '(function(){' + options.injectedScript + '})()';
    SDK.ResourceTreeModel.reloadAllPages(!!options.ignoreCache, injectedScript);
    return this._status.OK();
  }

  _onEvaluateOnInspectedPage(message, port) {
    /**
     * @param {?Protocol.Error} error
     * @param {?SDK.RemoteObject} object
     * @param {boolean} wasThrown
     * @this {Extensions.ExtensionServer}
     */
    function callback(error, object, wasThrown) {
      let result;
      if (error || !object)
        result = this._status.E_PROTOCOLERROR(error.toString());
      else if (wasThrown)
        result = {isException: true, value: object.description};
      else
        result = {value: object.value};

      this._dispatchCallback(message.requestId, port, result);
    }
    return this.evaluate(
        message.expression, true, true, message.evaluateOptions, port._extensionOrigin, callback.bind(this));
  }

  async _onGetHAR() {
    const requests = SDK.networkLog.requests();
    const harLog = await SDK.HARLog.build(requests);
    for (let i = 0; i < harLog.entries.length; ++i)
      harLog.entries[i]._requestId = this._requestId(requests[i]);
    return harLog;
  }

  /**
   * @param {!Common.ContentProvider} contentProvider
   */
  _makeResource(contentProvider) {
    return {url: contentProvider.contentURL(), type: contentProvider.contentType().name()};
  }

  /**
   * @return {!Array<!Common.ContentProvider>}
   */
  _onGetPageResources() {
    /** @type {!Map<string, !Common.ContentProvider>} */
    const resources = new Map();

    /**
     * @this {Extensions.ExtensionServer}
     */
    function pushResourceData(contentProvider) {
      if (!resources.has(contentProvider.contentURL()))
        resources.set(contentProvider.contentURL(), this._makeResource(contentProvider));
    }
    let uiSourceCodes = Workspace.workspace.uiSourceCodesForProjectType(Workspace.projectTypes.Network);
    uiSourceCodes =
        uiSourceCodes.concat(Workspace.workspace.uiSourceCodesForProjectType(Workspace.projectTypes.ContentScripts));
    uiSourceCodes.forEach(pushResourceData.bind(this));
    for (const resourceTreeModel of SDK.targetManager.models(SDK.ResourceTreeModel))
      resourceTreeModel.forAllResources(pushResourceData.bind(this));
    return resources.valuesArray();
  }

  /**
   * @param {!Common.ContentProvider} contentProvider
   * @param {!Object} message
   * @param {!MessagePort} port
   */
  async _getResourceContent(contentProvider, message, port) {
    const content = await contentProvider.requestContent();
    const encoded = await contentProvider.contentEncoded();
    this._dispatchCallback(message.requestId, port, {encoding: encoded ? 'base64' : '', content: content});
  }

  _onGetRequestContent(message, port) {
    const request = this._requestById(message.id);
    if (!request)
      return this._status.E_NOTFOUND(message.id);
    this._getResourceContent(request, message, port);
  }

  _onGetResourceContent(message, port) {
    const url = /** @type {string} */ (message.url);
    const contentProvider = Workspace.workspace.uiSourceCodeForURL(url) || Bindings.resourceForURL(url);
    if (!contentProvider)
      return this._status.E_NOTFOUND(url);
    this._getResourceContent(contentProvider, message, port);
  }

  _onSetResourceContent(message, port) {
    /**
     * @param {?Protocol.Error} error
     * @this {Extensions.ExtensionServer}
     */
    function callbackWrapper(error) {
      const response = error ? this._status.E_FAILED(error) : this._status.OK();
      this._dispatchCallback(message.requestId, port, response);
    }

    const url = /** @type {string} */ (message.url);
    const uiSourceCode = Workspace.workspace.uiSourceCodeForURL(url);
    if (!uiSourceCode || !uiSourceCode.contentType().isDocumentOrScriptOrStyleSheet()) {
      const resource = SDK.ResourceTreeModel.resourceForURL(url);
      if (!resource)
        return this._status.E_NOTFOUND(url);
      return this._status.E_NOTSUPPORTED('Resource is not editable');
    }
    uiSourceCode.setWorkingCopy(message.content);
    if (message.commit)
      uiSourceCode.commitWorkingCopy();
    callbackWrapper.call(this, null);
  }

  _requestId(request) {
    if (!request._extensionRequestId) {
      request._extensionRequestId = ++this._lastRequestId;
      this._requests[request._extensionRequestId] = request;
    }
    return request._extensionRequestId;
  }

  _requestById(id) {
    return this._requests[id];
  }

  /**
   * @param {!Object} message
   * @param {!MessagePort} port
   */
  _onAddTraceProvider(message, port) {
    const provider = new Extensions.ExtensionTraceProvider(
        port._extensionOrigin, message.id, message.categoryName, message.categoryTooltip);
    this._clientObjects[message.id] = provider;
    this._traceProviders.push(provider);
    this.dispatchEventToListeners(Extensions.ExtensionServer.Events.TraceProviderAdded, provider);
  }

  /**
   * @return {!Array<!Extensions.ExtensionTraceProvider>}
   */
  traceProviders() {
    return this._traceProviders;
  }

  _onForwardKeyboardEvent(message) {
    message.entries.forEach(handleEventEntry);

    /**
     * @param {*} entry
     * @suppressGlobalPropertiesCheck
     */
    function handleEventEntry(entry) {
      // Fool around closure compiler -- it has its own notion of both KeyboardEvent constructor
      // and initKeyboardEvent methods and overriding these in externs.js does not have effect.
      const event = new window.KeyboardEvent(entry.eventType, {
        key: entry.key,
        code: entry.code,
        keyCode: entry.keyCode,
        location: entry.location,
        ctrlKey: entry.ctrlKey,
        altKey: entry.altKey,
        shiftKey: entry.shiftKey,
        metaKey: entry.metaKey
      });
      event.__keyCode = keyCodeForEntry(entry);
      document.dispatchEvent(event);
    }

    function keyCodeForEntry(entry) {
      let keyCode = entry.keyCode;
      if (!keyCode) {
        // This is required only for synthetic events (e.g. dispatched in tests).
        if (entry.key === 'Escape')
          keyCode = 27;
      }
      return keyCode || 0;
    }
  }

  _dispatchCallback(requestId, port, result) {
    if (requestId)
      port.postMessage({command: 'callback', requestId: requestId, result: result});
  }

  _initExtensions() {
    this._registerAutosubscriptionHandler(
        Extensions.extensionAPI.Events.ResourceAdded, Workspace.workspace, Workspace.Workspace.Events.UISourceCodeAdded,
        this._notifyResourceAdded);
    this._registerAutosubscriptionTargetManagerHandler(
        Extensions.extensionAPI.Events.NetworkRequestFinished, SDK.NetworkManager,
        SDK.NetworkManager.Events.RequestFinished, this._notifyRequestFinished);

    /**
     * @this {Extensions.ExtensionServer}
     */
    function onElementsSubscriptionStarted() {
      UI.context.addFlavorChangeListener(SDK.DOMNode, this._notifyElementsSelectionChanged, this);
    }

    /**
     * @this {Extensions.ExtensionServer}
     */
    function onElementsSubscriptionStopped() {
      UI.context.removeFlavorChangeListener(SDK.DOMNode, this._notifyElementsSelectionChanged, this);
    }

    this._registerSubscriptionHandler(
        Extensions.extensionAPI.Events.PanelObjectSelected + 'elements', onElementsSubscriptionStarted.bind(this),
        onElementsSubscriptionStopped.bind(this));
    this._registerResourceContentCommittedHandler(this._notifyUISourceCodeContentCommitted);

    SDK.targetManager.addEventListener(SDK.TargetManager.Events.InspectedURLChanged, this._inspectedURLChanged, this);

    self.InspectorExtensionRegistry.getExtensionsAsync();
  }

  _notifyResourceAdded(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data);
    this._postNotification(Extensions.extensionAPI.Events.ResourceAdded, this._makeResource(uiSourceCode));
  }

  _notifyUISourceCodeContentCommitted(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data.uiSourceCode);
    const content = /** @type {string} */ (event.data.content);
    this._postNotification(
        Extensions.extensionAPI.Events.ResourceContentCommitted, this._makeResource(uiSourceCode), content);
  }

  async _notifyRequestFinished(event) {
    const request = /** @type {!SDK.NetworkRequest} */ (event.data);
    const entry = await SDK.HARLog.Entry.build(request);
    this._postNotification(Extensions.extensionAPI.Events.NetworkRequestFinished, this._requestId(request), entry);
  }

  _notifyElementsSelectionChanged() {
    this._postNotification(Extensions.extensionAPI.Events.PanelObjectSelected + 'elements');
  }

  /**
   * @param {string} url
   * @param {!TextUtils.TextRange} range
   */
  sourceSelectionChanged(url, range) {
    this._postNotification(Extensions.extensionAPI.Events.PanelObjectSelected + 'sources', {
      startLine: range.startLine,
      startColumn: range.startColumn,
      endLine: range.endLine,
      endColumn: range.endColumn,
      url: url,
    });
  }

  /**
   * @param {!Common.Event} event
   */
  _addExtensions(event) {
    if (Extensions.extensionServer._overridePlatformExtensionAPIForTest)
      window.buildPlatformExtensionAPI = Extensions.extensionServer._overridePlatformExtensionAPIForTest;

    const extensionInfos = /** @type {!Array.<!ExtensionDescriptor>} */ (event.data);
    if (this._initializeCommandIssued)
      extensionInfos.forEach(this._addExtension, this);
    else
      this._pendingExtensionInfos = extensionInfos;
  }

  /**
   * @param {!Common.Event} event
   */
  _setInspectedTabId(event) {
    this._inspectedTabId = /** @type {string} */ (event.data);
  }

  /**
   * @param {!ExtensionDescriptor} extensionInfo
   * @suppressGlobalPropertiesCheck
   */
  _addExtension(extensionInfo) {
    const urlOriginRegExp = new RegExp('([^:]+:\/\/[^/]*)\/');  // Can't use regexp literal here, MinJS chokes on it.
    const startPage = extensionInfo.startPage;
    const name = extensionInfo.name;

    try {
      const originMatch = urlOriginRegExp.exec(startPage);
      if (!originMatch) {
        console.error('Skipping extension with invalid URL: ' + startPage);
        return false;
      }
      const extensionOrigin = originMatch[1];
      if (!this._registeredExtensions[extensionOrigin]) {
        // See ExtensionAPI.js for details.
        const injectedAPI = buildExtensionAPIInjectedScript(
            extensionInfo, this._inspectedTabId, UI.themeSupport.themeName(),
            UI.shortcutRegistry.globalShortcutKeys(),
            Extensions.extensionServer['_extensionAPITestHook']);
        InspectorFrontendHost.setInjectedScriptForOrigin(extensionOrigin, injectedAPI);
        this._registeredExtensions[extensionOrigin] = {name: name};
      }
      const iframe = createElement('iframe');
      iframe.src = startPage;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);  // Only for main window.
    } catch (e) {
      console.error('Failed to initialize extension ' + startPage + ':' + e);
      return false;
    }
    return true;
  }

  _registerExtension(origin, port) {
    if (!this._registeredExtensions.hasOwnProperty(origin)) {
      if (origin !== window.location.origin)  // Just ignore inspector frames.
        console.error('Ignoring unauthorized client request from ' + origin);
      return;
    }
    port._extensionOrigin = origin;
    port.addEventListener('message', this._onmessage.bind(this), false);
    port.start();
  }

  _onWindowMessage(event) {
    if (event.data === 'registerExtension')
      this._registerExtension(event.origin, event.ports[0]);
  }

  async _onmessage(event) {
    const message = event.data;
    let result;

    if (message.command in this._handlers)
      result = await this._handlers[message.command](message, event.target);
    else
      result = this._status.E_NOTSUPPORTED(message.command);

    if (result && message.requestId)
      this._dispatchCallback(message.requestId, event.target, result);
  }

  _registerHandler(command, callback) {
    console.assert(command);
    this._handlers[command] = callback;
  }

  _registerSubscriptionHandler(eventTopic, onSubscribeFirst, onUnsubscribeLast) {
    this._subscriptionStartHandlers[eventTopic] = onSubscribeFirst;
    this._subscriptionStopHandlers[eventTopic] = onUnsubscribeLast;
  }

  /**
   * @param {string} eventTopic
   * @param {!Object} eventTarget
   * @param {string} frontendEventType
   * @param {function(!Common.Event)} handler
   */
  _registerAutosubscriptionHandler(eventTopic, eventTarget, frontendEventType, handler) {
    this._registerSubscriptionHandler(
        eventTopic, eventTarget.addEventListener.bind(eventTarget, frontendEventType, handler, this),
        eventTarget.removeEventListener.bind(eventTarget, frontendEventType, handler, this));
  }

  /**
   * @param {string} eventTopic
   * @param {!Function} modelClass
   * @param {string} frontendEventType
   * @param {function(!Common.Event)} handler
   */
  _registerAutosubscriptionTargetManagerHandler(eventTopic, modelClass, frontendEventType, handler) {
    this._registerSubscriptionHandler(
        eventTopic,
        SDK.targetManager.addModelListener.bind(SDK.targetManager, modelClass, frontendEventType, handler, this),
        SDK.targetManager.removeModelListener.bind(SDK.targetManager, modelClass, frontendEventType, handler, this));
  }

  _registerResourceContentCommittedHandler(handler) {
    /**
     * @this {Extensions.ExtensionServer}
     */
    function addFirstEventListener() {
      Workspace.workspace.addEventListener(Workspace.Workspace.Events.WorkingCopyCommittedByUser, handler, this);
      Workspace.workspace.setHasResourceContentTrackingExtensions(true);
    }

    /**
     * @this {Extensions.ExtensionServer}
     */
    function removeLastEventListener() {
      Workspace.workspace.setHasResourceContentTrackingExtensions(false);
      Workspace.workspace.removeEventListener(Workspace.Workspace.Events.WorkingCopyCommittedByUser, handler, this);
    }

    this._registerSubscriptionHandler(
        Extensions.extensionAPI.Events.ResourceContentCommitted, addFirstEventListener.bind(this),
        removeLastEventListener.bind(this));
  }

  _expandResourcePath(extensionPath, resourcePath) {
    if (!resourcePath)
      return;
    return extensionPath + this._normalizePath(resourcePath);
  }

  _normalizePath(path) {
    const source = path.split('/');
    const result = [];

    for (let i = 0; i < source.length; ++i) {
      if (source[i] === '.')
        continue;
      // Ignore empty path components resulting from //, as well as a leading and traling slashes.
      if (source[i] === '')
        continue;
      if (source[i] === '..')
        result.pop();
      else
        result.push(source[i]);
    }
    return '/' + result.join('/');
  }

  /**
   * @param {string} expression
   * @param {boolean} exposeCommandLineAPI
   * @param {boolean} returnByValue
   * @param {?Object} options
   * @param {string} securityOrigin
   * @param {function(?string, ?SDK.RemoteObject, boolean)} callback
   * @return {!Extensions.ExtensionStatus.Record|undefined}
   */
  evaluate(expression, exposeCommandLineAPI, returnByValue, options, securityOrigin, callback) {
    let context;

    /**
     * @param {string} url
     * @return {boolean}
     */
    function resolveURLToFrame(url) {
      let found;
      function hasMatchingURL(frame) {
        found = (frame.url === url) ? frame : null;
        return found;
      }
      SDK.ResourceTreeModel.frames().some(hasMatchingURL);
      return found;
    }

    options = options || {};
    let frame;
    if (options.frameURL) {
      frame = resolveURLToFrame(options.frameURL);
    } else {
      const target = SDK.targetManager.mainTarget();
      const resourceTreeModel = target && target.model(SDK.ResourceTreeModel);
      frame = resourceTreeModel && resourceTreeModel.mainFrame;
    }
    if (!frame) {
      if (options.frameURL)
        console.warn('evaluate: there is no frame with URL ' + options.frameURL);
      else
        console.warn('evaluate: the main frame is not yet available');
      return this._status.E_NOTFOUND(options.frameURL || '<top>');
    }

    let contextSecurityOrigin;
    if (options.useContentScriptContext)
      contextSecurityOrigin = securityOrigin;
    else if (options.scriptExecutionContext)
      contextSecurityOrigin = options.scriptExecutionContext;

    const runtimeModel = frame.resourceTreeModel().target().model(SDK.RuntimeModel);
    const executionContexts = runtimeModel ? runtimeModel.executionContexts() : [];
    if (contextSecurityOrigin) {
      for (let i = 0; i < executionContexts.length; ++i) {
        const executionContext = executionContexts[i];
        if (executionContext.frameId === frame.id && executionContext.origin === contextSecurityOrigin &&
            !executionContext.isDefault)
          context = executionContext;
      }
      if (!context) {
        console.warn('The JavaScript context ' + contextSecurityOrigin + ' was not found in the frame ' + frame.url);
        return this._status.E_NOTFOUND(contextSecurityOrigin);
      }
    } else {
      for (let i = 0; i < executionContexts.length; ++i) {
        const executionContext = executionContexts[i];
        if (executionContext.frameId === frame.id && executionContext.isDefault)
          context = executionContext;
      }
      if (!context)
        return this._status.E_FAILED(frame.url + ' has no execution context');
    }

    context
        .evaluate(
            {
              expression: expression,
              objectGroup: 'extension',
              includeCommandLineAPI: exposeCommandLineAPI,
              silent: true,
              returnByValue: returnByValue,
              generatePreview: false
            },
            /* userGesture */ false, /* awaitPromise */ false)
        .then(onEvaluate);

    /**
     * @param {!SDK.RuntimeModel.EvaluationResult} result
     */
    function onEvaluate(result) {
      if (result.error) {
        callback(result.error, null, false);
        return;
      }
      callback(null, result.object || null, !!result.exceptionDetails);
    }
  }
};

/** @enum {symbol} */
Extensions.ExtensionServer.Events = {
  SidebarPaneAdded: Symbol('SidebarPaneAdded'),
  TraceProviderAdded: Symbol('TraceProviderAdded')
};

/**
 * @unrestricted
 */
Extensions.ExtensionServerPanelView = class extends UI.SimpleView {
  /**
   * @param {string} name
   * @param {string} title
   * @param {!UI.Panel} panel
   */
  constructor(name, title, panel) {
    super(title);
    this._name = name;
    this._panel = panel;
  }

  /**
   * @override
   * @return {string}
   */
  viewId() {
    return this._name;
  }

  /**
   * @override
   * @return {!Promise.<!UI.Widget>}
   */
  widget() {
    return /** @type {!Promise.<!UI.Widget>} */ (Promise.resolve(this._panel));
  }
};

/**
 * @unrestricted
 */
Extensions.ExtensionStatus = class {
  constructor() {
    /**
     * @param {string} code
     * @param {string} description
     * @return {!Extensions.ExtensionStatus.Record}
     */
    function makeStatus(code, description) {
      const details = Array.prototype.slice.call(arguments, 2);
      const status = {code: code, description: description, details: details};
      if (code !== 'OK') {
        status.isError = true;
        console.error('Extension server error: ' + String.vsprintf(description, details));
      }
      return status;
    }

    this.OK = makeStatus.bind(null, 'OK', 'OK');
    this.E_EXISTS = makeStatus.bind(null, 'E_EXISTS', 'Object already exists: %s');
    this.E_BADARG = makeStatus.bind(null, 'E_BADARG', 'Invalid argument %s: %s');
    this.E_BADARGTYPE = makeStatus.bind(null, 'E_BADARGTYPE', 'Invalid type for argument %s: got %s, expected %s');
    this.E_NOTFOUND = makeStatus.bind(null, 'E_NOTFOUND', 'Object not found: %s');
    this.E_NOTSUPPORTED = makeStatus.bind(null, 'E_NOTSUPPORTED', 'Object does not support requested operation: %s');
    this.E_PROTOCOLERROR = makeStatus.bind(null, 'E_PROTOCOLERROR', 'Inspector protocol error: %s');
    this.E_FAILED = makeStatus.bind(null, 'E_FAILED', 'Operation failed: %s');
  }
};

/**
 * @typedef {{code: string, description: string, details: !Array.<*>}}
 */
Extensions.ExtensionStatus.Record;

Extensions.extensionAPI = {};
defineCommonExtensionSymbols(Extensions.extensionAPI);

/** @type {!Extensions.ExtensionServer} */
Extensions.extensionServer;
