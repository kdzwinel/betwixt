// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
UI.DropTarget = class {
  /**
   * @param {!Element} element
   * @param {!Array<{kind: string, type: !RegExp}>} transferTypes
   * @param {string} messageText
   * @param {function(!DataTransfer)} handleDrop
   */
  constructor(element, transferTypes, messageText, handleDrop) {
    element.addEventListener('dragenter', this._onDragEnter.bind(this), true);
    element.addEventListener('dragover', this._onDragOver.bind(this), true);
    this._element = element;
    this._transferTypes = transferTypes;
    this._messageText = messageText;
    this._handleDrop = handleDrop;
    this._enabled = true;
  }

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = enabled;
  }

  /**
   * @param {!Event} event
   */
  _onDragEnter(event) {
    if (this._enabled && this._hasMatchingType(event))
      event.consume(true);
  }

  /**
   * @param {!Event} event
   * @return {boolean}
   */
  _hasMatchingType(event) {
    for (const transferType of this._transferTypes) {
      const found = Array.from(event.dataTransfer.items).find(item => {
        return transferType.kind === item.kind && !!transferType.type.exec(item.type);
      });
      if (found)
        return true;
    }
    return false;
  }

  /**
   * @param {!Event} event
   */
  _onDragOver(event) {
    if (!this._enabled || !this._hasMatchingType(event))
      return;
    event.dataTransfer.dropEffect = 'copy';
    event.consume(true);
    if (this._dragMaskElement)
      return;
    this._dragMaskElement = this._element.createChild('div', '');
    const shadowRoot = UI.createShadowRootWithCoreStyles(this._dragMaskElement, 'ui/dropTarget.css');
    shadowRoot.createChild('div', 'drop-target-message').textContent = this._messageText;
    this._dragMaskElement.addEventListener('drop', this._onDrop.bind(this), true);
    this._dragMaskElement.addEventListener('dragleave', this._onDragLeave.bind(this), true);
  }

  /**
   * @param {!Event} event
   */
  _onDrop(event) {
    event.consume(true);
    this._removeMask();
    if (this._enabled)
      this._handleDrop(event.dataTransfer);
  }

  /**
   * @param {!Event} event
   */
  _onDragLeave(event) {
    event.consume(true);
    this._removeMask();
  }

  _removeMask() {
    this._dragMaskElement.remove();
    delete this._dragMaskElement;
  }
};

UI.DropTarget.Type = {
  URI: {kind: 'string', type: /text\/uri-list/},
  Folder: {kind: 'file', type: /$^/},
  File: {kind: 'file', type: /.*/},
  WebFile: {kind: 'file', type: /[\w]+/},
  ImageFile: {kind: 'file', type: /image\/.*/},
};
