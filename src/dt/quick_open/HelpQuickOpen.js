// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
QuickOpen.HelpQuickOpen = class extends QuickOpen.FilteredListWidget.Provider {
  constructor() {
    super();
    /** @type {!Array<{prefix: string, title: string}>} */
    this._providers = [];
    self.runtime.extensions(QuickOpen.FilteredListWidget.Provider).forEach(this._addProvider.bind(this));
  }

  /**
   * @param {!Runtime.Extension} extension
   */
  _addProvider(extension) {
    if (extension.descriptor()['title'])
      this._providers.push({prefix: extension.descriptor()['prefix'], title: extension.descriptor()['title']});
  }

  /**
   * @override
   * @return {number}
   */
  itemCount() {
    return this._providers.length;
  }

  /**
   * @override
   * @param {number} itemIndex
   * @return {string}
   */
  itemKeyAt(itemIndex) {
    return this._providers[itemIndex].prefix;
  }

  /**
   * @override
   * @param {number} itemIndex
   * @param {string} query
   * @return {number}
   */
  itemScoreAt(itemIndex, query) {
    return -this._providers[itemIndex].prefix.length;
  }

  /**
   * @override
   * @param {number} itemIndex
   * @param {string} query
   * @param {!Element} titleElement
   * @param {!Element} subtitleElement
   */
  renderItem(itemIndex, query, titleElement, subtitleElement) {
    const provider = this._providers[itemIndex];
    const prefixElement = titleElement.createChild('span', 'monospace');
    prefixElement.textContent = (provider.prefix || '\u2026') + ' ';
    titleElement.createTextChild(provider.title);
  }

  /**
   * @override
   * @param {?number} itemIndex
   * @param {string} promptValue
   */
  selectItem(itemIndex, promptValue) {
    if (itemIndex !== null)
      QuickOpen.QuickOpen.show(this._providers[itemIndex].prefix);
  }

  /**
   * @override
   * @return {boolean}
   */
  renderAsTwoRows() {
    return false;
  }
};
