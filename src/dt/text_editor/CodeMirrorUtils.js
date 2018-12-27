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

TextEditor.CodeMirrorUtils = {};
/**
 * @param {!TextUtils.TextRange} range
 * @return {!{start: !CodeMirror.Pos, end: !CodeMirror.Pos}}
 */
TextEditor.CodeMirrorUtils.toPos = function(range) {
  return {
    start: new CodeMirror.Pos(range.startLine, range.startColumn),
    end: new CodeMirror.Pos(range.endLine, range.endColumn)
  };
};

/**
 * @param {!CodeMirror.Pos} start
 * @param {!CodeMirror.Pos} end
 * @return {!TextUtils.TextRange}
 */
TextEditor.CodeMirrorUtils.toRange = function(start, end) {
  return new TextUtils.TextRange(start.line, start.ch, end.line, end.ch);
};

/**
 * @param {!CodeMirror.ChangeObject} changeObject
 * @return {{oldRange: !TextUtils.TextRange, newRange: !TextUtils.TextRange}}
 */
TextEditor.CodeMirrorUtils.changeObjectToEditOperation = function(changeObject) {
  const oldRange = TextEditor.CodeMirrorUtils.toRange(changeObject.from, changeObject.to);
  const newRange = oldRange.clone();
  const linesAdded = changeObject.text.length;
  if (linesAdded === 0) {
    newRange.endLine = newRange.startLine;
    newRange.endColumn = newRange.startColumn;
  } else if (linesAdded === 1) {
    newRange.endLine = newRange.startLine;
    newRange.endColumn = newRange.startColumn + changeObject.text[0].length;
  } else {
    newRange.endLine = newRange.startLine + linesAdded - 1;
    newRange.endColumn = changeObject.text[linesAdded - 1].length;
  }
  return {oldRange: oldRange, newRange: newRange};
};

/**
 * @param {!CodeMirror} codeMirror
 * @param {number} linesCount
 * @return {!Array.<string>}
 */
TextEditor.CodeMirrorUtils.pullLines = function(codeMirror, linesCount) {
  const lines = [];
  codeMirror.eachLine(0, linesCount, onLineHandle);
  return lines;

  /**
   * @param {!{text: string}} lineHandle
   */
  function onLineHandle(lineHandle) {
    lines.push(lineHandle.text);
  }
};

/**
 * @implements {TextUtils.TokenizerFactory}
 * @unrestricted
 */
TextEditor.CodeMirrorUtils.TokenizerFactory = class {
  /**
   * @override
   * @param {string} mimeType
   * @return {function(string, function(string, ?string, number, number))}
   */
  createTokenizer(mimeType) {
    const mode = CodeMirror.getMode({indentUnit: 2}, mimeType);
    const state = CodeMirror.startState(mode);
    function tokenize(line, callback) {
      const stream = new CodeMirror.StringStream(line);
      while (!stream.eol()) {
        const style = mode.token(stream, state);
        const value = stream.current();
        callback(value, style, stream.start, stream.start + value.length);
        stream.start = stream.pos;
      }
    }
    return tokenize;
  }
};
