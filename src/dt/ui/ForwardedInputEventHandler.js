// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
UI.ForwardedInputEventHandler = class {
  constructor() {
    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.KeyEventUnhandled, this._onKeyEventUnhandled, this);
  }

  /**
   * @param {!Common.Event} event
   */
  _onKeyEventUnhandled(event) {
    const data = event.data;
    const type = /** @type {string} */ (data.type);
    const key = /** @type {string} */ (data.key);
    const keyCode = /** @type {number} */ (data.keyCode);
    const modifiers = /** @type {number} */ (data.modifiers);

    if (type !== 'keydown')
      return;

    UI.context.setFlavor(UI.ShortcutRegistry.ForwardedShortcut, UI.ShortcutRegistry.ForwardedShortcut.instance);
    UI.shortcutRegistry.handleKey(UI.KeyboardShortcut.makeKey(keyCode, modifiers), key);
    UI.context.setFlavor(UI.ShortcutRegistry.ForwardedShortcut, null);
  }
};

/** @type {!UI.ForwardedInputEventHandler} */
UI.forwardedEventHandler = new UI.ForwardedInputEventHandler();
