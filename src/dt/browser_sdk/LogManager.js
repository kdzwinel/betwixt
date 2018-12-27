// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {SDK.SDKModelObserver<!SDK.LogModel>}
 */
BrowserSDK.LogManager = class {
  constructor() {
    SDK.targetManager.observeModels(SDK.LogModel, this);
  }

  /**
   * @override
   * @param {!SDK.LogModel} logModel
   */
  modelAdded(logModel) {
    const eventListeners = [];
    eventListeners.push(logModel.addEventListener(SDK.LogModel.Events.EntryAdded, this._logEntryAdded, this));
    logModel[BrowserSDK.LogManager._eventSymbol] = eventListeners;
  }

  /**
   * @override
   * @param {!SDK.LogModel} logModel
   */
  modelRemoved(logModel) {
    Common.EventTarget.removeEventListeners(logModel[BrowserSDK.LogManager._eventSymbol]);
  }

  /**
   * @param {!Common.Event} event
   */
  _logEntryAdded(event) {
    const data = /** @type {{logModel: !SDK.LogModel, entry: !Protocol.Log.LogEntry}} */ (event.data);
    const target = data.logModel.target();

    const consoleMessage = new SDK.ConsoleMessage(
        target.model(SDK.RuntimeModel), data.entry.source, data.entry.level, data.entry.text, undefined, data.entry.url,
        data.entry.lineNumber, undefined, [data.entry.text, ...(data.entry.args || [])], data.entry.stackTrace,
        data.entry.timestamp, undefined, undefined, data.entry.workerId);

    if (data.entry.networkRequestId)
      SDK.networkLog.associateConsoleMessageWithRequest(consoleMessage, data.entry.networkRequestId);

    if (consoleMessage.source === SDK.ConsoleMessage.MessageSource.Worker) {
      const workerId = consoleMessage.workerId || '';
      // We have a copy of worker messages reported through the page, so that
      // user can see messages from the worker which has been already destroyed.
      // When opening DevTools, give us some time to connect to the worker and
      // not report the message twice if the worker is still alive.
      if (SDK.targetManager.targetById(workerId))
        return;
      setTimeout(() => {
        if (!SDK.targetManager.targetById(workerId))
          SDK.consoleModel.addMessage(consoleMessage);
      }, 1000);
    } else {
      SDK.consoleModel.addMessage(consoleMessage);
    }
  }
};

BrowserSDK.LogManager._eventSymbol = Symbol('_events');

new BrowserSDK.LogManager();
