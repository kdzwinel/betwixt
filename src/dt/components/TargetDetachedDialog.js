// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Protocol.InspectorDispatcher}
 */
Components.TargetDetachedDialog = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    if (target.parentTarget())
      return;
    target.registerInspectorDispatcher(this);
    target.inspectorAgent().enable();
    this._hideCrashedDialog = null;
    Components.TargetDetachedDialog._disconnectedScreenWithReasonWasShown = false;
  }

  /**
   * @override
   * @param {string} reason
   */
  detached(reason) {
    Components.TargetDetachedDialog._disconnectedScreenWithReasonWasShown = true;
    UI.RemoteDebuggingTerminatedScreen.show(reason);
  }

  static webSocketConnectionLost() {
    UI.RemoteDebuggingTerminatedScreen.show('WebSocket disconnected');
  }

  /**
   * @override
   */
  targetCrashed() {
    const dialog = new UI.Dialog();
    dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
    dialog.addCloseButton();
    dialog.setDimmed(true);
    this._hideCrashedDialog = dialog.hide.bind(dialog);
    new UI.TargetCrashedScreen(() => this._hideCrashedDialog = null).show(dialog.contentElement);
    dialog.show();
  }

  /**
   * @override;
   */
  targetReloadedAfterCrash() {
    if (this._hideCrashedDialog) {
      this._hideCrashedDialog.call(null);
      this._hideCrashedDialog = null;
    }
  }
};

SDK.SDKModel.register(Components.TargetDetachedDialog, SDK.Target.Capability.Inspector, true);
