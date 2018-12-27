// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
InlineEditor.ColorSwatch = class extends HTMLSpanElement {
  constructor() {
    super();
  }

  /**
   * @return {!InlineEditor.ColorSwatch}
   */
  static create() {
    if (!InlineEditor.ColorSwatch._constructor) {
      InlineEditor.ColorSwatch._constructor =
          UI.registerCustomElement('span', 'color-swatch', InlineEditor.ColorSwatch.prototype);
    }


    return /** @type {!InlineEditor.ColorSwatch} */ (new InlineEditor.ColorSwatch._constructor());
  }

  /**
   * @param {!Common.Color} color
   * @param {string} curFormat
   */
  static _nextColorFormat(color, curFormat) {
    // The format loop is as follows:
    // * original
    // * rgb(a)
    // * hsl(a)
    // * nickname (if the color has a nickname)
    // * shorthex (if has short hex)
    // * hex
    const cf = Common.Color.Format;

    switch (curFormat) {
      case cf.Original:
        return !color.hasAlpha() ? cf.RGB : cf.RGBA;

      case cf.RGB:
      case cf.RGBA:
        return !color.hasAlpha() ? cf.HSL : cf.HSLA;

      case cf.HSL:
      case cf.HSLA:
        if (color.nickname())
          return cf.Nickname;
        return color.detectHEXFormat();

      case cf.ShortHEX:
        return cf.HEX;

      case cf.ShortHEXA:
        return cf.HEXA;

      case cf.HEXA:
      case cf.HEX:
        return cf.Original;

      case cf.Nickname:
        return color.detectHEXFormat();

      default:
        return cf.RGBA;
    }
  }

  /**
   * @return {!Common.Color} color
   */
  color() {
    return this._color;
  }

  /**
   * @param {!Common.Color} color
   */
  setColor(color) {
    this._color = color;
    this._format = this._color.format();
    const colorString = /** @type {string} */ (this._color.asString(this._format));
    this.setText(colorString);
    this._swatchInner.style.backgroundColor = colorString;
  }

  /**
   * @param {boolean} hide
   */
  hideText(hide) {
    this._colorValueElement.hidden = hide;
  }

  /**
   * @param {string} text
   * @param {string=} tooltip
   */
  setText(text, tooltip) {
    this._colorValueElement.textContent = text;
    this._colorValueElement.title = tooltip;
  }

  /**
   * @return {!Common.Color.Format}
   */
  format() {
    return this._format;
  }

  /**
   * @param {!Common.Color.Format} format
   */
  setFormat(format) {
    this._format = format;
    this.setText(this._color.asString(this._format));
  }

  toggleNextFormat() {
    let currentValue;
    do {
      this._format = InlineEditor.ColorSwatch._nextColorFormat(this._color, this._format);
      currentValue = this._color.asString(this._format);
    } while (currentValue === this._colorValueElement.textContent);
    this.setText(currentValue);
  }

  /**
   * @return {!Element}
   */
  iconElement() {
    return this._iconElement;
  }

  /**
   * @override
   */
  createdCallback() {
    const root = UI.createShadowRootWithCoreStyles(this, 'inline_editor/colorSwatch.css');

    this._iconElement = root.createChild('span', 'color-swatch');
    this._iconElement.title = Common.UIString('Shift-click to change color format');
    this._swatchInner = this._iconElement.createChild('span', 'color-swatch-inner');
    this._swatchInner.addEventListener('dblclick', e => e.consume(), false);
    this._swatchInner.addEventListener('mousedown', e => e.consume(), false);
    this._swatchInner.addEventListener('click', this._handleClick.bind(this), true);

    root.createChild('content');
    this._colorValueElement = this.createChild('span');
  }

  /**
   * @param {!Event} event
   */
  _handleClick(event) {
    if (!event.shiftKey)
      return;
    event.target.parentNode.parentNode.host.toggleNextFormat();
    event.consume(true);
  }
};


/**
 * @unrestricted
 */
InlineEditor.BezierSwatch = class extends HTMLSpanElement {
  constructor() {
    super();
  }

  /**
   * @return {!InlineEditor.BezierSwatch}
   */
  static create() {
    if (!InlineEditor.BezierSwatch._constructor) {
      InlineEditor.BezierSwatch._constructor =
          UI.registerCustomElement('span', 'bezier-swatch', InlineEditor.BezierSwatch.prototype);
    }


    return /** @type {!InlineEditor.BezierSwatch} */ (new InlineEditor.BezierSwatch._constructor());
  }

  /**
   * @return {string}
   */
  bezierText() {
    return this._textElement.textContent;
  }

  /**
   * @param {string} text
   */
  setBezierText(text) {
    this._textElement.textContent = text;
  }

  /**
   * @param {boolean} hide
   */
  hideText(hide) {
    this._textElement.hidden = hide;
  }

  /**
   * @return {!Element}
   */
  iconElement() {
    return this._iconElement;
  }

  /**
   * @override
   */
  createdCallback() {
    const root = UI.createShadowRootWithCoreStyles(this, 'inline_editor/bezierSwatch.css');
    this._iconElement = UI.Icon.create('smallicon-bezier', 'bezier-swatch-icon');
    root.appendChild(this._iconElement);
    this._textElement = this.createChild('span');
    root.createChild('content');
  }
};

/**
 * @unrestricted
 */
InlineEditor.CSSShadowSwatch = class extends HTMLSpanElement {
  constructor() {
    super();
  }

  /**
   * @return {!InlineEditor.CSSShadowSwatch}
   */
  static create() {
    if (!InlineEditor.CSSShadowSwatch._constructor) {
      InlineEditor.CSSShadowSwatch._constructor =
          UI.registerCustomElement('span', 'css-shadow-swatch', InlineEditor.CSSShadowSwatch.prototype);
    }

    return /** @type {!InlineEditor.CSSShadowSwatch} */ (new InlineEditor.CSSShadowSwatch._constructor());
  }

  /**
   * @return {!InlineEditor.CSSShadowModel} cssShadowModel
   */
  model() {
    return this._model;
  }

  /**
   * @param {!InlineEditor.CSSShadowModel} model
   */
  setCSSShadow(model) {
    this._model = model;
    this._contentElement.removeChildren();
    const results = TextUtils.TextUtils.splitStringByRegexes(model.asCSSText(), [/inset/g, Common.Color.Regex]);
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.regexIndex === 1) {
        if (!this._colorSwatch)
          this._colorSwatch = InlineEditor.ColorSwatch.create();
        this._colorSwatch.setColor(model.color());
        this._contentElement.appendChild(this._colorSwatch);
      } else {
        this._contentElement.appendChild(createTextNode(result.value));
      }
    }
  }

  /**
   * @param {boolean} hide
   */
  hideText(hide) {
    this._contentElement.hidden = hide;
  }

  /**
   * @return {!Element}
   */
  iconElement() {
    return this._iconElement;
  }

  /**
   * @return {?InlineEditor.ColorSwatch}
   */
  colorSwatch() {
    return this._colorSwatch;
  }

  /**
   * @override
   */
  createdCallback() {
    const root = UI.createShadowRootWithCoreStyles(this, 'inline_editor/cssShadowSwatch.css');
    this._iconElement = UI.Icon.create('smallicon-shadow', 'shadow-swatch-icon');
    root.appendChild(this._iconElement);
    root.createChild('content');
    this._contentElement = this.createChild('span');
  }
};
