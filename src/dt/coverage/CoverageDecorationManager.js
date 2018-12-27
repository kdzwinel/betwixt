// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @typedef {!{
 *    id: string,
 *    contentProvider: !Common.ContentProvider,
 *    line: number,
 *    column: number
 * }}
 */
Coverage.RawLocation;

Coverage.CoverageDecorationManager = class {
  /**
   * @param {!Coverage.CoverageModel} coverageModel
   */
  constructor(coverageModel) {
    this._coverageModel = coverageModel;
    /** @type {!Map<!Common.ContentProvider, ?TextUtils.Text>} */
    this._textByProvider = new Map();
    /** @type {!Multimap<!Common.ContentProvider, !Workspace.UISourceCode>} */
    this._uiSourceCodeByContentProvider = new Multimap();
    // TODO(crbug.com/720162): get rid of this, use bindings.
    /** @type {!WeakMap<!Workspace.UISourceCode, !Array<!SDK.CSSStyleSheetHeader>>} */
    this._documentUISouceCodeToStylesheets = new WeakMap();

    for (const uiSourceCode of Workspace.workspace.uiSourceCodes())
      uiSourceCode.addLineDecoration(0, Coverage.CoverageDecorationManager._decoratorType, this);
    Workspace.workspace.addEventListener(Workspace.Workspace.Events.UISourceCodeAdded, this._onUISourceCodeAdded, this);
  }

  reset() {
    for (const uiSourceCode of Workspace.workspace.uiSourceCodes())
      uiSourceCode.removeDecorationsForType(Coverage.CoverageDecorationManager._decoratorType);
  }

  dispose() {
    this.reset();
    Workspace.workspace.removeEventListener(
        Workspace.Workspace.Events.UISourceCodeAdded, this._onUISourceCodeAdded, this);
  }

  /**
   * @param {!Array<!Coverage.CoverageInfo>} updatedEntries
   */
  update(updatedEntries) {
    for (const entry of updatedEntries) {
      for (const uiSourceCode of this._uiSourceCodeByContentProvider.get(entry.contentProvider())) {
        uiSourceCode.removeDecorationsForType(Coverage.CoverageDecorationManager._decoratorType);
        uiSourceCode.addLineDecoration(0, Coverage.CoverageDecorationManager._decoratorType, this);
      }
    }
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!Promise<!Array<boolean>>}
   */
  async usageByLine(uiSourceCode) {
    const result = [];
    const sourceText = new TextUtils.Text(uiSourceCode.content() || '');
    await this._updateTexts(uiSourceCode, sourceText);
    const lineEndings = sourceText.lineEndings();
    for (let line = 0; line < sourceText.lineCount(); ++line) {
      const lineLength = lineEndings[line] - (line ? lineEndings[line - 1] : 0) - 1;
      if (!lineLength) {
        result.push(undefined);
        continue;
      }
      const startLocations = this._rawLocationsForSourceLocation(uiSourceCode, line, 0);
      const endLocations = this._rawLocationsForSourceLocation(uiSourceCode, line, lineLength);
      let used = undefined;
      for (let startIndex = 0, endIndex = 0; startIndex < startLocations.length; ++startIndex) {
        const start = startLocations[startIndex];
        while (endIndex < endLocations.length &&
               Coverage.CoverageDecorationManager._compareLocations(start, endLocations[endIndex]) >= 0)
          ++endIndex;
        if (endIndex >= endLocations.length || endLocations[endIndex].id !== start.id)
          continue;
        const end = endLocations[endIndex++];
        const text = this._textByProvider.get(end.contentProvider);
        if (!text)
          continue;
        const textValue = text.value();
        let startOffset = Math.min(text.offsetFromPosition(start.line, start.column), textValue.length - 1);
        let endOffset = Math.min(text.offsetFromPosition(end.line, end.column), textValue.length - 1);
        while (startOffset <= endOffset && /\s/.test(textValue[startOffset]))
          ++startOffset;
        while (startOffset <= endOffset && /\s/.test(textValue[endOffset]))
          --endOffset;
        if (startOffset <= endOffset)
          used = this._coverageModel.usageForRange(end.contentProvider, startOffset, endOffset);
        if (used)
          break;
      }
      result.push(used);
    }
    return result;
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {!TextUtils.Text} text
   * @return {!Promise}
   */
  _updateTexts(uiSourceCode, text) {
    const promises = [];
    for (let line = 0; line < text.lineCount(); ++line) {
      for (const entry of this._rawLocationsForSourceLocation(uiSourceCode, line, 0)) {
        if (this._textByProvider.has(entry.contentProvider))
          continue;
        this._textByProvider.set(entry.contentProvider, null);
        this._uiSourceCodeByContentProvider.set(entry.contentProvider, uiSourceCode);
        promises.push(this._updateTextForProvider(entry.contentProvider));
      }
    }
    return Promise.all(promises);
  }

  /**
   * @param {!Common.ContentProvider} contentProvider
   * @return {!Promise}
   */
  async _updateTextForProvider(contentProvider) {
    const content = await contentProvider.requestContent();
    this._textByProvider.set(contentProvider, new TextUtils.Text(content));
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {number} line
   * @param {number} column
   * @return {!Array<!Coverage.RawLocation>}
   */
  _rawLocationsForSourceLocation(uiSourceCode, line, column) {
    const result = [];
    const contentType = uiSourceCode.contentType();
    if (contentType.hasScripts()) {
      let locations = Bindings.debuggerWorkspaceBinding.uiLocationToRawLocations(uiSourceCode, line, column);
      locations = locations.filter(location => !!location.script());
      for (let location of locations) {
        const script = location.script();
        if (script.isInlineScript() && contentType.isDocument()) {
          if (comparePositions(script.lineOffset, script.columnOffset, location.lineNumber, location.columnNumber) >
                  0 ||
              comparePositions(script.endLine, script.endColumn, location.lineNumber, location.columnNumber) <= 0) {
            location = null;
          } else {
            location.lineNumber -= script.lineOffset;
            if (!location.lineNumber)
              location.columnNumber -= script.columnOffset;
          }
        }
        if (location) {
          result.push({
            id: `js:${location.scriptId}`,
            contentProvider: location.script(),
            line: location.lineNumber,
            column: location.columnNumber
          });
        }
      }
    }
    if (contentType.isStyleSheet() || contentType.isDocument()) {
      const rawStyleLocations = contentType.isDocument() ?
          this._documentUILocationToCSSRawLocations(uiSourceCode, line, column) :
          Bindings.cssWorkspaceBinding.uiLocationToRawLocations(new Workspace.UILocation(uiSourceCode, line, column));
      for (const location of rawStyleLocations) {
        const header = location.header();
        if (!header)
          continue;
        if (header.isInline && contentType.isDocument()) {
          location.lineNumber -= header.startLine;
          if (!location.lineNumber)
            location.columnNumber -= header.startColumn;
        }
        result.push({
          id: `css:${location.styleSheetId}`,
          contentProvider: location.header(),
          line: location.lineNumber,
          column: location.columnNumber
        });
      }
    }
    result.sort(Coverage.CoverageDecorationManager._compareLocations);

    /**
     * @param {number} aLine
     * @param {number} aColumn
     * @param {number} bLine
     * @param {number} bColumn
     * @return {number}
     */
    function comparePositions(aLine, aColumn, bLine, bColumn) {
      return aLine - bLine || aColumn - bColumn;
    }
    return result;
  }

  /**
   * TODO(crbug.com/720162): get rid of this, use bindings.
   *
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {number} line
   * @param {number} column
   * @return {!Array<!SDK.CSSLocation>}
   */
  _documentUILocationToCSSRawLocations(uiSourceCode, line, column) {
    let stylesheets = this._documentUISouceCodeToStylesheets.get(uiSourceCode);
    if (!stylesheets) {
      stylesheets = [];
      const cssModel = this._coverageModel.target().model(SDK.CSSModel);
      if (!cssModel)
        return [];
      for (const headerId of cssModel.styleSheetIdsForURL(uiSourceCode.url())) {
        const header = cssModel.styleSheetHeaderForId(headerId);
        if (header)
          stylesheets.push(header);
      }
      stylesheets.sort(stylesheetComparator);
      this._documentUISouceCodeToStylesheets.set(uiSourceCode, stylesheets);
    }
    const endIndex =
        stylesheets.upperBound(undefined, (unused, header) => line - header.startLine || column - header.startColumn);
    if (!endIndex)
      return [];
    const locations = [];
    const last = stylesheets[endIndex - 1];
    for (let index = endIndex - 1; index >= 0 && stylesheets[index].startLine === last.startLine &&
         stylesheets[index].startColumn === last.startColumn;
         --index)
      locations.push(new SDK.CSSLocation(stylesheets[index], line, column));

    return locations;
    /**
     * @param {!SDK.CSSStyleSheetHeader} a
     * @param {!SDK.CSSStyleSheetHeader} b
     * @return {number}
     */
    function stylesheetComparator(a, b) {
      return a.startLine - b.startLine || a.startColumn - b.startColumn || a.id.localeCompare(b.id);
    }
  }

  /**
   * @param {!Coverage.RawLocation} a
   * @param {!Coverage.RawLocation} b
   */
  static _compareLocations(a, b) {
    return a.id.localeCompare(b.id) || a.line - b.line || a.column - b.column;
  }

  /**
   * @param {!Common.Event} event
   */
  _onUISourceCodeAdded(event) {
    const uiSourceCode = /** @type !Workspace.UISourceCode */ (event.data);
    uiSourceCode.addLineDecoration(0, Coverage.CoverageDecorationManager._decoratorType, this);
  }
};

Coverage.CoverageDecorationManager._decoratorType = 'coverage';

/**
 * @implements {SourceFrame.LineDecorator}
 */
Coverage.CoverageView.LineDecorator = class {
  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {!TextEditor.CodeMirrorTextEditor} textEditor
   */
  decorate(uiSourceCode, textEditor) {
    const decorations = uiSourceCode.decorationsForType(Coverage.CoverageDecorationManager._decoratorType);
    if (!decorations || !decorations.size) {
      textEditor.uninstallGutter(Coverage.CoverageView.LineDecorator._gutterType);
      return;
    }
    const decorationManager =
        /** @type {!Coverage.CoverageDecorationManager} */ (decorations.values().next().value.data());
    decorationManager.usageByLine(uiSourceCode).then(lineUsage => {
      textEditor.operation(() => this._innerDecorate(textEditor, lineUsage));
    });
  }

  /**
   * @param {!TextEditor.CodeMirrorTextEditor} textEditor
   * @param {!Array<boolean>} lineUsage
   */
  _innerDecorate(textEditor, lineUsage) {
    const gutterType = Coverage.CoverageView.LineDecorator._gutterType;
    textEditor.uninstallGutter(gutterType);
    textEditor.installGutter(gutterType, false);
    for (let line = 0; line < lineUsage.length; ++line) {
      // Do not decorate the line if we don't have data.
      if (typeof lineUsage[line] !== 'boolean')
        continue;
      const className = lineUsage[line] ? 'text-editor-coverage-used-marker' : 'text-editor-coverage-unused-marker';
      textEditor.setGutterDecoration(line, gutterType, createElementWithClass('div', className));
    }
  }
};

Coverage.CoverageView.LineDecorator._gutterType = 'CodeMirror-gutter-coverage';