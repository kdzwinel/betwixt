// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Sources.SourcesView.EditorAction}
 * @unrestricted
 */
Sources.ScriptFormatterEditorAction = class {
  constructor() {
    /** @type {!Set<string>} */
    this._pathsToFormatOnLoad = new Set();
  }

  /**
   * @param {!Common.Event} event
   */
  _editorSelected(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data);
    this._updateButton(uiSourceCode);

    if (this._isFormatableScript(uiSourceCode) && this._pathsToFormatOnLoad.has(uiSourceCode.url()) &&
        !Sources.sourceFormatter.hasFormatted(uiSourceCode))
      this._showFormatted(uiSourceCode);
  }

  /**
   * @param {!Common.Event} event
   */
  _editorClosed(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data.uiSourceCode);
    const wasSelected = /** @type {boolean} */ (event.data.wasSelected);

    if (wasSelected)
      this._updateButton(null);
    const original = Sources.sourceFormatter.discardFormattedUISourceCode(uiSourceCode);
    if (original)
      this._pathsToFormatOnLoad.delete(original.url());
  }

  /**
   * @param {?Workspace.UISourceCode} uiSourceCode
   */
  _updateButton(uiSourceCode) {
    this._button.element.classList.toggle('hidden', !this._isFormatableScript(uiSourceCode));
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

    this._button = new UI.ToolbarButton(Common.UIString('Pretty print'), 'largeicon-pretty-print');
    this._button.addEventListener(UI.ToolbarButton.Events.Click, this._toggleFormatScriptSource, this);
    this._updateButton(sourcesView.currentUISourceCode());

    return this._button;
  }

  /**
   * @param {?Workspace.UISourceCode} uiSourceCode
   * @return {boolean}
   */
  _isFormatableScript(uiSourceCode) {
    if (!uiSourceCode)
      return false;
    if (uiSourceCode.project().canSetFileContent())
      return false;
    if (uiSourceCode.project().type() === Workspace.projectTypes.Formatter)
      return false;
    if (Persistence.persistence.binding(uiSourceCode))
      return false;
    return uiSourceCode.contentType().hasScripts();
  }

  /**
   * @param {!Common.Event} event
   */
  _toggleFormatScriptSource(event) {
    const uiSourceCode = this._sourcesView.currentUISourceCode();
    if (!this._isFormatableScript(uiSourceCode))
      return;
    this._pathsToFormatOnLoad.add(uiSourceCode.url());
    this._showFormatted(uiSourceCode);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  async _showFormatted(uiSourceCode) {
    const formatData = await Sources.sourceFormatter.format(uiSourceCode);
    if (uiSourceCode !== this._sourcesView.currentUISourceCode())
      return;
    const sourceFrame = this._sourcesView.viewForFile(uiSourceCode);
    let start = [0, 0];
    if (sourceFrame) {
      const selection = sourceFrame.selection();
      start = formatData.mapping.originalToFormatted(selection.startLine, selection.startColumn);
    }
    this._sourcesView.showSourceLocation(formatData.formattedSourceCode, start[0], start[1]);
  }
};
