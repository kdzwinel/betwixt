// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {Sources.SourcesView.EditorAction}
 * @unrestricted
 */
Sources.InplaceFormatterEditorAction = class {
  /**
   * @param {!Common.Event} event
   */
  _editorSelected(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data);
    this._updateButton(uiSourceCode);
  }

  /**
   * @param {!Common.Event} event
   */
  _editorClosed(event) {
    const wasSelected = /** @type {boolean} */ (event.data.wasSelected);
    if (wasSelected)
      this._updateButton(null);
  }

  /**
   * @param {?Workspace.UISourceCode} uiSourceCode
   */
  _updateButton(uiSourceCode) {
    this._button.element.classList.toggle('hidden', !this._isFormattable(uiSourceCode));
  }

  /**
   * @override
   * @param {!Sources.SourcesView} sourcesView
   * @return {!UI.ToolbarButton}
   */
  button(sourcesView) {
    if (this._button)
      return this._button;

    this._sourcesView = sourcesView;
    this._sourcesView.addEventListener(Sources.SourcesView.Events.EditorSelected, this._editorSelected.bind(this));
    this._sourcesView.addEventListener(Sources.SourcesView.Events.EditorClosed, this._editorClosed.bind(this));

    this._button = new UI.ToolbarButton(Common.UIString('Format'), 'largeicon-pretty-print');
    this._button.addEventListener(UI.ToolbarButton.Events.Click, this._formatSourceInPlace, this);
    this._updateButton(sourcesView.currentUISourceCode());

    return this._button;
  }

  /**
   * @param {?Workspace.UISourceCode} uiSourceCode
   * @return {boolean}
   */
  _isFormattable(uiSourceCode) {
    if (!uiSourceCode)
      return false;
    if (uiSourceCode.project().canSetFileContent())
      return true;
    if (Persistence.persistence.binding(uiSourceCode))
      return true;
    return uiSourceCode.contentType().isStyleSheet();
  }

  /**
   * @param {!Common.Event} event
   */
  _formatSourceInPlace(event) {
    const uiSourceCode = this._sourcesView.currentUISourceCode();
    if (!this._isFormattable(uiSourceCode))
      return;

    if (uiSourceCode.isDirty())
      contentLoaded.call(this, uiSourceCode.workingCopy());
    else
      uiSourceCode.requestContent().then(contentLoaded.bind(this));

    /**
     * @this {Sources.InplaceFormatterEditorAction}
     * @param {?string} content
     */
    function contentLoaded(content) {
      const highlighterType = uiSourceCode.mimeType();
      Formatter.Formatter.format(uiSourceCode.contentType(), highlighterType, content || '', innerCallback.bind(this));
    }

    /**
     * @this {Sources.InplaceFormatterEditorAction}
     * @param {string} formattedContent
     * @param {!Formatter.FormatterSourceMapping} formatterMapping
     */
    function innerCallback(formattedContent, formatterMapping) {
      if (uiSourceCode.workingCopy() === formattedContent)
        return;
      const sourceFrame = this._sourcesView.viewForFile(uiSourceCode);
      let start = [0, 0];
      if (sourceFrame) {
        const selection = sourceFrame.selection();
        start = formatterMapping.originalToFormatted(selection.startLine, selection.startColumn);
      }
      uiSourceCode.setWorkingCopy(formattedContent);

      this._sourcesView.showSourceLocation(uiSourceCode, start[0], start[1]);
    }
  }
};
