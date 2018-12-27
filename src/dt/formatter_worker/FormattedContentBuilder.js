// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
FormatterWorker.FormattedContentBuilder = class {
  /**
   * @param {string} indentString
   */
  constructor(indentString) {
    this._lastOriginalPosition = 0;

    this._formattedContent = [];
    this._formattedContentLength = 0;
    this._lastFormattedPosition = 0;

    /** @type {!{original: !Array.<number>, formatted: !Array.<number>}} */
    this._mapping = {original: [0], formatted: [0]};

    this._nestingLevel = 0;
    this._indentString = indentString;
    /** @type {!Map<number, string>} */
    this._cachedIndents = new Map();

    this._newLines = 0;
    this._softSpace = false;
    this._hardSpaces = 0;
    this._enforceSpaceBetweenWords = true;
  }

  /**
   * @param {boolean} value
   * @return {boolean}
   */
  setEnforceSpaceBetweenWords(value) {
    const oldValue = this._enforceSpaceBetweenWords;
    this._enforceSpaceBetweenWords = value;
    return oldValue;
  }

  /**
   * @param {string} token
   * @param {number} offset
   */
  addToken(token, offset) {
    const last = this._formattedContent.peekLast();
    if (this._enforceSpaceBetweenWords && last && /\w/.test(last[last.length - 1]) && /\w/.test(token))
      this.addSoftSpace();

    this._appendFormatting();

    // Insert token.
    this._addMappingIfNeeded(offset);
    this._addText(token);
  }

  addSoftSpace() {
    if (!this._hardSpaces)
      this._softSpace = true;
  }

  addHardSpace() {
    this._softSpace = false;
    ++this._hardSpaces;
  }

  /**
   * @param {boolean=} noSquash
   */
  addNewLine(noSquash) {
    // Avoid leading newlines.
    if (!this._formattedContentLength)
      return;
    if (noSquash)
      ++this._newLines;
    else
      this._newLines = this._newLines || 1;
  }

  increaseNestingLevel() {
    this._nestingLevel += 1;
  }

  decreaseNestingLevel() {
    if (this._nestingLevel > 0)
      this._nestingLevel -= 1;
  }

  _appendFormatting() {
    if (this._newLines) {
      for (let i = 0; i < this._newLines; ++i)
        this._addText('\n');
      this._addText(this._indent());
    } else if (this._softSpace) {
      this._addText(' ');
    }
    if (this._hardSpaces) {
      for (let i = 0; i < this._hardSpaces; ++i)
        this._addText(' ');
    }
    this._newLines = 0;
    this._softSpace = false;
    this._hardSpaces = 0;
  }

  /**
   * @return {string}
   */
  content() {
    return this._formattedContent.join('') + (this._newLines ? '\n' : '');
  }

  /**
   * @return {!{original: !Array.<number>, formatted: !Array.<number>}}
   */
  mapping() {
    return this._mapping;
  }

  /**
   * @return {string}
   */
  _indent() {
    const cachedValue = this._cachedIndents.get(this._nestingLevel);
    if (cachedValue)
      return cachedValue;

    let fullIndent = '';
    for (let i = 0; i < this._nestingLevel; ++i)
      fullIndent += this._indentString;

    // Cache a maximum of 20 nesting level indents.
    if (this._nestingLevel <= 20)
      this._cachedIndents.set(this._nestingLevel, fullIndent);
    return fullIndent;
  }

  /**
   * @param {string} text
   */
  _addText(text) {
    this._formattedContent.push(text);
    this._formattedContentLength += text.length;
  }

  /**
   * @param {number} originalPosition
   */
  _addMappingIfNeeded(originalPosition) {
    if (originalPosition - this._lastOriginalPosition === this._formattedContentLength - this._lastFormattedPosition)
      return;
    this._mapping.original.push(originalPosition);
    this._lastOriginalPosition = originalPosition;
    this._mapping.formatted.push(this._formattedContentLength);
    this._lastFormattedPosition = this._formattedContentLength;
  }
};
