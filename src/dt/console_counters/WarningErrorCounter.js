// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {UI.ToolbarItem.Provider}
 * @unrestricted
 */
ConsoleCounters.WarningErrorCounter = class {
  constructor() {
    ConsoleCounters.WarningErrorCounter._instanceForTest = this;

    this._counter = createElement('div');
    this._counter.addEventListener('click', Common.console.show.bind(Common.console), false);
    this._toolbarItem = new UI.ToolbarItem(this._counter);
    const shadowRoot = UI.createShadowRootWithCoreStyles(this._counter, 'console_counters/errorWarningCounter.css');

    this._errors = this._createItem(shadowRoot, 'smallicon-error');
    this._warnings = this._createItem(shadowRoot, 'smallicon-warning');
    this._titles = [];
    this._errorCount = -1;
    this._warningCount = -1;
    this._throttler = new Common.Throttler(100);

    SDK.consoleModel.addEventListener(SDK.ConsoleModel.Events.ConsoleCleared, this._update, this);
    SDK.consoleModel.addEventListener(SDK.ConsoleModel.Events.MessageAdded, this._update, this);
    SDK.consoleModel.addEventListener(SDK.ConsoleModel.Events.MessageUpdated, this._update, this);
    this._update();
  }

  _updatedForTest() {
    // Sniffed in tests.
  }

  /**
   * @param {!Node} shadowRoot
   * @param {string} iconType
   * @return {!{item: !Element, text: !Element}}
   */
  _createItem(shadowRoot, iconType) {
    const item = createElementWithClass('span', 'counter-item');
    const icon = item.createChild('label', '', 'dt-icon-label');
    icon.type = iconType;
    const text = icon.createChild('span');
    shadowRoot.appendChild(item);
    return {item: item, text: text};
  }

  /**
   * @param {!{item: !Element, text: !Element}} item
   * @param {number} count
   * @param {boolean} first
   * @param {string} title
   */
  _updateItem(item, count, first, title) {
    item.item.classList.toggle('hidden', !count);
    item.item.classList.toggle('counter-item-first', first);
    item.text.textContent = count;
    if (count)
      this._titles.push(title);
  }

  _update() {
    this._updatingForTest = true;
    this._throttler.schedule(this._updateThrottled.bind(this));
  }

  /**
   * @return {!Promise}
   */
  _updateThrottled() {
    const errors = SDK.consoleModel.errors();
    const warnings = SDK.consoleModel.warnings();
    if (errors === this._errorCount && warnings === this._warningCount)
      return Promise.resolve();
    this._errorCount = errors;
    this._warningCount = warnings;

    this._titles = [];
    this._toolbarItem.setVisible(!!(errors || warnings));
    this._updateItem(this._errors, errors, false, Common.UIString(errors === 1 ? '%d error' : '%d errors', errors));
    this._updateItem(
        this._warnings, warnings, !errors, Common.UIString(warnings === 1 ? '%d warning' : '%d warnings', warnings));
    this._counter.title = this._titles.join(', ');
    UI.inspectorView.toolbarItemResized();
    this._updatingForTest = false;
    this._updatedForTest();
    return Promise.resolve();
  }

  /**
   * @override
   * @return {?UI.ToolbarItem}
   */
  item() {
    return this._toolbarItem;
  }
};