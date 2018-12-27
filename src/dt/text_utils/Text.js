// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @unrestricted
 */
TextUtils.Text = class {
  /**
   * @param {string} value
   */
  constructor(value) {
    this._value = value;
  }

  /**
   * @return {!Array<number>}
   */
  lineEndings() {
    if (!this._lineEndings)
      this._lineEndings = this._value.computeLineEndings();
    return this._lineEndings;
  }

  /**
   * @return {string}
   */
  value() {
    return this._value;
  }

  /**
   * @return {number}
   */
  lineCount() {
    const lineEndings = this.lineEndings();
    return lineEndings.length;
  }

  /**
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {number}
   */
  offsetFromPosition(lineNumber, columnNumber) {
    return (lineNumber ? this.lineEndings()[lineNumber - 1] + 1 : 0) + columnNumber;
  }

  /**
   * @param {number} offset
   * @return {!TextUtils.Text.Position}
   */
  positionFromOffset(offset) {
    const lineEndings = this.lineEndings();
    const lineNumber = lineEndings.lowerBound(offset);
    return {lineNumber: lineNumber, columnNumber: offset - (lineNumber && (lineEndings[lineNumber - 1] + 1))};
  }

  /**
   * @return {string}
   */
  lineAt(lineNumber) {
    const lineEndings = this.lineEndings();
    const lineStart = lineNumber > 0 ? lineEndings[lineNumber - 1] + 1 : 0;
    const lineEnd = lineEndings[lineNumber];
    let lineContent = this._value.substring(lineStart, lineEnd);
    if (lineContent.length > 0 && lineContent.charAt(lineContent.length - 1) === '\r')
      lineContent = lineContent.substring(0, lineContent.length - 1);
    return lineContent;
  }

  /**
   * @param {!TextUtils.TextRange} range
   * @return {!TextUtils.SourceRange}
   */
  toSourceRange(range) {
    const start = this.offsetFromPosition(range.startLine, range.startColumn);
    const end = this.offsetFromPosition(range.endLine, range.endColumn);
    return new TextUtils.SourceRange(start, end - start);
  }

  /**
   * @param {!TextUtils.SourceRange} sourceRange
   * @return {!TextUtils.TextRange}
   */
  toTextRange(sourceRange) {
    const cursor = new TextUtils.TextCursor(this.lineEndings());
    const result = TextUtils.TextRange.createFromLocation(0, 0);

    cursor.resetTo(sourceRange.offset);
    result.startLine = cursor.lineNumber();
    result.startColumn = cursor.columnNumber();

    cursor.advance(sourceRange.offset + sourceRange.length);
    result.endLine = cursor.lineNumber();
    result.endColumn = cursor.columnNumber();
    return result;
  }

  /**
   * @param {!TextUtils.TextRange} range
   * @param {string} replacement
   * @return {string}
   */
  replaceRange(range, replacement) {
    const sourceRange = this.toSourceRange(range);
    return this._value.substring(0, sourceRange.offset) + replacement +
        this._value.substring(sourceRange.offset + sourceRange.length);
  }

  /**
   * @param {!TextUtils.TextRange} range
   * @return {string}
   */
  extract(range) {
    const sourceRange = this.toSourceRange(range);
    return this._value.substr(sourceRange.offset, sourceRange.length);
  }
};

/** @typedef {{lineNumber: number, columnNumber: number}} */
TextUtils.Text.Position;

/**
 * @unrestricted
 */
TextUtils.TextCursor = class {
  /**
   * @param {!Array<number>} lineEndings
   */
  constructor(lineEndings) {
    this._lineEndings = lineEndings;
    this._offset = 0;
    this._lineNumber = 0;
    this._columnNumber = 0;
  }

  /**
   * @param {number} offset
   */
  advance(offset) {
    this._offset = offset;
    while (this._lineNumber < this._lineEndings.length && this._lineEndings[this._lineNumber] < this._offset)
      ++this._lineNumber;
    this._columnNumber = this._lineNumber ? this._offset - this._lineEndings[this._lineNumber - 1] - 1 : this._offset;
  }

  /**
   * @return {number}
   */
  offset() {
    return this._offset;
  }

  /**
   * @param {number} offset
   */
  resetTo(offset) {
    this._offset = offset;
    this._lineNumber = this._lineEndings.lowerBound(offset);
    this._columnNumber = this._lineNumber ? this._offset - this._lineEndings[this._lineNumber - 1] - 1 : this._offset;
  }

  /**
   * @return {number}
   */
  lineNumber() {
    return this._lineNumber;
  }

  /**
   * @return {number}
   */
  columnNumber() {
    return this._columnNumber;
  }
};
