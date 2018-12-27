// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
SDK.CSSProperty = class {
  /**
   * @param {!SDK.CSSStyleDeclaration} ownerStyle
   * @param {number} index
   * @param {string} name
   * @param {string} value
   * @param {boolean} important
   * @param {boolean} disabled
   * @param {boolean} parsedOk
   * @param {boolean} implicit
   * @param {?string=} text
   * @param {!Protocol.CSS.SourceRange=} range
   */
  constructor(ownerStyle, index, name, value, important, disabled, parsedOk, implicit, text, range) {
    this.ownerStyle = ownerStyle;
    this.index = index;
    this.name = name;
    this.value = value;
    this.important = important;
    this.disabled = disabled;
    this.parsedOk = parsedOk;
    this.implicit = implicit;  // A longhand, implicitly set by missing values of shorthand.
    this.text = text;
    this.range = range ? TextUtils.TextRange.fromObject(range) : null;
    this._active = true;
    this._nameRange = null;
    this._valueRange = null;
  }

  /**
   * @param {!SDK.CSSStyleDeclaration} ownerStyle
   * @param {number} index
   * @param {!Protocol.CSS.CSSProperty} payload
   * @return {!SDK.CSSProperty}
   */
  static parsePayload(ownerStyle, index, payload) {
    // The following default field values are used in the payload:
    // important: false
    // parsedOk: true
    // implicit: false
    // disabled: false
    const result = new SDK.CSSProperty(
        ownerStyle, index, payload.name, payload.value, payload.important || false, payload.disabled || false,
        ('parsedOk' in payload) ? !!payload.parsedOk : true, !!payload.implicit, payload.text, payload.range);
    return result;
  }

  _ensureRanges() {
    if (this._nameRange && this._valueRange)
      return;
    const range = this.range;
    const text = this.text ? new TextUtils.Text(this.text) : null;
    if (!range || !text)
      return;

    const nameIndex = text.value().indexOf(this.name);
    const valueIndex = text.value().lastIndexOf(this.value);
    if (nameIndex === -1 || valueIndex === -1 || nameIndex > valueIndex)
      return;

    const nameSourceRange = new TextUtils.SourceRange(nameIndex, this.name.length);
    const valueSourceRange = new TextUtils.SourceRange(valueIndex, this.value.length);

    this._nameRange = rebase(text.toTextRange(nameSourceRange), range.startLine, range.startColumn);
    this._valueRange = rebase(text.toTextRange(valueSourceRange), range.startLine, range.startColumn);

    /**
     * @param {!TextUtils.TextRange} oneLineRange
     * @param {number} lineOffset
     * @param {number} columnOffset
     * @return {!TextUtils.TextRange}
     */
    function rebase(oneLineRange, lineOffset, columnOffset) {
      if (oneLineRange.startLine === 0) {
        oneLineRange.startColumn += columnOffset;
        oneLineRange.endColumn += columnOffset;
      }
      oneLineRange.startLine += lineOffset;
      oneLineRange.endLine += lineOffset;
      return oneLineRange;
    }
  }

  /**
   * @return {?TextUtils.TextRange}
   */
  nameRange() {
    this._ensureRanges();
    return this._nameRange;
  }

  /**
   * @return {?TextUtils.TextRange}
   */
  valueRange() {
    this._ensureRanges();
    return this._valueRange;
  }

  /**
   * @param {!SDK.CSSModel.Edit} edit
   */
  rebase(edit) {
    if (this.ownerStyle.styleSheetId !== edit.styleSheetId)
      return;
    if (this.range)
      this.range = this.range.rebaseAfterTextEdit(edit.oldRange, edit.newRange);
  }

  /**
   * @param {boolean} active
   */
  setActive(active) {
    this._active = active;
  }

  get propertyText() {
    if (this.text !== undefined)
      return this.text;

    if (this.name === '')
      return '';
    return this.name + ': ' + this.value + (this.important ? ' !important' : '') + ';';
  }

  /**
   * @return {boolean}
   */
  activeInStyle() {
    return this._active;
  }

  /**
   * @param {string} propertyText
   * @param {boolean} majorChange
   * @param {boolean=} overwrite
   * @return {!Promise.<boolean>}
   */
  setText(propertyText, majorChange, overwrite) {
    if (!this.ownerStyle)
      return Promise.reject(new Error('No ownerStyle for property'));

    if (!this.ownerStyle.styleSheetId)
      return Promise.reject(new Error('No owner style id'));

    if (!this.range || !this.ownerStyle.range)
      return Promise.reject(new Error('Style not editable'));

    if (majorChange)
      Host.userMetrics.actionTaken(Host.UserMetrics.Action.StyleRuleEdited);

    if (overwrite && propertyText === this.propertyText) {
      this.ownerStyle.cssModel().domModel().markUndoableState(!majorChange);
      return Promise.resolve(true);
    }

    const range = this.range.relativeTo(this.ownerStyle.range.startLine, this.ownerStyle.range.startColumn);
    const indentation = this.ownerStyle.cssText ? this._detectIndentation(this.ownerStyle.cssText) :
                                                  Common.moduleSetting('textEditorIndent').get();
    const endIndentation = this.ownerStyle.cssText ? indentation.substring(0, this.ownerStyle.range.endColumn) : '';
    const text = new TextUtils.Text(this.ownerStyle.cssText || '');
    const newStyleText = text.replaceRange(range, String.sprintf(';%s;', propertyText));

    return self.runtime.extension(TextUtils.TokenizerFactory)
        .instance()
        .then(this._formatStyle.bind(this, newStyleText, indentation, endIndentation))
        .then(setStyleText.bind(this));

    /**
     * @param {string} styleText
     * @this {SDK.CSSProperty}
     * @return {!Promise.<boolean>}
     */
    function setStyleText(styleText) {
      return this.ownerStyle.setText(styleText, majorChange);
    }
  }

  /**
   * @param {string} styleText
   * @param {string} indentation
   * @param {string} endIndentation
   * @param {!TextUtils.TokenizerFactory} tokenizerFactory
   * @return {string}
   */
  _formatStyle(styleText, indentation, endIndentation, tokenizerFactory) {
    if (indentation)
      indentation = '\n' + indentation;
    let result = '';
    let propertyText;
    let insideProperty = false;
    const tokenize = tokenizerFactory.createTokenizer('text/css');

    tokenize('*{' + styleText + '}', processToken);
    if (insideProperty)
      result += propertyText;
    result = result.substring(2, result.length - 1).trimRight();
    return result + (indentation ? '\n' + endIndentation : '');

    /**
     * @param {string} token
     * @param {?string} tokenType
     * @param {number} column
     * @param {number} newColumn
     */
    function processToken(token, tokenType, column, newColumn) {
      if (!insideProperty) {
        const disabledProperty = tokenType && tokenType.includes('css-comment') && isDisabledProperty(token);
        const isPropertyStart = tokenType &&
            (tokenType.includes('css-string') || tokenType.includes('css-meta') || tokenType.includes('css-property') ||
             tokenType.includes('css-variable-2'));
        if (disabledProperty) {
          result = result.trimRight() + indentation + token;
        } else if (isPropertyStart) {
          insideProperty = true;
          propertyText = token;
        } else if (token !== ';') {
          result += token;
        }
        return;
      }

      if (token === '}' || token === ';') {
        result = result.trimRight() + indentation + propertyText.trim() + ';';
        insideProperty = false;
        if (token === '}')
          result += '}';
      } else {
        propertyText += token;
      }
    }

    /**
     * @param {string} text
     * @return {boolean}
     */
    function isDisabledProperty(text) {
      const colon = text.indexOf(':');
      if (colon === -1)
        return false;
      const propertyName = text.substring(2, colon).trim();
      return SDK.cssMetadata().isCSSPropertyName(propertyName);
    }
  }

  /**
   * @param {string} text
   * @return {string}
   */
  _detectIndentation(text) {
    const lines = text.split('\n');
    if (lines.length < 2)
      return '';
    return TextUtils.TextUtils.lineIndent(lines[1]);
  }

  /**
   * @param {string} newValue
   * @param {boolean} majorChange
   * @param {boolean} overwrite
   * @param {function(boolean)=} userCallback
   */
  setValue(newValue, majorChange, overwrite, userCallback) {
    const text = this.name + ': ' + newValue + (this.important ? ' !important' : '') + ';';
    this.setText(text, majorChange, overwrite).then(userCallback);
  }

  /**
   * @param {boolean} disabled
   * @return {!Promise.<boolean>}
   */
  setDisabled(disabled) {
    if (!this.ownerStyle)
      return Promise.resolve(false);
    if (disabled === this.disabled)
      return Promise.resolve(true);
    const propertyText = this.text.trim();
    const text = disabled ? '/* ' + propertyText + ' */' : this.text.substring(2, propertyText.length - 2).trim();
    return this.setText(text, true, true);
  }
};
