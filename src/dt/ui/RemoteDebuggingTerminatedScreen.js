// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

UI.RemoteDebuggingTerminatedScreen = class extends UI.VBox {
  /**
   * @param {string} reason
   */
  constructor(reason) {
    super(true);
    this.registerRequiredCSS('ui/remoteDebuggingTerminatedScreen.css');
    const message = this.contentElement.createChild('div', 'message');
    message.createChild('span').textContent = Common.UIString('Debugging connection was closed. Reason: ');
    message.createChild('span', 'reason').textContent = reason;
    this.contentElement.createChild('div', 'message').textContent =
        Common.UIString('Reconnect when ready by reopening DevTools.');
    const button = UI.createTextButton(Common.UIString('Reconnect DevTools'), () => window.location.reload());
    this.contentElement.createChild('div', 'button').appendChild(button);
  }

  /**
   * @param {string} reason
   */
  static show(reason) {
    const dialog = new UI.Dialog();
    dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
    dialog.addCloseButton();
    dialog.setDimmed(true);
    new UI.RemoteDebuggingTerminatedScreen(reason).show(dialog.contentElement);
    dialog.show();
  }
};
