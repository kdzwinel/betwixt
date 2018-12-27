// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Sources.GoToLineQuickOpen = class extends QuickOpen.FilteredListWidget.Provider {
  /**
   * @override
   * @param {?number} itemIndex
   * @param {string} promptValue
   */
  selectItem(itemIndex, promptValue) {
    const uiSourceCode = this._currentUISourceCode();
    if (!uiSourceCode)
      return;
    const position = this._parsePosition(promptValue);
    if (!position)
      return;
    Common.Revealer.reveal(uiSourceCode.uiLocation(position.line - 1, position.column - 1));
  }

  /**
   * @override
   * @param {string} query
   * @return {string}
   */
  notFoundText(query) {
    if (!this._currentUISourceCode())
      return Common.UIString('No file selected.');
    const position = this._parsePosition(query);
    if (!position)
      return Common.UIString('Type a number to go to that line.');
    let text = Common.UIString('Go to line ') + position.line;
    if (position.column && position.column > 1)
      text += Common.UIString(' and column ') + position.column;
    text += '.';
    return text;
  }

  /**
   * @param {string} query
   * @return {?{line: number, column: number}}
   */
  _parsePosition(query) {
    const parts = query.match(/([0-9]+)(\:[0-9]*)?/);
    if (!parts || !parts[0] || parts[0].length !== query.length)
      return null;
    const line = parseInt(parts[1], 10);
    let column;
    if (parts[2])
      column = parseInt(parts[2].substring(1), 10);
    return {line: Math.max(line | 0, 1), column: Math.max(column | 0, 1)};
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
};
