// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
FormatterWorker.AcornTokenizer = class {
  /**
   * @param {string} content
   */
  constructor(content) {
    this._content = content;
    this._comments = [];
    this._tokenizer = acorn.tokenizer(this._content, {ecmaVersion: 8, onComment: this._comments});
    this._textCursor = new TextUtils.TextCursor(this._content.computeLineEndings());
    this._tokenLineStart = 0;
    this._tokenLineEnd = 0;
    this._nextTokenInternal();
  }

  /**
   * @param {!Acorn.TokenOrComment} token
   * @param {string=} values
   * @return {boolean}
   */
  static punctuator(token, values) {
    return token.type !== acorn.tokTypes.num && token.type !== acorn.tokTypes.regexp &&
        token.type !== acorn.tokTypes.string && token.type !== acorn.tokTypes.name && !token.type.keyword &&
        (!values || (token.type.label.length === 1 && values.indexOf(token.type.label) !== -1));
  }

  /**
   * @param {!Acorn.TokenOrComment} token
   * @param {string=} keyword
   * @return {boolean}
   */
  static keyword(token, keyword) {
    return !!token.type.keyword && token.type !== acorn.tokTypes['_true'] && token.type !== acorn.tokTypes['_false'] &&
        token.type !== acorn.tokTypes['_null'] && (!keyword || token.type.keyword === keyword);
  }

  /**
   * @param {!Acorn.TokenOrComment} token
   * @param {string=} identifier
   * @return {boolean}
   */
  static identifier(token, identifier) {
    return token.type === acorn.tokTypes.name && (!identifier || token.value === identifier);
  }

  /**
   * @param {!Acorn.TokenOrComment} token
   * @return {boolean}
   */
  static lineComment(token) {
    return token.type === 'Line';
  }

  /**
   * @param {!Acorn.TokenOrComment} token
   * @return {boolean}
   */
  static blockComment(token) {
    return token.type === 'Block';
  }

  /**
   * @return {!Acorn.TokenOrComment}
   */
  _nextTokenInternal() {
    if (this._comments.length)
      return this._comments.shift();
    const token = this._bufferedToken;

    this._bufferedToken = this._tokenizer.getToken();
    return token;
  }

  /**
   * @return {?Acorn.TokenOrComment}
   */
  nextToken() {
    const token = this._nextTokenInternal();
    if (token.type === acorn.tokTypes.eof)
      return null;

    this._textCursor.advance(token.start);
    this._tokenLineStart = this._textCursor.lineNumber();
    this._tokenColumnStart = this._textCursor.columnNumber();

    this._textCursor.advance(token.end);
    this._tokenLineEnd = this._textCursor.lineNumber();
    return token;
  }

  /**
   * @return {?Acorn.TokenOrComment}
   */
  peekToken() {
    if (this._comments.length)
      return this._comments[0];
    return this._bufferedToken.type !== acorn.tokTypes.eof ? this._bufferedToken : null;
  }

  /**
   * @return {number}
   */
  tokenLineStart() {
    return this._tokenLineStart;
  }

  /**
   * @return {number}
   */
  tokenLineEnd() {
    return this._tokenLineEnd;
  }

  /**
   * @return {number}
   */
  tokenColumnStart() {
    return this._tokenColumnStart;
  }
};
