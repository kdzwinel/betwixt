// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @unrestricted
 */
Sources.OutlineQuickOpen = class extends QuickOpen.FilteredListWidget.Provider {
  constructor() {
    super();
    this._items = [];
    this._active = false;
  }

  /**
   * @override
   */
  attach() {
    this._items = [];
    this._active = false;

    const uiSourceCode = this._currentUISourceCode();
    if (uiSourceCode) {
      this._active = Formatter.formatterWorkerPool().outlineForMimetype(
          uiSourceCode.workingCopy(), uiSourceCode.contentType().canonicalMimeType(),
          this._didBuildOutlineChunk.bind(this));
    }
  }

  /**
   * @param {boolean} isLastChunk
   * @param {!Array<!Formatter.FormatterWorkerPool.OutlineItem>} items
   */
  _didBuildOutlineChunk(isLastChunk, items) {
    this._items.push(...items);
    this.refresh();
  }

  /**
   * @override
   * @return {number}
   */
  itemCount() {
    return this._items.length;
  }

  /**
   * @override
   * @param {number} itemIndex
   * @return {string}
   */
  itemKeyAt(itemIndex) {
    const item = this._items[itemIndex];
    return item.title + (item.subtitle ? item.subtitle : '');
  }

  /**
   * @override
   * @param {number} itemIndex
   * @param {string} query
   * @return {number}
   */
  itemScoreAt(itemIndex, query) {
    const item = this._items[itemIndex];
    const methodName = query.split('(')[0];
    if (methodName.toLowerCase() === item.title.toLowerCase())
      return 1 / (1 + item.line);
    return -item.line - 1;
  }

  /**
   * @override
   * @param {number} itemIndex
   * @param {string} query
   * @param {!Element} titleElement
   * @param {!Element} subtitleElement
   */
  renderItem(itemIndex, query, titleElement, subtitleElement) {
    const item = this._items[itemIndex];
    titleElement.textContent = item.title + (item.subtitle ? item.subtitle : '');
    QuickOpen.FilteredListWidget.highlightRanges(titleElement, query);
    subtitleElement.textContent = ':' + (item.line + 1);
  }

  /**
   * @override
   * @param {?number} itemIndex
   * @param {string} promptValue
   */
  selectItem(itemIndex, promptValue) {
    if (itemIndex === null)
      return;
    const uiSourceCode = this._currentUISourceCode();
    if (!uiSourceCode)
      return;
    const lineNumber = this._items[itemIndex].line;
    if (!isNaN(lineNumber) && lineNumber >= 0)
      Common.Revealer.reveal(uiSourceCode.uiLocation(lineNumber, this._items[itemIndex].column));
  }


  /**
   * @return {?Workspace.UISourceCode}
   */
  _currentUISourceCode() {
    const sourcesView = UI.context.flavor(Sources.SourcesView);
    if (!sourcesView)
      return null;
    return sourcesView.currentUISourceCode();
  }

  /**
   * @override
   * @return {string}
   */
  notFoundText() {
    if (!this._currentUISourceCode())
      return Common.UIString('No file selected.');
    if (!this._active)
      return Common.UIString('Open a JavaScript or CSS file to see symbols');
    return Common.UIString('No results found');
  }
};
