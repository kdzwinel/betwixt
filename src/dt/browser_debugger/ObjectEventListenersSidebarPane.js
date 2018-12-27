// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {UI.ToolbarItem.ItemsProvider}
 * @unrestricted
 */
BrowserDebugger.ObjectEventListenersSidebarPane = class extends UI.VBox {
  constructor() {
    super();
    this._refreshButton = new UI.ToolbarButton(Common.UIString('Refresh'), 'largeicon-refresh');
    this._refreshButton.addEventListener(UI.ToolbarButton.Events.Click, this._refreshClick, this);
    this._refreshButton.setEnabled(false);

    this._eventListenersView = new EventListeners.EventListenersView(this.update.bind(this));
    this._eventListenersView.show(this.element);
  }

  /**
   * @override
   * @return {!Array<!UI.ToolbarItem>}
   */
  toolbarItems() {
    return [this._refreshButton];
  }

  update() {
    if (this._lastRequestedContext) {
      this._lastRequestedContext.runtimeModel.releaseObjectGroup(
          BrowserDebugger.ObjectEventListenersSidebarPane._objectGroupName);
      delete this._lastRequestedContext;
    }
    const executionContext = UI.context.flavor(SDK.ExecutionContext);
    if (!executionContext) {
      this._eventListenersView.reset();
      this._eventListenersView.addEmptyHolderIfNeeded();
      return;
    }
    this._lastRequestedContext = executionContext;
    Promise.all([this._windowObjectInContext(executionContext)])
        .then(this._eventListenersView.addObjects.bind(this._eventListenersView));
  }

  /**
   * @override
   */
  wasShown() {
    super.wasShown();
    UI.context.addFlavorChangeListener(SDK.ExecutionContext, this.update, this);
    this._refreshButton.setEnabled(true);
    this.update();
  }

  /**
   * @override
   */
  willHide() {
    super.willHide();
    UI.context.removeFlavorChangeListener(SDK.ExecutionContext, this.update, this);
    this._refreshButton.setEnabled(false);
  }

  /**
   * @param {!SDK.ExecutionContext} executionContext
   * @return {!Promise<?SDK.RemoteObject>} object
   */
  _windowObjectInContext(executionContext) {
    return executionContext
        .evaluate(
            {
              expression: 'self',
              objectGroup: BrowserDebugger.ObjectEventListenersSidebarPane._objectGroupName,
              includeCommandLineAPI: false,
              silent: true,
              returnByValue: false,
              generatePreview: false
            },
            /* userGesture */ false,
            /* awaitPromise */ false)
        .then(result => result.object && !result.exceptionDetails ? result.object : null);
  }

  /**
   * @param {!Common.Event} event
   */
  _refreshClick(event) {
    event.data.consume();
    this.update();
  }
};

BrowserDebugger.ObjectEventListenersSidebarPane._objectGroupName = 'object-event-listeners-sidebar-pane';
