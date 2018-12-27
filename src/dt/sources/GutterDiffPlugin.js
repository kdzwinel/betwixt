// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Sources.GutterDiffPlugin = class extends Sources.UISourceCodeFrame.Plugin {
  /**
   * @param {!TextEditor.CodeMirrorTextEditor} textEditor
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  constructor(textEditor, uiSourceCode) {
    super();
    this._textEditor = textEditor;
    this._uiSourceCode = uiSourceCode;

    /** @type {!Array<!Sources.GutterDiffPlugin.GutterDecoration>} */
    this._decorations = [];
    this._textEditor.installGutter(Sources.GutterDiffPlugin.DiffGutterType, true);
    this._workspaceDiff = WorkspaceDiff.workspaceDiff();
    this._workspaceDiff.subscribeToDiffChange(this._uiSourceCode, this._update, this);
    this._update();
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {boolean}
   */
  static accepts(uiSourceCode) {
    return uiSourceCode.project().type() === Workspace.projectTypes.Network;
  }

  /**
   * @param {!Array<!Sources.GutterDiffPlugin.GutterDecoration>} removed
   * @param {!Array<!Sources.GutterDiffPlugin.GutterDecoration>} added
   */
  _updateDecorations(removed, added) {
    this._textEditor.operation(operation);

    function operation() {
      for (const decoration of removed)
        decoration.remove();
      for (const decoration of added)
        decoration.install();
    }
  }

  _update() {
    if (this._uiSourceCode)
      this._workspaceDiff.requestDiff(this._uiSourceCode).then(this._innerUpdate.bind(this));
    else
      this._innerUpdate(null);
  }

  /**
   * @param {?Diff.Diff.DiffArray} lineDiff
   */
  _innerUpdate(lineDiff) {
    if (!lineDiff) {
      this._updateDecorations(this._decorations, []);
      this._decorations = [];
      return;
    }

    /** @type {!Map<number, !Sources.GutterDiffPlugin.GutterDecoration>} */
    const oldDecorations = new Map();
    for (let i = 0; i < this._decorations.length; ++i) {
      const decoration = this._decorations[i];
      const lineNumber = decoration.lineNumber();
      if (lineNumber === -1)
        continue;
      oldDecorations.set(lineNumber, decoration);
    }

    const diff = SourceFrame.SourceCodeDiff.computeDiff(lineDiff);

    /** @type {!Map<number, !{lineNumber: number, type: !SourceFrame.SourceCodeDiff.EditType}>} */
    const newDecorations = new Map();
    for (let i = 0; i < diff.length; ++i) {
      const diffEntry = diff[i];
      for (let lineNumber = diffEntry.from; lineNumber < diffEntry.to; ++lineNumber)
        newDecorations.set(lineNumber, {lineNumber: lineNumber, type: diffEntry.type});
    }

    const decorationDiff = oldDecorations.diff(newDecorations, (e1, e2) => e1.type === e2.type);
    const addedDecorations = decorationDiff.added.map(
        entry => new Sources.GutterDiffPlugin.GutterDecoration(this._textEditor, entry.lineNumber, entry.type));

    this._decorations = decorationDiff.equal.concat(addedDecorations);
    this._updateDecorations(decorationDiff.removed, addedDecorations);
    this._decorationsSetForTest(newDecorations);
  }

  /**
   * @param {!Map<number, !{lineNumber: number, type: !SourceFrame.SourceCodeDiff.EditType}>} decorations
   */
  _decorationsSetForTest(decorations) {
  }

  /**
   * @override
   * @param {!UI.ContextMenu} contextMenu
   * @param {number} lineNumber
   * @return {!Promise}
   */
  async populateLineGutterContextMenu(contextMenu, lineNumber) {
    Sources.GutterDiffPlugin._appendRevealDiffContextMenu(contextMenu, this._uiSourceCode);
  }

  /**
   * @override
   * @param {!UI.ContextMenu} contextMenu
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {!Promise}
   */
  async populateTextAreaContextMenu(contextMenu, lineNumber, columnNumber) {
    Sources.GutterDiffPlugin._appendRevealDiffContextMenu(contextMenu, this._uiSourceCode);
  }

  static _appendRevealDiffContextMenu(contextMenu, uiSourceCode) {
    if (!WorkspaceDiff.workspaceDiff().isUISourceCodeModified(uiSourceCode))
      return;
    contextMenu.revealSection().appendItem(ls`Local Modifications...`, () => {
      Common.Revealer.reveal(new WorkspaceDiff.DiffUILocation(uiSourceCode));
    });
  }

  /**
   * @override
   */
  dispose() {
    for (const decoration of this._decorations)
      decoration.remove();
    WorkspaceDiff.workspaceDiff().unsubscribeFromDiffChange(this._uiSourceCode, this._update, this);
  }
};

Sources.GutterDiffPlugin.GutterDecoration = class {
  /**
   * @param {!TextEditor.CodeMirrorTextEditor} textEditor
   * @param {number} lineNumber
   * @param {!SourceFrame.SourceCodeDiff.EditType} type
   */
  constructor(textEditor, lineNumber, type) {
    this._textEditor = textEditor;
    this._position = this._textEditor.textEditorPositionHandle(lineNumber, 0);
    this._className = '';
    if (type === SourceFrame.SourceCodeDiff.EditType.Insert)
      this._className = 'diff-entry-insert';
    else if (type === SourceFrame.SourceCodeDiff.EditType.Delete)
      this._className = 'diff-entry-delete';
    else if (type === SourceFrame.SourceCodeDiff.EditType.Modify)
      this._className = 'diff-entry-modify';
    this.type = type;
  }

  /**
   * @return {number}
   */
  lineNumber() {
    const location = this._position.resolve();
    if (!location)
      return -1;
    return location.lineNumber;
  }

  install() {
    const location = this._position.resolve();
    if (!location)
      return;
    const element = createElementWithClass('div', 'diff-marker');
    element.textContent = '\u00A0';
    this._textEditor.setGutterDecoration(location.lineNumber, Sources.GutterDiffPlugin.DiffGutterType, element);
    this._textEditor.toggleLineClass(location.lineNumber, this._className, true);
  }

  remove() {
    const location = this._position.resolve();
    if (!location)
      return;
    this._textEditor.setGutterDecoration(location.lineNumber, Sources.GutterDiffPlugin.DiffGutterType, null);
    this._textEditor.toggleLineClass(location.lineNumber, this._className, false);
  }
};

/** @type {string} */
Sources.GutterDiffPlugin.DiffGutterType = 'CodeMirror-gutter-diff';

/**
 * @implements {UI.ContextMenu.Provider}
 * @unrestricted
 */
Sources.GutterDiffPlugin.ContextMenuProvider = class {
  /**
   * @override
   * @param {!Event} event
   * @param {!UI.ContextMenu} contextMenu
   * @param {!Object} target
   */
  appendApplicableItems(event, contextMenu, target) {
    let uiSourceCode = /** @type {!Workspace.UISourceCode} */ (target);
    const binding = Persistence.persistence.binding(uiSourceCode);
    if (binding)
      uiSourceCode = binding.network;
    Sources.GutterDiffPlugin._appendRevealDiffContextMenu(contextMenu, uiSourceCode);
  }
};
