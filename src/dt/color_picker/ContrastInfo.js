// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

ColorPicker.ContrastInfo = class extends Common.Object {
  constructor() {
    super();

    /** @type {?Array<number>} */
    this._hsva = null;

    /** @type {?Common.Color} */
    this._fgColor = null;

    /** @type {?Common.Color} */
    this._bgColor = null;

    /** @type {?number} */
    this._contrastRatio = null;

    /** @type {?Object<string, number>} */
    this._contrastRatioThresholds = null;

    /** @type {string} */
    this._colorString = '';

    /** @type {boolean} */
    this._isNull = true;
  }

  /**
   * @param {?SDK.CSSModel.ContrastInfo} contrastInfo
   */
  update(contrastInfo) {
    this._isNull = true;
    this._contrastRatio = null;
    this._contrastRatioThresholds = null;
    this._bgColor = null;

    if (contrastInfo.computedFontSize && contrastInfo.computedFontWeight && contrastInfo.computedBodyFontSize) {
      this._isNull = false;
      const isLargeFont = ColorPicker.ContrastInfo.computeIsLargeFont(
          contrastInfo.computedFontSize, contrastInfo.computedFontWeight, contrastInfo.computedBodyFontSize);

      this._contrastRatioThresholds =
          ColorPicker.ContrastInfo._ContrastThresholds[(isLargeFont ? 'largeFont' : 'normalFont')];
    }

    if (contrastInfo.backgroundColors && contrastInfo.backgroundColors.length === 1) {
      const bgColorText = contrastInfo.backgroundColors[0];
      const bgColor = Common.Color.parse(bgColorText);
      if (bgColor)
        this._setBgColorInternal(bgColor);
    }

    this.dispatchEventToListeners(ColorPicker.ContrastInfo.Events.ContrastInfoUpdated);
  }

  /**
   * @return {boolean}
   */
  isNull() {
    return this._isNull;
  }

  /**
   * @param {!Array<number>} hsva
   * @param {string} colorString
   */
  setColor(hsva, colorString) {
    this._hsva = hsva;
    this._fgColor = Common.Color.fromHSVA(hsva);
    this._colorString = colorString;
    this._updateContrastRatio();
    this.dispatchEventToListeners(ColorPicker.ContrastInfo.Events.ContrastInfoUpdated);
  }

  /**
   * @return {?number}
   */
  contrastRatio() {
    return this._contrastRatio;
  }

  /**
   * @return {string}
   */
  colorString() {
    return this._colorString;
  }

  /**
   * @return {?Array<number>}
   */
  hsva() {
    return this._hsva;
  }

  /**
   * @param {!Common.Color} bgColor
   */
  setBgColor(bgColor) {
    this._setBgColorInternal(bgColor);
    this.dispatchEventToListeners(ColorPicker.ContrastInfo.Events.ContrastInfoUpdated);
  }

  /**
   * @param {!Common.Color} bgColor
   */
  _setBgColorInternal(bgColor) {
    this._bgColor = bgColor;

    if (!this._fgColor)
      return;

    const fgRGBA = this._fgColor.rgba();

    // If we have a semi-transparent background color over an unknown
    // background, draw the line for the "worst case" scenario: where
    // the unknown background is the same color as the text.
    if (bgColor.hasAlpha) {
      const blendedRGBA = [];
      Common.Color.blendColors(bgColor.rgba(), fgRGBA, blendedRGBA);
      this._bgColor = new Common.Color(blendedRGBA, Common.Color.Format.RGBA);
    }

    this._contrastRatio = Common.Color.calculateContrastRatio(fgRGBA, this._bgColor.rgba());
  }

  /**
   * @return {?Common.Color}
   */
  bgColor() {
    return this._bgColor;
  }

  _updateContrastRatio() {
    if (!this._bgColor || !this._fgColor)
      return;
    this._contrastRatio = Common.Color.calculateContrastRatio(this._fgColor.rgba(), this._bgColor.rgba());
  }

  /**
   * @param {string} level
   * @return {?number}
   */
  contrastRatioThreshold(level) {
    if (!this._contrastRatioThresholds)
      return null;
    return this._contrastRatioThresholds[level];
  }

  /**
   * @param {string} fontSize
   * @param {string} fontWeight
   * @param {?string} bodyFontSize
   * @return {boolean}
   */
  static computeIsLargeFont(fontSize, fontWeight, bodyFontSize) {
    const boldWeights = ['bold', 'bolder', '600', '700', '800', '900'];

    const fontSizePx = parseFloat(fontSize.replace('px', ''));
    const isBold = (boldWeights.indexOf(fontWeight) !== -1);

    const fontSizePt = fontSizePx * 72 / 96;
    if (isBold)
      return fontSizePt >= 14;
    else
      return fontSizePt >= 18;
  }
};

/** @enum {symbol} */
ColorPicker.ContrastInfo.Events = {
  ContrastInfoUpdated: Symbol('ContrastInfoUpdated')
};

ColorPicker.ContrastInfo._ContrastThresholds = {
  largeFont: {aa: 3.0, aaa: 4.5},
  normalFont: {aa: 4.5, aaa: 7.0}
};
