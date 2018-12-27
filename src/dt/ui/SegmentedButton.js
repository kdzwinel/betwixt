// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

UI.SegmentedButton = class extends UI.HBox {
  constructor() {
    super(true);
    /** @type {!Map<string, !Element>} */
    this._buttons = new Map();

    /** @type {?string} */
    this._selected = null;
    this.registerRequiredCSS('ui/segmentedButton.css');
    this.contentElement.classList.add('segmented-button');
  }

  /**
   * @param {string} label
   * @param {string} value
   * @param {string=} tooltip
   */
  addSegment(label, value, tooltip) {
    const button = this.contentElement.createChild('button', 'segmented-button-segment');
    button.textContent = label;
    button.title = tooltip;
    this._buttons.set(value, button);
    button.addEventListener('click', () => this.select(value));
  }

  /**
   * @param {string} value
   */
  select(value) {
    if (this._selected === value)
      return;
    this._selected = value;
    for (const key of this._buttons.keys())
      this._buttons.get(key).classList.toggle('segmented-button-segment-selected', key === this._selected);
  }

  /**
   * @return {?string}
   */
  selected() {
    return this._selected;
  }
};
