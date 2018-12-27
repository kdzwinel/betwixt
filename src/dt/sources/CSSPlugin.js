/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

Sources.CSSPlugin = class extends Sources.UISourceCodeFrame.Plugin {
  /**
   * @param {!SourceFrame.SourcesTextEditor} textEditor
   */
  constructor(textEditor) {
    super();
    this._textEditor = textEditor;
    this._swatchPopoverHelper = new InlineEditor.SwatchPopoverHelper();
    this._muteSwatchProcessing = false;
    this._hadSwatchChange = false;
    /** @type {?InlineEditor.BezierEditor} */
    this._bezierEditor = null;
    /** @type {?TextUtils.TextRange} */
    this._editedSwatchTextRange = null;
    /** @type {?ColorPicker.Spectrum} */
    this._spectrum = null;
    /** @type {?Element} */
    this._currentSwatch = null;
    this._textEditor.configureAutocomplete(
        {suggestionsCallback: this._cssSuggestions.bind(this), isWordChar: this._isWordChar.bind(this)});
    this._textEditor.addEventListener(
        SourceFrame.SourcesTextEditor.Events.ScrollChanged, this._textEditorScrolled, this);
    this._textEditor.addEventListener(UI.TextEditor.Events.TextChanged, this._onTextChanged, this);
    this._updateSwatches(0, this._textEditor.linesCount - 1);

    this._shortcuts = {};
    this._registerShortcuts();
    this._boundHandleKeyDown = this._handleKeyDown.bind(this);
    this._textEditor.element.addEventListener('keydown', this._boundHandleKeyDown, false);
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {boolean}
   */
  static accepts(uiSourceCode) {
    return uiSourceCode.contentType().isStyleSheet();
  }

  _registerShortcuts() {
    const shortcutKeys = UI.ShortcutsScreen.SourcesPanelShortcuts;
    for (const descriptor of shortcutKeys.IncreaseCSSUnitByOne)
      this._shortcuts[descriptor.key] = this._handleUnitModification.bind(this, 1);
    for (const descriptor of shortcutKeys.DecreaseCSSUnitByOne)
      this._shortcuts[descriptor.key] = this._handleUnitModification.bind(this, -1);
    for (const descriptor of shortcutKeys.IncreaseCSSUnitByTen)
      this._shortcuts[descriptor.key] = this._handleUnitModification.bind(this, 10);
    for (const descriptor of shortcutKeys.DecreaseCSSUnitByTen)
      this._shortcuts[descriptor.key] = this._handleUnitModification.bind(this, -10);
  }

  /**
   * @param {!Event} event
   */
  _handleKeyDown(event) {
    const shortcutKey = UI.KeyboardShortcut.makeKeyFromEvent(/** @type {!KeyboardEvent} */ (event));
    const handler = this._shortcuts[shortcutKey];
    if (handler && handler())
      event.consume(true);
  }

  _textEditorScrolled() {
    if (this._swatchPopoverHelper.isShowing())
      this._swatchPopoverHelper.hide(true);
  }

  /**
   * @param {string} unit
   * @param {number} change
   * @return {?string}
   */
  _modifyUnit(unit, change) {
    const unitValue = parseInt(unit, 10);
    if (isNaN(unitValue))
      return null;
    const tail = unit.substring((unitValue).toString().length);
    return String.sprintf('%d%s', unitValue + change, tail);
  }

  /**
   * @param {number} change
   * @return {boolean}
   */
  _handleUnitModification(change) {
    const selection = this._textEditor.selection().normalize();
    let token = this._textEditor.tokenAtTextPosition(selection.startLine, selection.startColumn);
    if (!token) {
      if (selection.startColumn > 0)
        token = this._textEditor.tokenAtTextPosition(selection.startLine, selection.startColumn - 1);
      if (!token)
        return false;
    }
    if (token.type !== 'css-number')
      return false;

    const cssUnitRange =
        new TextUtils.TextRange(selection.startLine, token.startColumn, selection.startLine, token.endColumn);
    const cssUnitText = this._textEditor.text(cssUnitRange);
    const newUnitText = this._modifyUnit(cssUnitText, change);
    if (!newUnitText)
      return false;
    this._textEditor.editRange(cssUnitRange, newUnitText);
    selection.startColumn = token.startColumn;
    selection.endColumn = selection.startColumn + newUnitText.length;
    this._textEditor.setSelection(selection);
    return true;
  }

  /**
   * @param {number} startLine
   * @param {number} endLine
   */
  _updateSwatches(startLine, endLine) {
    const swatches = [];
    const swatchPositions = [];

    const regexes =
        [SDK.CSSMetadata.VariableRegex, SDK.CSSMetadata.URLRegex, UI.Geometry.CubicBezier.Regex, Common.Color.Regex];
    const handlers = new Map();
    handlers.set(Common.Color.Regex, this._createColorSwatch.bind(this));
    handlers.set(UI.Geometry.CubicBezier.Regex, this._createBezierSwatch.bind(this));

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
      const line = this._textEditor.line(lineNumber).substring(0, Sources.CSSPlugin.maxSwatchProcessingLength);
      const results = TextUtils.TextUtils.splitStringByRegexes(line, regexes);
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.regexIndex === -1 || !handlers.has(regexes[result.regexIndex]))
          continue;
        const delimiters = /[\s:;,(){}]/;
        const positionBefore = result.position - 1;
        const positionAfter = result.position + result.value.length;
        if (positionBefore >= 0 && !delimiters.test(line.charAt(positionBefore)) ||
            positionAfter < line.length && !delimiters.test(line.charAt(positionAfter)))
          continue;
        const swatch = handlers.get(regexes[result.regexIndex])(result.value);
        if (!swatch)
          continue;
        swatches.push(swatch);
        swatchPositions.push(TextUtils.TextRange.createFromLocation(lineNumber, result.position));
      }
    }
    this._textEditor.operation(putSwatchesInline.bind(this));

    /**
     * @this {Sources.CSSPlugin}
     */
    function putSwatchesInline() {
      const clearRange = new TextUtils.TextRange(startLine, 0, endLine, this._textEditor.line(endLine).length);
      this._textEditor.bookmarks(clearRange, Sources.CSSPlugin.SwatchBookmark).forEach(marker => marker.clear());

      for (let i = 0; i < swatches.length; i++) {
        const swatch = swatches[i];
        const swatchPosition = swatchPositions[i];
        const bookmark = this._textEditor.addBookmark(
            swatchPosition.startLine, swatchPosition.startColumn, swatch, Sources.CSSPlugin.SwatchBookmark);
        swatch[Sources.CSSPlugin.SwatchBookmark] = bookmark;
      }
    }
  }

  /**
   * @param {string} text
   * @return {?InlineEditor.ColorSwatch}
   */
  _createColorSwatch(text) {
    const color = Common.Color.parse(text);
    if (!color)
      return null;
    const swatch = InlineEditor.ColorSwatch.create();
    swatch.setColor(color);
    swatch.iconElement().title = Common.UIString('Open color picker.');
    swatch.iconElement().addEventListener('click', this._swatchIconClicked.bind(this, swatch), false);
    swatch.hideText(true);
    return swatch;
  }

  /**
   * @param {string} text
   * @return {?InlineEditor.BezierSwatch}
   */
  _createBezierSwatch(text) {
    if (!UI.Geometry.CubicBezier.parse(text))
      return null;
    const swatch = InlineEditor.BezierSwatch.create();
    swatch.setBezierText(text);
    swatch.iconElement().title = Common.UIString('Open cubic bezier editor.');
    swatch.iconElement().addEventListener('click', this._swatchIconClicked.bind(this, swatch), false);
    swatch.hideText(true);
    return swatch;
  }

  /**
   * @param {!Element} swatch
   * @param {!Event} event
   */
  _swatchIconClicked(swatch, event) {
    event.consume(true);
    this._hadSwatchChange = false;
    this._muteSwatchProcessing = true;
    const swatchPosition = swatch[Sources.CSSPlugin.SwatchBookmark].position();
    this._textEditor.setSelection(swatchPosition);
    this._editedSwatchTextRange = swatchPosition.clone();
    this._editedSwatchTextRange.endColumn += swatch.textContent.length;
    this._currentSwatch = swatch;

    if (swatch instanceof InlineEditor.ColorSwatch)
      this._showSpectrum(swatch);
    else if (swatch instanceof InlineEditor.BezierSwatch)
      this._showBezierEditor(swatch);
  }

  /**
   * @param {!InlineEditor.ColorSwatch} swatch
   */
  _showSpectrum(swatch) {
    if (!this._spectrum) {
      this._spectrum = new ColorPicker.Spectrum();
      this._spectrum.addEventListener(ColorPicker.Spectrum.Events.SizeChanged, this._spectrumResized, this);
      this._spectrum.addEventListener(ColorPicker.Spectrum.Events.ColorChanged, this._spectrumChanged, this);
    }
    this._spectrum.setColor(swatch.color(), swatch.format());
    this._swatchPopoverHelper.show(this._spectrum, swatch.iconElement(), this._swatchPopoverHidden.bind(this));
  }

  /**
   * @param {!Common.Event} event
   */
  _spectrumResized(event) {
    this._swatchPopoverHelper.reposition();
  }

  /**
   * @param {!Common.Event} event
   */
  _spectrumChanged(event) {
    const colorString = /** @type {string} */ (event.data);
    const color = Common.Color.parse(colorString);
    if (!color)
      return;
    this._currentSwatch.setColor(color);
    this._changeSwatchText(colorString);
  }

  /**
   * @param {!InlineEditor.BezierSwatch} swatch
   */
  _showBezierEditor(swatch) {
    if (!this._bezierEditor) {
      this._bezierEditor = new InlineEditor.BezierEditor();
      this._bezierEditor.addEventListener(InlineEditor.BezierEditor.Events.BezierChanged, this._bezierChanged, this);
    }
    let cubicBezier = UI.Geometry.CubicBezier.parse(swatch.bezierText());
    if (!cubicBezier) {
      cubicBezier =
          /** @type {!UI.Geometry.CubicBezier} */ (UI.Geometry.CubicBezier.parse('linear'));
    }
    this._bezierEditor.setBezier(cubicBezier);
    this._swatchPopoverHelper.show(this._bezierEditor, swatch.iconElement(), this._swatchPopoverHidden.bind(this));
  }

  /**
   * @param {!Common.Event} event
   */
  _bezierChanged(event) {
    const bezierString = /** @type {string} */ (event.data);
    this._currentSwatch.setBezierText(bezierString);
    this._changeSwatchText(bezierString);
  }

  /**
   * @param {string} text
   */
  _changeSwatchText(text) {
    this._hadSwatchChange = true;
    this._textEditor.editRange(
        /** @type {!TextUtils.TextRange} */ (this._editedSwatchTextRange), text, '*swatch-text-changed');
    this._editedSwatchTextRange.endColumn = this._editedSwatchTextRange.startColumn + text.length;
  }

  /**
   * @param {boolean} commitEdit
   */
  _swatchPopoverHidden(commitEdit) {
    this._muteSwatchProcessing = false;
    if (!commitEdit && this._hadSwatchChange)
      this._textEditor.undo();
  }

  /**
   * @param {!Common.Event} event
   */
  _onTextChanged(event) {
    if (!this._muteSwatchProcessing)
      this._updateSwatches(event.data.newRange.startLine, event.data.newRange.endLine);
  }

  /**
   * @param {string} char
   * @return {boolean}
   */
  _isWordChar(char) {
    return TextUtils.TextUtils.isWordChar(char) || char === '.' || char === '-' || char === '$';
  }

  /**
   * @param {!TextUtils.TextRange} prefixRange
   * @param {!TextUtils.TextRange} substituteRange
   * @return {?Promise.<!UI.SuggestBox.Suggestions>}
   */
  _cssSuggestions(prefixRange, substituteRange) {
    const prefix = this._textEditor.text(prefixRange);
    if (prefix.startsWith('$'))
      return null;

    const propertyToken = this._backtrackPropertyToken(prefixRange.startLine, prefixRange.startColumn - 1);
    if (!propertyToken)
      return null;

    const line = this._textEditor.line(prefixRange.startLine);
    const tokenContent = line.substring(propertyToken.startColumn, propertyToken.endColumn);
    const propertyValues = SDK.cssMetadata().propertyValues(tokenContent);
    return Promise.resolve(propertyValues.filter(value => value.startsWith(prefix)).map(value => ({text: value})));
  }

  /**
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {?{startColumn: number, endColumn: number, type: string}}
   */
  _backtrackPropertyToken(lineNumber, columnNumber) {
    const backtrackDepth = 10;
    let tokenPosition = columnNumber;
    const line = this._textEditor.line(lineNumber);
    let seenColon = false;

    for (let i = 0; i < backtrackDepth && tokenPosition >= 0; ++i) {
      const token = this._textEditor.tokenAtTextPosition(lineNumber, tokenPosition);
      if (!token)
        return null;
      if (token.type === 'css-property')
        return seenColon ? token : null;
      if (token.type && !(token.type.indexOf('whitespace') !== -1 || token.type.startsWith('css-comment')))
        return null;

      if (!token.type && line.substring(token.startColumn, token.endColumn) === ':') {
        if (!seenColon)
          seenColon = true;
        else
          return null;
      }
      tokenPosition = token.startColumn - 1;
    }
    return null;
  }

  /**
   * @override
   */
  dispose() {
    if (this._swatchPopoverHelper.isShowing())
      this._swatchPopoverHelper.hide(true);
    this._textEditor.removeEventListener(
        SourceFrame.SourcesTextEditor.Events.ScrollChanged, this._textEditorScrolled, this);
    this._textEditor.removeEventListener(UI.TextEditor.Events.TextChanged, this._onTextChanged, this);
    this._textEditor.bookmarks(this._textEditor.fullRange(), Sources.CSSPlugin.SwatchBookmark)
        .forEach(marker => marker.clear());
    this._textEditor.element.removeEventListener('keydown', this._boundHandleKeyDown, false);
  }
};

/** @type {number} */
Sources.CSSPlugin.maxSwatchProcessingLength = 300;
/** @type {symbol} */
Sources.CSSPlugin.SwatchBookmark = Symbol('swatch');
