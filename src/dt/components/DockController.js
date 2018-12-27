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
 * @unrestricted
 */
Components.DockController = class extends Common.Object {
  /**
   * @param {boolean} canDock
   */
  constructor(canDock) {
    super();
    this._canDock = canDock;

    this._closeButton = new UI.ToolbarButton(Common.UIString('Close'), 'largeicon-delete');
    this._closeButton.addEventListener(
        UI.ToolbarButton.Events.Click, InspectorFrontendHost.closeWindow.bind(InspectorFrontendHost));

    if (!canDock) {
      this._dockSide = Components.DockController.State.Undocked;
      this._closeButton.setVisible(false);
      return;
    }

    this._states = [
      Components.DockController.State.DockedToRight, Components.DockController.State.DockedToBottom,
      Components.DockController.State.DockedToLeft, Components.DockController.State.Undocked
    ];
    this._currentDockStateSetting = Common.settings.moduleSetting('currentDockState');
    this._currentDockStateSetting.addChangeListener(this._dockSideChanged, this);
    this._lastDockStateSetting = Common.settings.createSetting('lastDockState', 'bottom');
    if (this._states.indexOf(this._currentDockStateSetting.get()) === -1)
      this._currentDockStateSetting.set('right');
    if (this._states.indexOf(this._lastDockStateSetting.get()) === -1)
      this._currentDockStateSetting.set('bottom');
  }

  initialize() {
    if (!this._canDock)
      return;

    this._titles = [
      Common.UIString('Dock to right'), Common.UIString('Dock to bottom'), Common.UIString('Dock to left'),
      Common.UIString('Undock into separate window')
    ];
    this._dockSideChanged();
  }

  _dockSideChanged() {
    this.setDockSide(this._currentDockStateSetting.get());
  }

  /**
   * @return {string}
   */
  dockSide() {
    return this._dockSide;
  }

  /**
   * @return {boolean}
   */
  canDock() {
    return this._canDock;
  }

  /**
   * @return {boolean}
   */
  isVertical() {
    return this._dockSide === Components.DockController.State.DockedToRight ||
        this._dockSide === Components.DockController.State.DockedToLeft;
  }

  /**
   * @param {string} dockSide
   * @suppressGlobalPropertiesCheck
   */
  setDockSide(dockSide) {
    if (this._states.indexOf(dockSide) === -1)
      dockSide = this._states[0];

    if (this._dockSide === dockSide)
      return;

    if (this._dockSide)
      this._lastDockStateSetting.set(this._dockSide);

    this._savedFocus = document.deepActiveElement();
    const eventData = {from: this._dockSide, to: dockSide};
    this.dispatchEventToListeners(Components.DockController.Events.BeforeDockSideChanged, eventData);
    console.timeStamp('DockController.setIsDocked');
    this._dockSide = dockSide;
    this._currentDockStateSetting.set(dockSide);
    InspectorFrontendHost.setIsDocked(
        dockSide !== Components.DockController.State.Undocked, this._setIsDockedResponse.bind(this, eventData));
    this._closeButton.setVisible(this._dockSide !== Components.DockController.State.Undocked);
    this.dispatchEventToListeners(Components.DockController.Events.DockSideChanged, eventData);
  }

  /**
   * @param {{from: string, to: string}} eventData
   */
  _setIsDockedResponse(eventData) {
    this.dispatchEventToListeners(Components.DockController.Events.AfterDockSideChanged, eventData);
    if (this._savedFocus) {
      this._savedFocus.focus();
      this._savedFocus = null;
    }
  }

  _toggleDockSide() {
    if (this._lastDockStateSetting.get() === this._currentDockStateSetting.get()) {
      const index = this._states.indexOf(this._currentDockStateSetting.get()) || 0;
      this._lastDockStateSetting.set(this._states[(index + 1) % this._states.length]);
    }
    this.setDockSide(this._lastDockStateSetting.get());
  }
};

Components.DockController.State = {
  DockedToBottom: 'bottom',
  DockedToRight: 'right',
  DockedToLeft: 'left',
  Undocked: 'undocked'
};

// Use BeforeDockSideChanged to do something before all the UI bits are updated,
// DockSideChanged to update UI, and AfterDockSideChanged to perform actions
// after frontend is docked/undocked in the browser.

/** @enum {symbol} */
Components.DockController.Events = {
  BeforeDockSideChanged: Symbol('BeforeDockSideChanged'),
  DockSideChanged: Symbol('DockSideChanged'),
  AfterDockSideChanged: Symbol('AfterDockSideChanged')
};

/**
 * @implements {UI.ActionDelegate}
 * @unrestricted
 */
Components.DockController.ToggleDockActionDelegate = class {
  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    Components.dockController._toggleDockSide();
    return true;
  }
};

/**
 * @implements {UI.ToolbarItem.Provider}
 * @unrestricted
 */
Components.DockController.CloseButtonProvider = class {
  /**
   * @override
   * @return {?UI.ToolbarItem}
   */
  item() {
    return Components.dockController._closeButton;
  }
};

/**
 * @type {!Components.DockController}
 */
Components.dockController;
