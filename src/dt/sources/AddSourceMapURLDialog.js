// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Sources.AddSourceMapURLDialog = class extends UI.HBox {
  /**
   * @param {function(string)} callback
   */
  constructor(callback) {
    super(true);
    this.registerRequiredCSS('sources/dialog.css');
    this.contentElement.createChild('label').textContent = Common.UIString('Source map URL: ');

    this._input = UI.createInput();
    this.contentElement.appendChild(this._input);
    this._input.setAttribute('type', 'text');
    this._input.addEventListener('keydown', this._onKeyDown.bind(this), false);

    const addButton = this.contentElement.createChild('button');
    addButton.textContent = Common.UIString('Add');
    addButton.addEventListener('click', this._apply.bind(this), false);

    this.setDefaultFocusedElement(this._input);
    this._callback = callback;
    this.contentElement.tabIndex = 0;
  }

  /**
   * @param {function(string)} callback
   */
  static show(callback) {
    const dialog = new UI.Dialog();
    const addSourceMapURLDialog = new Sources.AddSourceMapURLDialog(done);
    addSourceMapURLDialog.show(dialog.contentElement);
    dialog.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
    dialog.show();

    /**
     * @param {string} value
     */
    function done(value) {
      dialog.hide();
      callback(value);
    }
  }

  _apply() {
    this._callback(this._input.value);
  }

  /**
   * @param {!Event} event
   */
  _onKeyDown(event) {
    if (event.keyCode === UI.KeyboardShortcut.Keys.Enter.code) {
      event.preventDefault();
      this._apply();
    }
  }
};
