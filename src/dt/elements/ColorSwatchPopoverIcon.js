// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Elements.BezierPopoverIcon = class {
  /**
   * @param {!Elements.StylePropertyTreeElement} treeElement
   * @param {!InlineEditor.SwatchPopoverHelper} swatchPopoverHelper
   * @param {!InlineEditor.BezierSwatch} swatch
   */
  constructor(treeElement, swatchPopoverHelper, swatch) {
    this._treeElement = treeElement;
    this._swatchPopoverHelper = swatchPopoverHelper;
    this._swatch = swatch;

    this._swatch.iconElement().title = Common.UIString('Open cubic bezier editor.');
    this._swatch.iconElement().addEventListener('click', this._iconClick.bind(this), false);
    this._swatch.iconElement().addEventListener('mousedown', event => event.consume(), false);

    this._boundBezierChanged = this._bezierChanged.bind(this);
    this._boundOnScroll = this._onScroll.bind(this);
  }

  /**
   * @param {!Event} event
   */
  _iconClick(event) {
    event.consume(true);
    if (this._swatchPopoverHelper.isShowing()) {
      this._swatchPopoverHelper.hide(true);
      return;
    }

    this._bezierEditor = new InlineEditor.BezierEditor();
    let cubicBezier = UI.Geometry.CubicBezier.parse(this._swatch.bezierText());
    if (!cubicBezier) {
      cubicBezier =
          /** @type {!UI.Geometry.CubicBezier} */ (UI.Geometry.CubicBezier.parse('linear'));
    }
    this._bezierEditor.setBezier(cubicBezier);
    this._bezierEditor.addEventListener(InlineEditor.BezierEditor.Events.BezierChanged, this._boundBezierChanged);
    this._swatchPopoverHelper.show(this._bezierEditor, this._swatch.iconElement(), this._onPopoverHidden.bind(this));
    this._scrollerElement = this._swatch.enclosingNodeOrSelfWithClass('style-panes-wrapper');
    if (this._scrollerElement)
      this._scrollerElement.addEventListener('scroll', this._boundOnScroll, false);

    this._originalPropertyText = this._treeElement.property.propertyText;
    this._treeElement.parentPane().setEditingStyle(true);
    const uiLocation = Bindings.cssWorkspaceBinding.propertyUILocation(this._treeElement.property, false /* forName */);
    if (uiLocation)
      Common.Revealer.reveal(uiLocation, true /* omitFocus */);
  }

  /**
   * @param {!Common.Event} event
   */
  _bezierChanged(event) {
    this._swatch.setBezierText(/** @type {string} */ (event.data));
    this._treeElement.applyStyleText(this._treeElement.renderedPropertyText(), false);
  }

  /**
   * @param {!Event} event
   */
  _onScroll(event) {
    this._swatchPopoverHelper.reposition();
  }

  /**
   * @param {boolean} commitEdit
   */
  _onPopoverHidden(commitEdit) {
    if (this._scrollerElement)
      this._scrollerElement.removeEventListener('scroll', this._boundOnScroll, false);

    this._bezierEditor.removeEventListener(InlineEditor.BezierEditor.Events.BezierChanged, this._boundBezierChanged);
    delete this._bezierEditor;

    const propertyText = commitEdit ? this._treeElement.renderedPropertyText() : this._originalPropertyText;
    this._treeElement.applyStyleText(propertyText, true);
    this._treeElement.parentPane().setEditingStyle(false);
    delete this._originalPropertyText;
  }
};

/**
 * @unrestricted
 */
Elements.ColorSwatchPopoverIcon = class {
  /**
   * @param {!Elements.StylePropertyTreeElement} treeElement
   * @param {!InlineEditor.SwatchPopoverHelper} swatchPopoverHelper
   * @param {!InlineEditor.ColorSwatch} swatch
   */
  constructor(treeElement, swatchPopoverHelper, swatch) {
    this._treeElement = treeElement;
    this._treeElement[Elements.ColorSwatchPopoverIcon._treeElementSymbol] = this;
    this._swatchPopoverHelper = swatchPopoverHelper;
    this._swatch = swatch;

    const shiftClickMessage = Common.UIString('Shift + Click to change color format.');
    this._swatch.iconElement().title = Common.UIString('Open color picker. %s', shiftClickMessage);
    this._swatch.iconElement().addEventListener('click', this._iconClick.bind(this));
    this._swatch.iconElement().addEventListener('mousedown', event => event.consume(), false);
    this._contrastInfo = null;

    this._boundSpectrumChanged = this._spectrumChanged.bind(this);
    this._boundOnScroll = this._onScroll.bind(this);
  }

  /**
   * @return {!ColorPicker.Spectrum.Palette}
   */
  _generateCSSVariablesPalette() {
    const matchedStyles = this._treeElement.matchedStyles();
    const style = this._treeElement.property.ownerStyle;
    const cssVariables = matchedStyles.availableCSSVariables(style);
    const colors = [];
    const colorNames = [];
    for (const cssVariable of cssVariables) {
      if (cssVariable === this._treeElement.property.name)
        continue;
      const value = matchedStyles.computeCSSVariable(style, cssVariable);
      if (!value)
        continue;
      const color = Common.Color.parse(value);
      if (!color)
        continue;
      colors.push(value);
      colorNames.push(cssVariable);
    }
    return {title: 'CSS Variables', mutable: false, matchUserFormat: true, colors: colors, colorNames: colorNames};
  }

  /**
   * @param {!Elements.StylePropertyTreeElement} treeElement
   * @return {?Elements.ColorSwatchPopoverIcon}
   */
  static forTreeElement(treeElement) {
    return treeElement[Elements.ColorSwatchPopoverIcon._treeElementSymbol] || null;
  }

  /**
   * @param {?SDK.CSSModel.ContrastInfo} contrastInfo
   */
  setContrastInfo(contrastInfo) {
    this._contrastInfo = contrastInfo;
    if (this._spectrum)
      this._spectrum.setContrastInfo(contrastInfo);
  }

  /**
   * @param {!Event} event
   */
  _iconClick(event) {
    event.consume(true);
    this.showPopover();
  }

  showPopover() {
    if (this._swatchPopoverHelper.isShowing()) {
      this._swatchPopoverHelper.hide(true);
      return;
    }

    const color = this._swatch.color();
    let format = this._swatch.format();
    if (format === Common.Color.Format.Original)
      format = color.format();
    this._spectrum = new ColorPicker.Spectrum();
    this._spectrum.setColor(color, format);
    this._spectrum.addPalette(this._generateCSSVariablesPalette());
    if (this._contrastInfo)
      this._spectrum.setContrastInfo(this._contrastInfo);

    this._spectrum.addEventListener(ColorPicker.Spectrum.Events.SizeChanged, this._spectrumResized, this);
    this._spectrum.addEventListener(ColorPicker.Spectrum.Events.ColorChanged, this._boundSpectrumChanged);
    this._swatchPopoverHelper.show(this._spectrum, this._swatch.iconElement(), this._onPopoverHidden.bind(this));
    this._scrollerElement = this._swatch.enclosingNodeOrSelfWithClass('style-panes-wrapper');
    if (this._scrollerElement)
      this._scrollerElement.addEventListener('scroll', this._boundOnScroll, false);

    this._originalPropertyText = this._treeElement.property.propertyText;
    this._treeElement.parentPane().setEditingStyle(true);
    const uiLocation = Bindings.cssWorkspaceBinding.propertyUILocation(this._treeElement.property, false /* forName */);
    if (uiLocation)
      Common.Revealer.reveal(uiLocation, true /* omitFocus */);
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
    const color = Common.Color.parse(/** @type {string} */ (event.data));
    if (!color)
      return;
    this._swatch.setColor(color);
    const colorName = this._spectrum.colorName();
    if (colorName && colorName.startsWith('--'))
      this._swatch.setText(`var(${colorName})`);

    this._treeElement.applyStyleText(this._treeElement.renderedPropertyText(), false);
  }

  /**
   * @param {!Event} event
   */
  _onScroll(event) {
    this._swatchPopoverHelper.reposition();
  }

  /**
   * @param {boolean} commitEdit
   */
  _onPopoverHidden(commitEdit) {
    if (this._scrollerElement)
      this._scrollerElement.removeEventListener('scroll', this._boundOnScroll, false);

    this._spectrum.removeEventListener(ColorPicker.Spectrum.Events.ColorChanged, this._boundSpectrumChanged);
    delete this._spectrum;

    const propertyText = commitEdit ? this._treeElement.renderedPropertyText() : this._originalPropertyText;
    this._treeElement.applyStyleText(propertyText, true);
    this._treeElement.parentPane().setEditingStyle(false);
    delete this._originalPropertyText;
  }
};

Elements.ColorSwatchPopoverIcon._treeElementSymbol = Symbol('Elements.ColorSwatchPopoverIcon._treeElementSymbol');


/**
 * @unrestricted
 */
Elements.ShadowSwatchPopoverHelper = class {
  /**
   * @param {!Elements.StylePropertyTreeElement} treeElement
   * @param {!InlineEditor.SwatchPopoverHelper} swatchPopoverHelper
   * @param {!InlineEditor.CSSShadowSwatch} shadowSwatch
   */
  constructor(treeElement, swatchPopoverHelper, shadowSwatch) {
    this._treeElement = treeElement;
    this._treeElement[Elements.ShadowSwatchPopoverHelper._treeElementSymbol] = this;
    this._swatchPopoverHelper = swatchPopoverHelper;
    this._shadowSwatch = shadowSwatch;
    this._iconElement = shadowSwatch.iconElement();

    this._iconElement.title = Common.UIString('Open shadow editor.');
    this._iconElement.addEventListener('click', this._iconClick.bind(this), false);
    this._iconElement.addEventListener('mousedown', event => event.consume(), false);

    this._boundShadowChanged = this._shadowChanged.bind(this);
    this._boundOnScroll = this._onScroll.bind(this);
  }

  /**
   * @param {!Elements.StylePropertyTreeElement} treeElement
   * @return {?Elements.ShadowSwatchPopoverHelper}
   */
  static forTreeElement(treeElement) {
    return treeElement[Elements.ShadowSwatchPopoverHelper._treeElementSymbol] || null;
  }

  /**
   * @param {!Event} event
   */
  _iconClick(event) {
    event.consume(true);
    this.showPopover();
  }

  showPopover() {
    if (this._swatchPopoverHelper.isShowing()) {
      this._swatchPopoverHelper.hide(true);
      return;
    }

    this._cssShadowEditor = new InlineEditor.CSSShadowEditor();
    this._cssShadowEditor.setModel(this._shadowSwatch.model());
    this._cssShadowEditor.addEventListener(InlineEditor.CSSShadowEditor.Events.ShadowChanged, this._boundShadowChanged);
    this._swatchPopoverHelper.show(this._cssShadowEditor, this._iconElement, this._onPopoverHidden.bind(this));
    this._scrollerElement = this._iconElement.enclosingNodeOrSelfWithClass('style-panes-wrapper');
    if (this._scrollerElement)
      this._scrollerElement.addEventListener('scroll', this._boundOnScroll, false);

    this._originalPropertyText = this._treeElement.property.propertyText;
    this._treeElement.parentPane().setEditingStyle(true);
    const uiLocation = Bindings.cssWorkspaceBinding.propertyUILocation(this._treeElement.property, false /* forName */);
    if (uiLocation)
      Common.Revealer.reveal(uiLocation, true /* omitFocus */);
  }

  /**
   * @param {!Common.Event} event
   */
  _shadowChanged(event) {
    this._shadowSwatch.setCSSShadow(/** @type {!InlineEditor.CSSShadowModel} */ (event.data));
    this._treeElement.applyStyleText(this._treeElement.renderedPropertyText(), false);
  }

  /**
   * @param {!Event} event
   */
  _onScroll(event) {
    this._swatchPopoverHelper.reposition();
  }

  /**
   * @param {boolean} commitEdit
   */
  _onPopoverHidden(commitEdit) {
    if (this._scrollerElement)
      this._scrollerElement.removeEventListener('scroll', this._boundOnScroll, false);

    this._cssShadowEditor.removeEventListener(
        InlineEditor.CSSShadowEditor.Events.ShadowChanged, this._boundShadowChanged);
    delete this._cssShadowEditor;

    const propertyText = commitEdit ? this._treeElement.renderedPropertyText() : this._originalPropertyText;
    this._treeElement.applyStyleText(propertyText, true);
    this._treeElement.parentPane().setEditingStyle(false);
    delete this._originalPropertyText;
  }
};

Elements.ShadowSwatchPopoverHelper._treeElementSymbol = Symbol('Elements.ShadowSwatchPopoverHelper._treeElementSymbol');
