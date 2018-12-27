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

/**
 * @unrestricted
 */
TextUtils.TextRange = class {
  /**
   * @param {number} startLine
   * @param {number} startColumn
   * @param {number} endLine
   * @param {number} endColumn
   */
  constructor(startLine, startColumn, endLine, endColumn) {
    this.startLine = startLine;
    this.startColumn = startColumn;
    this.endLine = endLine;
    this.endColumn = endColumn;
  }

  /**
   * @param {number} line
   * @param {number} column
   * @return {!TextUtils.TextRange}
   */
  static createFromLocation(line, column) {
    return new TextUtils.TextRange(line, column, line, column);
  }

  /**
   * @param {!Object} serializedTextRange
   * @return {!TextUtils.TextRange}
   */
  static fromObject(serializedTextRange) {
    return new TextUtils.TextRange(
        serializedTextRange.startLine, serializedTextRange.startColumn, serializedTextRange.endLine,
        serializedTextRange.endColumn);
  }

  /**
   * @param {!TextUtils.TextRange} range1
   * @param {!TextUtils.TextRange} range2
   * @return {number}
   */
  static comparator(range1, range2) {
    return range1.compareTo(range2);
  }

  /**
   * @param {!TextUtils.TextRange} oldRange
   * @param {string} newText
   * @return {!TextUtils.TextRange}
   */
  static fromEdit(oldRange, newText) {
    let endLine = oldRange.startLine;
    let endColumn = oldRange.startColumn + newText.length;
    const lineEndings = newText.computeLineEndings();
    if (lineEndings.length > 1) {
      endLine = oldRange.startLine + lineEndings.length - 1;
      const len = lineEndings.length;
      endColumn = lineEndings[len - 1] - lineEndings[len - 2] - 1;
    }
    return new TextUtils.TextRange(oldRange.startLine, oldRange.startColumn, endLine, endColumn);
  }

  /**
   * @return {boolean}
   */
  isEmpty() {
    return this.startLine === this.endLine && this.startColumn === this.endColumn;
  }

  /**
   * @param {!TextUtils.TextRange} range
   * @return {boolean}
   */
  immediatelyPrecedes(range) {
    if (!range)
      return false;
    return this.endLine === range.startLine && this.endColumn === range.startColumn;
  }

  /**
   * @param {!TextUtils.TextRange} range
   * @return {boolean}
   */
  immediatelyFollows(range) {
    if (!range)
      return false;
    return range.immediatelyPrecedes(this);
  }

  /**
   * @param {!TextUtils.TextRange} range
   * @return {boolean}
   */
  follows(range) {
    return (range.endLine === this.startLine && range.endColumn <= this.startColumn) || range.endLine < this.startLine;
  }

  /**
   * @return {number}
   */
  get linesCount() {
    return this.endLine - this.startLine;
  }

  /**
   * @return {!TextUtils.TextRange}
   */
  collapseToEnd() {
    return new TextUtils.TextRange(this.endLine, this.endColumn, this.endLine, this.endColumn);
  }

  /**
   * @return {!TextUtils.TextRange}
   */
  collapseToStart() {
    return new TextUtils.TextRange(this.startLine, this.startColumn, this.startLine, this.startColumn);
  }

  /**
   * @return {!TextUtils.TextRange}
   */
  normalize() {
    if (this.startLine > this.endLine || (this.startLine === this.endLine && this.startColumn > this.endColumn))
      return new TextUtils.TextRange(this.endLine, this.endColumn, this.startLine, this.startColumn);
    else
      return this.clone();
  }

  /**
   * @return {!TextUtils.TextRange}
   */
  clone() {
    return new TextUtils.TextRange(this.startLine, this.startColumn, this.endLine, this.endColumn);
  }

  /**
   * @return {!{startLine: number, startColumn: number, endLine: number, endColumn: number}}
   */
  serializeToObject() {
    const serializedTextRange = {};
    serializedTextRange.startLine = this.startLine;
    serializedTextRange.startColumn = this.startColumn;
    serializedTextRange.endLine = this.endLine;
    serializedTextRange.endColumn = this.endColumn;
    return serializedTextRange;
  }

  /**
   * @param {!TextUtils.TextRange} other
   * @return {number}
   */
  compareTo(other) {
    if (this.startLine > other.startLine)
      return 1;
    if (this.startLine < other.startLine)
      return -1;
    if (this.startColumn > other.startColumn)
      return 1;
    if (this.startColumn < other.startColumn)
      return -1;
    return 0;
  }

  /**
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {number}
   */
  compareToPosition(lineNumber, columnNumber) {
    if (lineNumber < this.startLine || (lineNumber === this.startLine && columnNumber < this.startColumn))
      return -1;
    if (lineNumber > this.endLine || (lineNumber === this.endLine && columnNumber > this.endColumn))
      return 1;
    return 0;
  }

  /**
   * @param {!TextUtils.TextRange} other
   * @return {boolean}
   */
  equal(other) {
    return this.startLine === other.startLine && this.endLine === other.endLine &&
        this.startColumn === other.startColumn && this.endColumn === other.endColumn;
  }

  /**
   * @param {number} line
   * @param {number} column
   * @return {!TextUtils.TextRange}
   */
  relativeTo(line, column) {
    const relative = this.clone();

    if (this.startLine === line)
      relative.startColumn -= column;
    if (this.endLine === line)
      relative.endColumn -= column;

    relative.startLine -= line;
    relative.endLine -= line;
    return relative;
  }

  /**
   * @param {number} line
   * @param {number} column
   * @return {!TextUtils.TextRange}
   */
  relativeFrom(line, column) {
    const relative = this.clone();

    if (this.startLine === 0)
      relative.startColumn += column;
    if (this.endLine === 0)
      relative.endColumn += column;

    relative.startLine += line;
    relative.endLine += line;
    return relative;
  }

  /**
   * @param {!TextUtils.TextRange} originalRange
   * @param {!TextUtils.TextRange} editedRange
   * @return {!TextUtils.TextRange}
   */
  rebaseAfterTextEdit(originalRange, editedRange) {
    console.assert(originalRange.startLine === editedRange.startLine);
    console.assert(originalRange.startColumn === editedRange.startColumn);
    const rebase = this.clone();
    if (!this.follows(originalRange))
      return rebase;
    const lineDelta = editedRange.endLine - originalRange.endLine;
    const columnDelta = editedRange.endColumn - originalRange.endColumn;
    rebase.startLine += lineDelta;
    rebase.endLine += lineDelta;
    if (rebase.startLine === editedRange.endLine)
      rebase.startColumn += columnDelta;
    if (rebase.endLine === editedRange.endLine)
      rebase.endColumn += columnDelta;
    return rebase;
  }

  /**
   * @override
   * @return {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * @param {number} lineNumber
   * @param {number} columnNumber
   * @return {boolean}
   */
  containsLocation(lineNumber, columnNumber) {
    if (this.startLine === this.endLine)
      return this.startLine === lineNumber && this.startColumn <= columnNumber && columnNumber <= this.endColumn;
    if (this.startLine === lineNumber)
      return this.startColumn <= columnNumber;
    if (this.endLine === lineNumber)
      return columnNumber <= this.endColumn;
    return this.startLine < lineNumber && lineNumber < this.endLine;
  }
};


/**
 * @unrestricted
 */
TextUtils.SourceRange = class {
  /**
   * @param {number} offset
   * @param {number} length
   */
  constructor(offset, length) {
    this.offset = offset;
    this.length = length;
  }
};

/**
 * @unrestricted
 */
TextUtils.SourceEdit = class {
  /**
   * @param {string} sourceURL
   * @param {!TextUtils.TextRange} oldRange
   * @param {string} newText
   */
  constructor(sourceURL, oldRange, newText) {
    this.sourceURL = sourceURL;
    this.oldRange = oldRange;
    this.newText = newText;
  }

  /**
   * @param {!TextUtils.SourceEdit} edit1
   * @param {!TextUtils.SourceEdit} edit2
   * @return {number}
   */
  static comparator(edit1, edit2) {
    return TextUtils.TextRange.comparator(edit1.oldRange, edit2.oldRange);
  }

  /**
   * @return {!TextUtils.TextRange}
   */
  newRange() {
    return TextUtils.TextRange.fromEdit(this.oldRange, this.newText);
  }
};
