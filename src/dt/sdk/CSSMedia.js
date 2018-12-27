// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
SDK.CSSMediaQuery = class {
  /**
   * @param {!Protocol.CSS.MediaQuery} payload
   */
  constructor(payload) {
    this._active = payload.active;
    this._expressions = [];
    for (let j = 0; j < payload.expressions.length; ++j)
      this._expressions.push(SDK.CSSMediaQueryExpression.parsePayload(payload.expressions[j]));
  }

  /**
   * @param {!Protocol.CSS.MediaQuery} payload
   * @return {!SDK.CSSMediaQuery}
   */
  static parsePayload(payload) {
    return new SDK.CSSMediaQuery(payload);
  }

  /**
   * @return {boolean}
   */
  active() {
    return this._active;
  }

  /**
   * @return {!Array.<!SDK.CSSMediaQueryExpression>}
   */
  expressions() {
    return this._expressions;
  }
};


/**
 * @unrestricted
 */
SDK.CSSMediaQueryExpression = class {
  /**
   * @param {!Protocol.CSS.MediaQueryExpression} payload
   */
  constructor(payload) {
    this._value = payload.value;
    this._unit = payload.unit;
    this._feature = payload.feature;
    this._valueRange = payload.valueRange ? TextUtils.TextRange.fromObject(payload.valueRange) : null;
    this._computedLength = payload.computedLength || null;
  }

  /**
   * @param {!Protocol.CSS.MediaQueryExpression} payload
   * @return {!SDK.CSSMediaQueryExpression}
   */
  static parsePayload(payload) {
    return new SDK.CSSMediaQueryExpression(payload);
  }

  /**
   * @return {number}
   */
  value() {
    return this._value;
  }

  /**
   * @return {string}
   */
  unit() {
    return this._unit;
  }

  /**
   * @return {string}
   */
  feature() {
    return this._feature;
  }

  /**
   * @return {?TextUtils.TextRange}
   */
  valueRange() {
    return this._valueRange;
  }

  /**
   * @return {?number}
   */
  computedLength() {
    return this._computedLength;
  }
};


/**
 * @unrestricted
 */
SDK.CSSMedia = class {
  /**
   * @param {!SDK.CSSModel} cssModel
   * @param {!Protocol.CSS.CSSMedia} payload
   */
  constructor(cssModel, payload) {
    this._cssModel = cssModel;
    this._reinitialize(payload);
  }

  /**
   * @param {!SDK.CSSModel} cssModel
   * @param {!Protocol.CSS.CSSMedia} payload
   * @return {!SDK.CSSMedia}
   */
  static parsePayload(cssModel, payload) {
    return new SDK.CSSMedia(cssModel, payload);
  }

  /**
   * @param {!SDK.CSSModel} cssModel
   * @param {!Array.<!Protocol.CSS.CSSMedia>} payload
   * @return {!Array.<!SDK.CSSMedia>}
   */
  static parseMediaArrayPayload(cssModel, payload) {
    const result = [];
    for (let i = 0; i < payload.length; ++i)
      result.push(SDK.CSSMedia.parsePayload(cssModel, payload[i]));
    return result;
  }

  /**
   * @param {!Protocol.CSS.CSSMedia} payload
   */
  _reinitialize(payload) {
    this.text = payload.text;
    this.source = payload.source;
    this.sourceURL = payload.sourceURL || '';
    this.range = payload.range ? TextUtils.TextRange.fromObject(payload.range) : null;
    this.styleSheetId = payload.styleSheetId;
    this.mediaList = null;
    if (payload.mediaList) {
      this.mediaList = [];
      for (let i = 0; i < payload.mediaList.length; ++i)
        this.mediaList.push(SDK.CSSMediaQuery.parsePayload(payload.mediaList[i]));
    }
  }

  /**
   * @param {!SDK.CSSModel.Edit} edit
   */
  rebase(edit) {
    if (this.styleSheetId !== edit.styleSheetId || !this.range)
      return;
    if (edit.oldRange.equal(this.range))
      this._reinitialize(/** @type {!Protocol.CSS.CSSMedia} */ (edit.payload));
    else
      this.range = this.range.rebaseAfterTextEdit(edit.oldRange, edit.newRange);
  }

  /**
   * @param {!SDK.CSSMedia} other
   * @return {boolean}
   */
  equal(other) {
    if (!this.styleSheetId || !this.range || !other.range)
      return false;
    return this.styleSheetId === other.styleSheetId && this.range.equal(other.range);
  }

  /**
   * @return {boolean}
   */
  active() {
    if (!this.mediaList)
      return true;
    for (let i = 0; i < this.mediaList.length; ++i) {
      if (this.mediaList[i].active())
        return true;
    }
    return false;
  }

  /**
   * @return {number|undefined}
   */
  lineNumberInSource() {
    if (!this.range)
      return undefined;
    const header = this.header();
    if (!header)
      return undefined;
    return header.lineNumberInSource(this.range.startLine);
  }

  /**
   * @return {number|undefined}
   */
  columnNumberInSource() {
    if (!this.range)
      return undefined;
    const header = this.header();
    if (!header)
      return undefined;
    return header.columnNumberInSource(this.range.startLine, this.range.startColumn);
  }

  /**
   * @return {?SDK.CSSStyleSheetHeader}
   */
  header() {
    return this.styleSheetId ? this._cssModel.styleSheetHeaderForId(this.styleSheetId) : null;
  }

  /**
   * @return {?SDK.CSSLocation}
   */
  rawLocation() {
    const header = this.header();
    if (!header || this.lineNumberInSource() === undefined)
      return null;
    const lineNumber = Number(this.lineNumberInSource());
    return new SDK.CSSLocation(header, lineNumber, this.columnNumberInSource());
  }
};

SDK.CSSMedia.Source = {
  LINKED_SHEET: 'linkedSheet',
  INLINE_SHEET: 'inlineSheet',
  MEDIA_RULE: 'mediaRule',
  IMPORT_RULE: 'importRule'
};
