// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Snippets.SnippetsQuickOpen = class extends QuickOpen.FilteredListWidget.Provider {
  constructor() {
    super();
    /** @type {!Array<!Workspace.UISourceCode>} */
    this._snippets = [];
  }
  /**
   * @override
   * @param {?number} itemIndex
   * @param {string} promptValue
   */
  selectItem(itemIndex, promptValue) {
    if (itemIndex === null)
      return;
    Snippets.evaluateScriptSnippet(this._snippets[itemIndex]);
  }

  /**
   * @override
   * @param {string} query
   * @return {string}
   */
  notFoundText(query) {
    return Common.UIString('No snippets found.');
  }

  /**
   * @override
   */
  attach() {
    this._snippets = Snippets.project.uiSourceCodes();
  }

  /**
   * @override
   */
  detach() {
    this._snippets = [];
  }


  /**
   * @override
   * @return {number}
   */
  itemCount() {
    return this._snippets.length;
  }

  /**
   * @override
   * @param {number} itemIndex
   * @return {string}
   */
  itemKeyAt(itemIndex) {
    return this._snippets[itemIndex].name();
  }

  /**
   * @override
   * @param {number} itemIndex
   * @param {string} query
   * @param {!Element} titleElement
   * @param {!Element} subtitleElement
   */
  renderItem(itemIndex, query, titleElement, subtitleElement) {
    titleElement.textContent = unescape(this._snippets[itemIndex].name());
    titleElement.classList.add('monospace');
    QuickOpen.FilteredListWidget.highlightRanges(titleElement, query, true);
  }
};
