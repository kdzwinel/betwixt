/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 * @implements {SDK.SDKModelObserver<!SDK.DebuggerModel>}
 */
Bindings.PresentationConsoleMessageManager = class {
  constructor() {
    SDK.targetManager.observeModels(SDK.DebuggerModel, this);

    SDK.consoleModel.addEventListener(SDK.ConsoleModel.Events.ConsoleCleared, this._consoleCleared, this);
    SDK.consoleModel.addEventListener(
        SDK.ConsoleModel.Events.MessageAdded,
        event => this._consoleMessageAdded(/** @type {!SDK.ConsoleMessage} */ (event.data)));
    SDK.consoleModel.messages().forEach(this._consoleMessageAdded, this);
  }

  /**
   * @override
   * @param {!SDK.DebuggerModel} debuggerModel
   */
  modelAdded(debuggerModel) {
    debuggerModel[Bindings.PresentationConsoleMessageManager._symbol] =
        new Bindings.PresentationConsoleMessageHelper(debuggerModel);
  }

  /**
   * @override
   * @param {!SDK.DebuggerModel} debuggerModel
   */
  modelRemoved(debuggerModel) {
    debuggerModel[Bindings.PresentationConsoleMessageManager._symbol]._consoleCleared();
  }

  /**
   * @param {!SDK.ConsoleMessage} message
   */
  _consoleMessageAdded(message) {
    if (!message.isErrorOrWarning() || !message.runtimeModel() ||
        message.source === SDK.ConsoleMessage.MessageSource.Violation)
      return;
    const debuggerModel = message.runtimeModel().debuggerModel();
    debuggerModel[Bindings.PresentationConsoleMessageManager._symbol]._consoleMessageAdded(message);
  }

  _consoleCleared() {
    for (const debuggerModel of SDK.targetManager.models(SDK.DebuggerModel))
      debuggerModel[Bindings.PresentationConsoleMessageManager._symbol]._consoleCleared();
  }
};

Bindings.PresentationConsoleMessageManager._symbol = Symbol('PresentationConsoleMessageHelper');

Bindings.PresentationConsoleMessageHelper = class {
  /**
   * @param {!SDK.DebuggerModel} debuggerModel
   */
  constructor(debuggerModel) {
    this._debuggerModel = debuggerModel;

    /** @type {!Object.<string, !Array.<!SDK.ConsoleMessage>>} */
    this._pendingConsoleMessages = {};

    /** @type {!Array.<!Bindings.PresentationConsoleMessage>} */
    this._presentationConsoleMessages = [];

    // TODO(dgozman): setImmediate because we race with DebuggerWorkspaceBinding on ParsedScriptSource event delivery.
    debuggerModel.addEventListener(
        SDK.DebuggerModel.Events.ParsedScriptSource, event => setImmediate(this._parsedScriptSource.bind(this, event)));
    debuggerModel.addEventListener(SDK.DebuggerModel.Events.GlobalObjectCleared, this._debuggerReset, this);

    this._locationPool = new Bindings.LiveLocationPool();
  }

  /**
   * @param {!SDK.ConsoleMessage} message
   */
  _consoleMessageAdded(message) {
    const rawLocation = this._rawLocation(message);
    if (rawLocation)
      this._addConsoleMessageToScript(message, rawLocation);
    else
      this._addPendingConsoleMessage(message);
  }

  /**
   * @param {!SDK.ConsoleMessage} message
   * @return {?SDK.DebuggerModel.Location}
   */
  _rawLocation(message) {
    if (message.scriptId)
      return this._debuggerModel.createRawLocationByScriptId(message.scriptId, message.line, message.column);
    const callFrame = message.stackTrace && message.stackTrace.callFrames ? message.stackTrace.callFrames[0] : null;
    if (callFrame) {
      return this._debuggerModel.createRawLocationByScriptId(
          callFrame.scriptId, callFrame.lineNumber, callFrame.columnNumber);
    }
    if (message.url)
      return this._debuggerModel.createRawLocationByURL(message.url, message.line, message.column);
    return null;
  }

  /**
   * @param {!SDK.ConsoleMessage} message
   * @param {!SDK.DebuggerModel.Location} rawLocation
   */
  _addConsoleMessageToScript(message, rawLocation) {
    this._presentationConsoleMessages.push(
        new Bindings.PresentationConsoleMessage(message, rawLocation, this._locationPool));
  }

  /**
   * @param {!SDK.ConsoleMessage} message
   */
  _addPendingConsoleMessage(message) {
    if (!message.url)
      return;
    if (!this._pendingConsoleMessages[message.url])
      this._pendingConsoleMessages[message.url] = [];
    this._pendingConsoleMessages[message.url].push(message);
  }

  /**
   * @param {!Common.Event} event
   */
  _parsedScriptSource(event) {
    const script = /** @type {!SDK.Script} */ (event.data);

    const messages = this._pendingConsoleMessages[script.sourceURL];
    if (!messages)
      return;

    const pendingMessages = [];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const rawLocation = this._rawLocation(message);
      if (!rawLocation)
        continue;
      if (script.scriptId === rawLocation.scriptId)
        this._addConsoleMessageToScript(message, rawLocation);
      else
        pendingMessages.push(message);
    }

    if (pendingMessages.length)
      this._pendingConsoleMessages[script.sourceURL] = pendingMessages;
    else
      delete this._pendingConsoleMessages[script.sourceURL];
  }

  _consoleCleared() {
    this._pendingConsoleMessages = {};
    this._debuggerReset();
  }

  _debuggerReset() {
    for (const message of this._presentationConsoleMessages)
      message.dispose();
    this._presentationConsoleMessages = [];
    this._locationPool.disposeAll();
  }
};

/**
 * @unrestricted
 */
Bindings.PresentationConsoleMessage = class {
  /**
   * @param {!SDK.ConsoleMessage} message
   * @param {!SDK.DebuggerModel.Location} rawLocation
   * @param {!Bindings.LiveLocationPool} locationPool
   */
  constructor(message, rawLocation, locationPool) {
    this._text = message.messageText;
    this._level = message.level === SDK.ConsoleMessage.MessageLevel.Error ?
        Workspace.UISourceCode.Message.Level.Error :
        Workspace.UISourceCode.Message.Level.Warning;
    Bindings.debuggerWorkspaceBinding.createLiveLocation(rawLocation, this._updateLocation.bind(this), locationPool);
  }

  /**
   * @param {!Bindings.LiveLocation} liveLocation
   */
  _updateLocation(liveLocation) {
    if (this._uiMessage)
      this._uiMessage.remove();
    const uiLocation = liveLocation.uiLocation();
    if (!uiLocation)
      return;
    this._uiMessage =
        uiLocation.uiSourceCode.addLineMessage(this._level, this._text, uiLocation.lineNumber, uiLocation.columnNumber);
  }

  dispose() {
    if (this._uiMessage)
      this._uiMessage.remove();
  }
};
