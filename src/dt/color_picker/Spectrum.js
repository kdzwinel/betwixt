/*
 * Copyright (C) 2011 Brian Grinstead All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @unrestricted
 */
ColorPicker.Spectrum = class extends UI.VBox {
  constructor() {
    /**
     * @param {!Element} parentElement
     */
    function appendSwitcherIcon(parentElement) {
      const icon = parentElement.createSVGChild('svg');
      icon.setAttribute('height', 16);
      icon.setAttribute('width', 16);
      const path = icon.createSVGChild('path');
      path.setAttribute('d', 'M5,6 L11,6 L8,2 Z M5,10 L11,10 L8,14 Z');
      return icon;
    }

    super(true);
    this.registerRequiredCSS('color_picker/spectrum.css');
    this.contentElement.tabIndex = 0;
    this.setDefaultFocusedElement(this.contentElement);

    this._colorElement = this.contentElement.createChild('div', 'spectrum-color');
    this._colorDragElement = this._colorElement.createChild('div', 'spectrum-sat fill')
                                 .createChild('div', 'spectrum-val fill')
                                 .createChild('div', 'spectrum-dragger');
    this._dragX = 0;
    this._dragY = 0;

    const toolsContainer = this.contentElement.createChild('div', 'spectrum-tools');
    const toolbar = new UI.Toolbar('spectrum-eye-dropper', toolsContainer);
    this._colorPickerButton = new UI.ToolbarToggle(Common.UIString('Toggle color picker'), 'largeicon-eyedropper');
    this._colorPickerButton.setToggled(true);
    this._colorPickerButton.addEventListener(
        UI.ToolbarButton.Events.Click, this._toggleColorPicker.bind(this, undefined));
    toolbar.appendToolbarItem(this._colorPickerButton);

    this._swatch = new ColorPicker.Spectrum.Swatch(toolsContainer);

    this._hueElement = toolsContainer.createChild('div', 'spectrum-hue');
    this._hueSlider = this._hueElement.createChild('div', 'spectrum-slider');
    this._alphaElement = toolsContainer.createChild('div', 'spectrum-alpha');
    this._alphaElementBackground = this._alphaElement.createChild('div', 'spectrum-alpha-background');
    this._alphaSlider = this._alphaElement.createChild('div', 'spectrum-slider');

    const displaySwitcher = toolsContainer.createChild('div', 'spectrum-display-switcher spectrum-switcher');
    appendSwitcherIcon(displaySwitcher);
    displaySwitcher.addEventListener('click', this._formatViewSwitch.bind(this));

    // RGBA/HSLA display.
    this._displayContainer = toolsContainer.createChild('div', 'spectrum-text source-code');
    this._textValues = [];
    for (let i = 0; i < 4; ++i) {
      const inputValue = UI.createInput('spectrum-text-value');
      this._displayContainer.appendChild(inputValue);
      inputValue.maxLength = 4;
      this._textValues.push(inputValue);
      inputValue.addEventListener('keydown', this._inputChanged.bind(this), false);
      inputValue.addEventListener('input', this._inputChanged.bind(this), false);
      inputValue.addEventListener('mousewheel', this._inputChanged.bind(this), false);
    }

    this._textLabels = this._displayContainer.createChild('div', 'spectrum-text-label');

    // HEX display.
    this._hexContainer = toolsContainer.createChild('div', 'spectrum-text spectrum-text-hex source-code');
    this._hexValue = UI.createInput('spectrum-text-value');
    this._hexContainer.appendChild(this._hexValue);
    this._hexValue.maxLength = 9;
    this._hexValue.addEventListener('keydown', this._inputChanged.bind(this), false);
    this._hexValue.addEventListener('input', this._inputChanged.bind(this), false);
    this._hexValue.addEventListener('mousewheel', this._inputChanged.bind(this), false);

    const label = this._hexContainer.createChild('div', 'spectrum-text-label');
    label.textContent = 'HEX';

    UI.installDragHandle(
        this._hueElement, dragStart.bind(this, positionHue.bind(this)), positionHue.bind(this), null, 'pointer',
        'default');
    UI.installDragHandle(
        this._alphaElement, dragStart.bind(this, positionAlpha.bind(this)), positionAlpha.bind(this), null, 'pointer',
        'default');
    UI.installDragHandle(
        this._colorElement, dragStart.bind(this, positionColor.bind(this)), positionColor.bind(this), null, 'pointer',
        'default');

    if (Runtime.experiments.isEnabled('colorContrastRatio')) {
      const boundToggleColorPicker = this._toggleColorPicker.bind(this);
      const boundContrastPanelExpanded = this._contrastPanelExpanded.bind(this);
      /** @type {!ColorPicker.ContrastInfo} */
      this._contrastInfo = new ColorPicker.ContrastInfo();
      this._contrastOverlay = new ColorPicker.ContrastOverlay(this._contrastInfo, this._colorElement);
      this._contrastDetails = new ColorPicker.ContrastDetails(
          this._contrastInfo, this.contentElement, boundToggleColorPicker, boundContrastPanelExpanded);
    }

    this.element.classList.add('palettes-enabled', 'flex-none');
    /** @type {!Map.<string, !ColorPicker.Spectrum.Palette>} */
    this._palettes = new Map();
    this._palettePanel = this.contentElement.createChild('div', 'palette-panel');
    this._palettePanelShowing = false;
    this._paletteSectionContainer = this.contentElement.createChild('div', 'spectrum-palette-container');
    this._paletteContainer = this._paletteSectionContainer.createChild('div', 'spectrum-palette');
    this._paletteContainer.addEventListener('contextmenu', this._showPaletteColorContextMenu.bind(this, -1));
    this._shadesContainer = this.contentElement.createChild('div', 'palette-color-shades hidden');
    UI.installDragHandle(
        this._paletteContainer, this._paletteDragStart.bind(this), this._paletteDrag.bind(this),
        this._paletteDragEnd.bind(this), 'default');
    const paletteSwitcher =
        this._paletteSectionContainer.createChild('div', 'spectrum-palette-switcher spectrum-switcher');
    appendSwitcherIcon(paletteSwitcher);
    paletteSwitcher.addEventListener('click', this._togglePalettePanel.bind(this, true));

    this._deleteIconToolbar = new UI.Toolbar('delete-color-toolbar');
    this._deleteButton = new UI.ToolbarButton('', 'largeicon-trash-bin');
    this._deleteIconToolbar.appendToolbarItem(this._deleteButton);

    const overlay = this.contentElement.createChild('div', 'spectrum-overlay fill');
    overlay.addEventListener('click', this._togglePalettePanel.bind(this, false));

    this._addColorToolbar = new UI.Toolbar('add-color-toolbar');
    const addColorButton = new UI.ToolbarButton(Common.UIString('Add to palette'), 'largeicon-add');
    addColorButton.addEventListener(UI.ToolbarButton.Events.Click, this._addColorToCustomPalette, this);
    this._addColorToolbar.appendToolbarItem(addColorButton);

    this._colorPickedBound = this._colorPicked.bind(this);

    this._loadPalettes();
    new ColorPicker.Spectrum.PaletteGenerator(palette => {
      if (palette.colors.length)
        this.addPalette(palette);
      else if (this._selectedColorPalette.get() === palette.title)
        this._paletteSelected(ColorPicker.Spectrum.MaterialPalette);
    });

    /**
     * @param {function(!Event)} callback
     * @param {!Event} event
     * @return {boolean}
     * @this {ColorPicker.Spectrum}
     */
    function dragStart(callback, event) {
      this._hueAlphaLeft = this._hueElement.totalOffsetLeft();
      this._colorOffset = this._colorElement.totalOffset();
      callback(event);
      return true;
    }

    /**
     * @param {!Event} event
     * @this {ColorPicker.Spectrum}
     */
    function positionHue(event) {
      const hsva = this._hsv.slice();
      hsva[0] = Number.constrain(1 - (event.x - this._hueAlphaLeft) / this._hueAlphaWidth, 0, 1);
      this._innerSetColor(hsva, '', undefined /* colorName */, undefined, ColorPicker.Spectrum._ChangeSource.Other);
    }

    /**
     * @param {!Event} event
     * @this {ColorPicker.Spectrum}
     */
    function positionAlpha(event) {
      const newAlpha = Math.round((event.x - this._hueAlphaLeft) / this._hueAlphaWidth * 100) / 100;
      const hsva = this._hsv.slice();
      hsva[3] = Number.constrain(newAlpha, 0, 1);
      this._innerSetColor(hsva, '', undefined /* colorName */, undefined, ColorPicker.Spectrum._ChangeSource.Other);
    }

    /**
     * @param {!Event} event
     * @this {ColorPicker.Spectrum}
     */
    function positionColor(event) {
      const hsva = this._hsv.slice();
      hsva[1] = Number.constrain((event.x - this._colorOffset.left) / this.dragWidth, 0, 1);
      hsva[2] = Number.constrain(1 - (event.y - this._colorOffset.top) / this.dragHeight, 0, 1);

      this._innerSetColor(hsva, '', undefined /* colorName */, undefined, ColorPicker.Spectrum._ChangeSource.Other);
    }
  }

  _contrastPanelExpanded() {
    if (this._contrastDetails.expanded())
      this._contrastOverlay.setVisible(true);
    else
      this._contrastOverlay.setVisible(false);
    this._resizeForSelectedPalette(true);
  }

  _updatePalettePanel() {
    this._palettePanel.removeChildren();
    const title = this._palettePanel.createChild('div', 'palette-title');
    title.textContent = Common.UIString('Color Palettes');
    const toolbar = new UI.Toolbar('', this._palettePanel);
    const closeButton = new UI.ToolbarButton('Return to color picker', 'largeicon-delete');
    closeButton.addEventListener(UI.ToolbarButton.Events.Click, this._togglePalettePanel.bind(this, false));
    toolbar.appendToolbarItem(closeButton);
    for (const palette of this._palettes.values())
      this._palettePanel.appendChild(this._createPreviewPaletteElement(palette));
  }

  /**
   * @param {boolean} show
   */
  _togglePalettePanel(show) {
    if (this._palettePanelShowing === show)
      return;
    if (show)
      this._updatePalettePanel();
    this._focus();
    this._palettePanelShowing = show;
    this.contentElement.classList.toggle('palette-panel-showing', show);
  }

  _focus() {
    if (this.isShowing())
      this.contentElement.focus();
  }

  /**
   * @param {string} colorText
   * @param {string=} colorName
   * @param {number=} animationDelay
   * @return {!Element}
   */
  _createPaletteColor(colorText, colorName, animationDelay) {
    const element = createElementWithClass('div', 'spectrum-palette-color');
    element.style.background = String.sprintf('linear-gradient(%s, %s), url(Images/checker.png)', colorText, colorText);
    if (animationDelay)
      element.animate([{opacity: 0}, {opacity: 1}], {duration: 100, delay: animationDelay, fill: 'backwards'});
    element.title = colorName || colorText;
    return element;
  }

  /**
   * @param {!ColorPicker.Spectrum.Palette} palette
   * @param {boolean} animate
   * @param {!Event=} event
   */
  _showPalette(palette, animate, event) {
    this._resizeForSelectedPalette();
    this._paletteContainer.removeChildren();
    for (let i = 0; i < palette.colors.length; i++) {
      const animationDelay = animate ? i * 100 / palette.colors.length : 0;
      const colorElement = this._createPaletteColor(palette.colors[i], palette.colorNames[i], animationDelay);
      colorElement.addEventListener(
          'mousedown',
          this._paletteColorSelected.bind(this, palette.colors[i], palette.colorNames[i], palette.matchUserFormat));
      if (palette.mutable) {
        colorElement.__mutable = true;
        colorElement.__color = palette.colors[i];
        colorElement.addEventListener('contextmenu', this._showPaletteColorContextMenu.bind(this, i));
      } else if (palette === ColorPicker.Spectrum.MaterialPalette) {
        colorElement.classList.add('has-material-shades');
        let shadow = colorElement.createChild('div', 'spectrum-palette-color spectrum-palette-color-shadow');
        shadow.style.background = palette.colors[i];
        shadow = colorElement.createChild('div', 'spectrum-palette-color spectrum-palette-color-shadow');
        shadow.style.background = palette.colors[i];
        colorElement.title = Common.UIString(palette.colors[i] + '. Long-click to show alternate shades.');
        new UI.LongClickController(colorElement, this._showLightnessShades.bind(this, colorElement, palette.colors[i]));
      }
      this._paletteContainer.appendChild(colorElement);
    }
    this._paletteContainerMutable = palette.mutable;

    if (palette.mutable) {
      this._paletteContainer.appendChild(this._addColorToolbar.element);
      this._paletteContainer.appendChild(this._deleteIconToolbar.element);
    } else {
      this._addColorToolbar.element.remove();
      this._deleteIconToolbar.element.remove();
    }

    this._togglePalettePanel(false);
    this._focus();
  }

  /**
   * @param {!Element} colorElement
   * @param {string} colorText
   * @param {!Event} event
   */
  _showLightnessShades(colorElement, colorText, event) {
    /**
     * @param {!Element} element
     * @this {!ColorPicker.Spectrum}
     */
    function closeLightnessShades(element) {
      this._shadesContainer.classList.add('hidden');
      element.classList.remove('spectrum-shades-shown');
      this._shadesContainer.ownerDocument.removeEventListener('mousedown', this._shadesCloseHandler, true);
      delete this._shadesCloseHandler;
    }

    if (this._shadesCloseHandler)
      this._shadesCloseHandler();

    this._shadesContainer.classList.remove('hidden');
    this._shadesContainer.removeChildren();
    this._shadesContainer.animate(
        [{transform: 'scaleY(0)', opacity: '0'}, {transform: 'scaleY(1)', opacity: '1'}],
        {duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)'});
    let shadesTop = this._paletteContainer.offsetTop + colorElement.offsetTop + colorElement.parentElement.offsetTop;
    if (this._contrastDetails && this._contrastDetails.visible())
      shadesTop += this._contrastDetails.element().offsetHeight;
    this._shadesContainer.style.top = shadesTop + 'px';
    this._shadesContainer.style.left = colorElement.offsetLeft + 'px';
    colorElement.classList.add('spectrum-shades-shown');

    const shades = ColorPicker.Spectrum.MaterialPaletteShades[colorText];
    for (let i = shades.length - 1; i >= 0; i--) {
      const shadeElement =
          this._createPaletteColor(shades[i], undefined /* colorName */, i * 200 / shades.length + 100);
      shadeElement.addEventListener('mousedown', this._paletteColorSelected.bind(this, shades[i], shades[i], false));
      this._shadesContainer.appendChild(shadeElement);
    }

    this._shadesContainer.focus();
    this._shadesCloseHandler = closeLightnessShades.bind(this, colorElement);
    this._shadesContainer.ownerDocument.addEventListener('mousedown', this._shadesCloseHandler, true);
  }

  /**
   * @param {!Event} e
   * @return {number}
   */
  _slotIndexForEvent(e) {
    const localX = e.pageX - this._paletteContainer.totalOffsetLeft();
    const localY = e.pageY - this._paletteContainer.totalOffsetTop();
    const col =
        Math.min(localX / ColorPicker.Spectrum._colorChipSize | 0, ColorPicker.Spectrum._itemsPerPaletteRow - 1);
    const row = (localY / ColorPicker.Spectrum._colorChipSize) | 0;
    return Math.min(
        row * ColorPicker.Spectrum._itemsPerPaletteRow + col, this._customPaletteSetting.get().colors.length - 1);
  }

  /**
   * @param {!Event} e
   * @return {boolean}
   */
  _isDraggingToBin(e) {
    return e.pageX > this._deleteIconToolbar.element.totalOffsetLeft();
  }

  /**
   * @param {!Event} e
   * @return {boolean}
   */
  _paletteDragStart(e) {
    const element = e.deepElementFromPoint();
    if (!element || !element.__mutable)
      return false;

    const index = this._slotIndexForEvent(e);
    this._dragElement = element;
    this._dragHotSpotX =
        e.pageX - (index % ColorPicker.Spectrum._itemsPerPaletteRow) * ColorPicker.Spectrum._colorChipSize;
    this._dragHotSpotY =
        e.pageY - (index / ColorPicker.Spectrum._itemsPerPaletteRow | 0) * ColorPicker.Spectrum._colorChipSize;
    return true;
  }

  /**
   * @param {!Event} e
   */
  _paletteDrag(e) {
    if (e.pageX < this._paletteContainer.totalOffsetLeft() || e.pageY < this._paletteContainer.totalOffsetTop())
      return;
    const newIndex = this._slotIndexForEvent(e);
    const offsetX =
        e.pageX - (newIndex % ColorPicker.Spectrum._itemsPerPaletteRow) * ColorPicker.Spectrum._colorChipSize;
    const offsetY =
        e.pageY - (newIndex / ColorPicker.Spectrum._itemsPerPaletteRow | 0) * ColorPicker.Spectrum._colorChipSize;

    const isDeleting = this._isDraggingToBin(e);
    this._deleteIconToolbar.element.classList.add('dragging');
    this._deleteIconToolbar.element.classList.toggle('delete-color-toolbar-active', isDeleting);
    const dragElementTransform =
        'translateX(' + (offsetX - this._dragHotSpotX) + 'px) translateY(' + (offsetY - this._dragHotSpotY) + 'px)';
    this._dragElement.style.transform = isDeleting ? dragElementTransform + ' scale(0.8)' : dragElementTransform;
    const children = Array.prototype.slice.call(this._paletteContainer.children);
    const index = children.indexOf(this._dragElement);
    /** @type {!Map.<!Element, {left: number, top: number}>} */
    const swatchOffsets = new Map();
    for (const swatch of children)
      swatchOffsets.set(swatch, swatch.totalOffset());

    if (index !== newIndex)
      this._paletteContainer.insertBefore(this._dragElement, children[newIndex > index ? newIndex + 1 : newIndex]);

    for (const swatch of children) {
      if (swatch === this._dragElement)
        continue;
      const before = swatchOffsets.get(swatch);
      const after = swatch.totalOffset();
      if (before.left !== after.left || before.top !== after.top) {
        swatch.animate(
            [
              {
                transform:
                    'translateX(' + (before.left - after.left) + 'px) translateY(' + (before.top - after.top) + 'px)'
              },
              {transform: 'none'}
            ],
            {duration: 100, easing: 'cubic-bezier(0, 0, 0.2, 1)'});
      }
    }
  }

  /**
   * @param {!Event} e
   */
  _paletteDragEnd(e) {
    if (this._isDraggingToBin(e))
      this._dragElement.remove();
    this._dragElement.style.removeProperty('transform');
    const children = this._paletteContainer.children;
    const colors = [];
    for (let i = 0; i < children.length; ++i) {
      if (children[i].__color)
        colors.push(children[i].__color);
    }
    const palette = this._customPaletteSetting.get();
    palette.colors = colors;
    this._customPaletteSetting.set(palette);
    this._showPalette(this._customPaletteSetting.get(), false);

    this._deleteIconToolbar.element.classList.remove('dragging');
    this._deleteIconToolbar.element.classList.remove('delete-color-toolbar-active');
  }

  _loadPalettes() {
    this._palettes.set(ColorPicker.Spectrum.MaterialPalette.title, ColorPicker.Spectrum.MaterialPalette);
    /** @type {!ColorPicker.Spectrum.Palette} */
    const defaultCustomPalette = {title: 'Custom', colors: [], colorNames: [], mutable: true};
    this._customPaletteSetting = Common.settings.createSetting('customColorPalette', defaultCustomPalette);
    const customPalette = this._customPaletteSetting.get();
    // Fallback case for custom palettes created pre-m67
    customPalette.colorNames = customPalette.colorNames || [];
    this._palettes.set(customPalette.title, customPalette);

    this._selectedColorPalette =
        Common.settings.createSetting('selectedColorPalette', ColorPicker.Spectrum.GeneratedPaletteTitle);
    const palette = this._palettes.get(this._selectedColorPalette.get());
    if (palette)
      this._showPalette(palette, true);
  }

  /**
   * @param {!ColorPicker.Spectrum.Palette} palette
   */
  addPalette(palette) {
    this._palettes.set(palette.title, palette);
    if (this._selectedColorPalette.get() === palette.title)
      this._showPalette(palette, true);
  }

  /**
   * @param {!ColorPicker.Spectrum.Palette} palette
   * @return {!Element}
   */
  _createPreviewPaletteElement(palette) {
    const colorsPerPreviewRow = 5;
    const previewElement = createElementWithClass('div', 'palette-preview');
    const titleElement = previewElement.createChild('div', 'palette-preview-title');
    titleElement.textContent = palette.title;
    let i;
    for (i = 0; i < colorsPerPreviewRow && i < palette.colors.length; i++)
      previewElement.appendChild(this._createPaletteColor(palette.colors[i], palette.colorNames[i]));
    for (; i < colorsPerPreviewRow; i++)
      previewElement.createChild('div', 'spectrum-palette-color empty-color');
    previewElement.addEventListener('click', this._paletteSelected.bind(this, palette));
    return previewElement;
  }

  /**
   * @param {!ColorPicker.Spectrum.Palette} palette
   */
  _paletteSelected(palette) {
    this._selectedColorPalette.set(palette.title);
    this._showPalette(palette, true);
  }

  /**
   * @param {boolean=} force
   */
  _resizeForSelectedPalette(force) {
    const palette = this._palettes.get(this._selectedColorPalette.get());
    if (!palette)
      return;
    let numColors = palette.colors.length;
    if (palette === this._customPaletteSetting.get())
      numColors++;
    const rowsNeeded = Math.max(1, Math.ceil(numColors / ColorPicker.Spectrum._itemsPerPaletteRow));
    if (this._numPaletteRowsShown === rowsNeeded && !force)
      return;
    this._numPaletteRowsShown = rowsNeeded;
    const paletteColorHeight = 12;
    const paletteMargin = 12;
    let paletteTop = 236;
    if (this._contrastDetails && this._contrastDetails.visible()) {
      if (this._contrastDetails.expanded())
        paletteTop += 78;
      else
        paletteTop += 36;
    }
    this.element.style.height = (paletteTop + paletteMargin + (paletteColorHeight + paletteMargin) * rowsNeeded) + 'px';
    this.dispatchEventToListeners(ColorPicker.Spectrum.Events.SizeChanged);
  }

  /**
   * @param {string} colorText
   * @param {(string|undefined)} colorName
   * @param {boolean} matchUserFormat
   */
  _paletteColorSelected(colorText, colorName, matchUserFormat) {
    const color = Common.Color.parse(colorText);
    if (!color)
      return;
    this._innerSetColor(
        color.hsva(), colorText, colorName, matchUserFormat ? this._colorFormat : color.format(),
        ColorPicker.Spectrum._ChangeSource.Other);
  }

  /**
   * @param {!Common.Event} event
   */
  _addColorToCustomPalette(event) {
    const palette = this._customPaletteSetting.get();
    palette.colors.push(this.colorString());
    this._customPaletteSetting.set(palette);
    this._showPalette(this._customPaletteSetting.get(), false);
  }

  /**
   * @param {number} colorIndex
   * @param {!Event} event
   */
  _showPaletteColorContextMenu(colorIndex, event) {
    if (!this._paletteContainerMutable)
      return;
    const contextMenu = new UI.ContextMenu(event);
    if (colorIndex !== -1) {
      contextMenu.defaultSection().appendItem(
          Common.UIString('Remove color'), this._deletePaletteColors.bind(this, colorIndex, false));
      contextMenu.defaultSection().appendItem(
          Common.UIString('Remove all to the right'), this._deletePaletteColors.bind(this, colorIndex, true));
    }
    contextMenu.defaultSection().appendItem(
        Common.UIString('Clear palette'), this._deletePaletteColors.bind(this, -1, true));
    contextMenu.show();
  }

  /**
   * @param {number} colorIndex
   * @param {boolean} toRight
   */
  _deletePaletteColors(colorIndex, toRight) {
    const palette = this._customPaletteSetting.get();
    if (toRight)
      palette.colors.splice(colorIndex + 1, palette.colors.length - colorIndex - 1);
    else
      palette.colors.splice(colorIndex, 1);
    this._customPaletteSetting.set(palette);
    this._showPalette(this._customPaletteSetting.get(), false);
  }

  /**
   * @param {!Common.Color} color
   * @param {string} colorFormat
   */
  setColor(color, colorFormat) {
    this._originalFormat = colorFormat;
    this._innerSetColor(
        color.hsva(), '', undefined /* colorName */, colorFormat, ColorPicker.Spectrum._ChangeSource.Model);
  }

  /**
   * @param {?SDK.CSSModel.ContrastInfo} contrastInfo
   */
  setContrastInfo(contrastInfo) {
    if (!this._contrastInfo)
      return;

    this._contrastInfo.update(contrastInfo);

    // Contrast info may cause contrast details to become visible.
    if (this._contrastDetails.visible())
      this._resizeForSelectedPalette(true);
  }

  /**
   * @param {!Array<number>|undefined} hsva
   * @param {string|undefined} colorString
   * @param {string|undefined} colorName
   * @param {string|undefined} colorFormat
   * @param {string} changeSource
   */
  _innerSetColor(hsva, colorString, colorName, colorFormat, changeSource) {
    if (hsva !== undefined)
      this._hsv = hsva;
    this._colorName = colorName;
    if (colorString !== undefined)
      this._colorString = colorString;
    if (colorFormat !== undefined) {
      const cf = Common.Color.Format;
      console.assert(colorFormat !== cf.Original, 'Spectrum\'s color format cannot be Original');
      if (colorFormat === cf.RGBA)
        colorFormat = cf.RGB;
      else if (colorFormat === cf.HSLA)
        colorFormat = cf.HSL;
      else if (colorFormat === cf.HEXA)
        colorFormat = cf.HEX;
      else if (colorFormat === cf.ShortHEXA)
        colorFormat = cf.ShortHEX;
      this._colorFormat = colorFormat;
    }

    if (hsva && this._contrastInfo)
      this._contrastInfo.setColor(hsva, this.colorString());

    this._updateHelperLocations();
    this._updateUI();

    if (changeSource !== ColorPicker.Spectrum._ChangeSource.Input)
      this._updateInput();
    if (changeSource !== ColorPicker.Spectrum._ChangeSource.Model)
      this.dispatchEventToListeners(ColorPicker.Spectrum.Events.ColorChanged, this.colorString());
  }

  /**
   * @return {!Common.Color}
   */
  _color() {
    return Common.Color.fromHSVA(this._hsv);
  }

  /**
   * @return {string|undefined}
   */
  colorName() {
    return this._colorName;
  }

  /**
   * @return {string}
   */
  colorString() {
    if (this._colorString)
      return this._colorString;
    const cf = Common.Color.Format;
    const color = this._color();
    let colorString = color.asString(this._colorFormat);
    if (colorString)
      return colorString;

    if (this._colorFormat === cf.Nickname)
      colorString = color.asString(color.hasAlpha() ? cf.HEXA : cf.HEX);
    else if (this._colorFormat === cf.ShortHEX)
      colorString = color.asString(color.detectHEXFormat());
    else if (this._colorFormat === cf.HEX)
      colorString = color.asString(cf.HEXA);
    else if (this._colorFormat === cf.HSL)
      colorString = color.asString(cf.HSLA);
    else
      colorString = color.asString(cf.RGBA);

    console.assert(colorString);
    return colorString || '';
  }

  _updateHelperLocations() {
    const h = this._hsv[0];
    const s = this._hsv[1];
    const v = this._hsv[2];
    const alpha = this._hsv[3];

    // Where to show the little circle that displays your current selected color.
    this._dragX = s * this.dragWidth;
    this._dragY = this.dragHeight - (v * this.dragHeight);

    const dragX = Math.max(
        -this._colorDragElementHeight,
        Math.min(this.dragWidth - this._colorDragElementHeight, this._dragX - this._colorDragElementHeight));
    const dragY = Math.max(
        -this._colorDragElementHeight,
        Math.min(this.dragHeight - this._colorDragElementHeight, this._dragY - this._colorDragElementHeight));

    this._colorDragElement.positionAt(dragX, dragY);

    // Where to show the bar that displays your current selected hue.
    const hueSlideX = (1 - h) * this._hueAlphaWidth - this.slideHelperWidth;
    this._hueSlider.style.left = hueSlideX + 'px';
    const alphaSlideX = alpha * this._hueAlphaWidth - this.slideHelperWidth;
    this._alphaSlider.style.left = alphaSlideX + 'px';
  }

  _updateInput() {
    const cf = Common.Color.Format;
    if (this._colorFormat === cf.HEX || this._colorFormat === cf.ShortHEX || this._colorFormat === cf.Nickname) {
      this._hexContainer.hidden = false;
      this._displayContainer.hidden = true;
      if (this._colorFormat === cf.ShortHEX) {
        this._hexValue.value = this._color().asString(this._color().detectHEXFormat());
      } else {  // Don't use ShortHEX if original was not in that format.
        this._hexValue.value = this._color().asString(this._color().hasAlpha() ? cf.HEXA : cf.HEX);
      }
    } else {
      // RGBA, HSLA display.
      this._hexContainer.hidden = true;
      this._displayContainer.hidden = false;
      const isRgb = this._colorFormat === cf.RGB;
      this._textLabels.textContent = isRgb ? 'RGBA' : 'HSLA';
      const colorValues = isRgb ? this._color().canonicalRGBA() : this._color().canonicalHSLA();
      for (let i = 0; i < 3; ++i) {
        this._textValues[i].value = colorValues[i];
        if (!isRgb && (i === 1 || i === 2))
          this._textValues[i].value += '%';
      }
      this._textValues[3].value = Math.round(colorValues[3] * 100) / 100;
    }
  }

  _updateUI() {
    const h = Common.Color.fromHSVA([this._hsv[0], 1, 1, 1]);
    this._colorElement.style.backgroundColor = /** @type {string} */ (h.asString(Common.Color.Format.RGB));
    if (this._contrastOverlay)
      this._contrastOverlay.setDimensions(this.dragWidth, this.dragHeight);

    this._swatch.setColor(this._color(), this.colorString());
    this._colorDragElement.style.backgroundColor =
        /** @type {string} */ (this._color().asString(Common.Color.Format.RGBA));
    const noAlpha = Common.Color.fromHSVA(this._hsv.slice(0, 3).concat(1));
    this._alphaElementBackground.style.backgroundImage =
        String.sprintf('linear-gradient(to right, rgba(0,0,0,0), %s)', noAlpha.asString(Common.Color.Format.RGB));
  }

  _formatViewSwitch() {
    const cf = Common.Color.Format;
    let format = cf.RGB;
    if (this._colorFormat === cf.RGB)
      format = cf.HSL;
    else if (this._colorFormat === cf.HSL)
      format = (this._originalFormat === cf.ShortHEX || this._originalFormat === cf.ShortHEXA) ? cf.ShortHEX : cf.HEX;
    this._innerSetColor(undefined, '', undefined /* colorName */, format, ColorPicker.Spectrum._ChangeSource.Other);
  }

  /**
   * @param {!Event} event
   */
  _inputChanged(event) {
    /**
     * @param {!Element} element
     * @return {string}
     */
    function elementValue(element) {
      return element.value;
    }

    const inputElement = /** @type {!Element} */ (event.currentTarget);
    const newValue = UI.createReplacementString(inputElement.value, event);
    if (newValue) {
      inputElement.value = newValue;
      inputElement.selectionStart = 0;
      inputElement.selectionEnd = newValue.length;
      event.consume(true);
    }

    const cf = Common.Color.Format;
    let colorString;
    if (this._colorFormat === cf.Nickname || this._colorFormat === cf.HEX || this._colorFormat === cf.ShortHEX) {
      colorString = this._hexValue.value;
    } else {
      const format = this._colorFormat === cf.RGB ? 'rgba' : 'hsla';
      const values = this._textValues.map(elementValue).join(', ');
      colorString = String.sprintf('%s(%s)', format, values);
    }

    const color = Common.Color.parse(colorString);
    if (!color)
      return;

    let colorFormat = undefined;
    if (this._colorFormat === cf.HEX || this._colorFormat === cf.ShortHEX)
      colorFormat = color.detectHEXFormat();
    this._innerSetColor(
        color.hsva(), colorString, undefined /* colorName */, colorFormat, ColorPicker.Spectrum._ChangeSource.Input);
  }

  /**
   * @override
   */
  wasShown() {
    this._hueAlphaWidth = this._hueElement.offsetWidth;
    this.slideHelperWidth = this._hueSlider.offsetWidth / 2;
    this.dragWidth = this._colorElement.offsetWidth;
    this.dragHeight = this._colorElement.offsetHeight;
    this._colorDragElementHeight = this._colorDragElement.offsetHeight / 2;
    this._innerSetColor(
        undefined, undefined, undefined /* colorName */, undefined, ColorPicker.Spectrum._ChangeSource.Model);
    this._toggleColorPicker(true);
  }

  /**
   * @override
   */
  willHide() {
    this._toggleColorPicker(false);
  }

  /**
   * @param {boolean=} enabled
   * @param {!Common.Event=} event
   */
  _toggleColorPicker(enabled, event) {
    if (enabled === undefined)
      enabled = !this._colorPickerButton.toggled();
    this._colorPickerButton.setToggled(enabled);
    InspectorFrontendHost.setEyeDropperActive(enabled);
    if (enabled) {
      InspectorFrontendHost.events.addEventListener(
          InspectorFrontendHostAPI.Events.EyeDropperPickedColor, this._colorPickedBound);
    } else {
      InspectorFrontendHost.events.removeEventListener(
          InspectorFrontendHostAPI.Events.EyeDropperPickedColor, this._colorPickedBound);
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _colorPicked(event) {
    const rgbColor = /** @type {!{r: number, g: number, b: number, a: number}} */ (event.data);
    const rgba = [rgbColor.r, rgbColor.g, rgbColor.b, (rgbColor.a / 2.55 | 0) / 100];
    const color = Common.Color.fromRGBA(rgba);
    this._innerSetColor(
        color.hsva(), '', undefined /* colorName */, undefined, ColorPicker.Spectrum._ChangeSource.Other);
    InspectorFrontendHost.bringToFront();
  }
};

ColorPicker.Spectrum._ChangeSource = {
  Input: 'Input',
  Model: 'Model',
  Other: 'Other'
};

/** @enum {symbol} */
ColorPicker.Spectrum.Events = {
  ColorChanged: Symbol('ColorChanged'),
  SizeChanged: Symbol('SizeChanged')
};

ColorPicker.Spectrum._colorChipSize = 24;
ColorPicker.Spectrum._itemsPerPaletteRow = 8;

/** @typedef {{ title: string, colors: !Array<string>, colorNames: !Array<string>, mutable: boolean }} */
ColorPicker.Spectrum.Palette;
ColorPicker.Spectrum.GeneratedPaletteTitle = 'Page colors';

ColorPicker.Spectrum.PaletteGenerator = class {
  /**
   * @param {function(!ColorPicker.Spectrum.Palette)} callback
   */
  constructor(callback) {
    this._callback = callback;
    /** @type {!Map.<string, number>} */
    this._frequencyMap = new Map();
    const stylesheetPromises = [];
    for (const cssModel of SDK.targetManager.models(SDK.CSSModel)) {
      for (const stylesheet of cssModel.allStyleSheets())
        stylesheetPromises.push(this._processStylesheet(stylesheet));
    }
    Promise.all(stylesheetPromises).catchException(null).then(this._finish.bind(this));
  }

  /**
   * @param {string} a
   * @param {string} b
   * @return {number}
   */
  _frequencyComparator(a, b) {
    return this._frequencyMap.get(b) - this._frequencyMap.get(a);
  }

  _finish() {
    /**
     * @param {string} a
     * @param {string} b
     * @return {number}
     */
    function hueComparator(a, b) {
      const hsva = paletteColors.get(a).hsva();
      const hsvb = paletteColors.get(b).hsva();

      // First trim the shades of gray
      if (hsvb[1] < 0.12 && hsva[1] < 0.12)
        return hsvb[2] * hsvb[3] - hsva[2] * hsva[3];
      if (hsvb[1] < 0.12)
        return -1;
      if (hsva[1] < 0.12)
        return 1;

      // Equal hue -> sort by sat
      if (hsvb[0] === hsva[0])
        return hsvb[1] * hsvb[3] - hsva[1] * hsva[3];

      return (hsvb[0] + 0.94) % 1 - (hsva[0] + 0.94) % 1;
    }

    let colors = this._frequencyMap.keysArray();
    colors = colors.sort(this._frequencyComparator.bind(this));
    /** @type {!Map.<string, !Common.Color>} */
    const paletteColors = new Map();
    const colorsPerRow = 24;
    while (paletteColors.size < colorsPerRow && colors.length) {
      const colorText = colors.shift();
      const color = Common.Color.parse(colorText);
      if (!color || color.nickname() === 'white' || color.nickname() === 'black')
        continue;
      paletteColors.set(colorText, color);
    }

    this._callback({
      title: ColorPicker.Spectrum.GeneratedPaletteTitle,
      colors: paletteColors.keysArray().sort(hueComparator),
      colorNames: [],
      mutable: false
    });
  }

  /**
   * @param {!SDK.CSSStyleSheetHeader} stylesheet
   * @return {!Promise}
   */
  async _processStylesheet(stylesheet) {
    let text = await stylesheet.requestContent() || '';
    text = text.toLowerCase();
    const regexResult = text.match(/((?:rgb|hsl)a?\([^)]+\)|#[0-9a-f]{6}|#[0-9a-f]{3})/g) || [];
    for (const c of regexResult) {
      let frequency = this._frequencyMap.get(c) || 0;
      this._frequencyMap.set(c, ++frequency);
    }
  }
};

ColorPicker.Spectrum.MaterialPaletteShades = {
  '#F44336':
      ['#FFEBEE', '#FFCDD2', '#EF9A9A', '#E57373', '#EF5350', '#F44336', '#E53935', '#D32F2F', '#C62828', '#B71C1C'],
  '#E91E63':
      ['#FCE4EC', '#F8BBD0', '#F48FB1', '#F06292', '#EC407A', '#E91E63', '#D81B60', '#C2185B', '#AD1457', '#880E4F'],
  '#9C27B0':
      ['#F3E5F5', '#E1BEE7', '#CE93D8', '#BA68C8', '#AB47BC', '#9C27B0', '#8E24AA', '#7B1FA2', '#6A1B9A', '#4A148C'],
  '#673AB7':
      ['#EDE7F6', '#D1C4E9', '#B39DDB', '#9575CD', '#7E57C2', '#673AB7', '#5E35B1', '#512DA8', '#4527A0', '#311B92'],
  '#3F51B5':
      ['#E8EAF6', '#C5CAE9', '#9FA8DA', '#7986CB', '#5C6BC0', '#3F51B5', '#3949AB', '#303F9F', '#283593', '#1A237E'],
  '#2196F3':
      ['#E3F2FD', '#BBDEFB', '#90CAF9', '#64B5F6', '#42A5F5', '#2196F3', '#1E88E5', '#1976D2', '#1565C0', '#0D47A1'],
  '#03A9F4':
      ['#E1F5FE', '#B3E5FC', '#81D4FA', '#4FC3F7', '#29B6F6', '#03A9F4', '#039BE5', '#0288D1', '#0277BD', '#01579B'],
  '#00BCD4':
      ['#E0F7FA', '#B2EBF2', '#80DEEA', '#4DD0E1', '#26C6DA', '#00BCD4', '#00ACC1', '#0097A7', '#00838F', '#006064'],
  '#009688':
      ['#E0F2F1', '#B2DFDB', '#80CBC4', '#4DB6AC', '#26A69A', '#009688', '#00897B', '#00796B', '#00695C', '#004D40'],
  '#4CAF50':
      ['#E8F5E9', '#C8E6C9', '#A5D6A7', '#81C784', '#66BB6A', '#4CAF50', '#43A047', '#388E3C', '#2E7D32', '#1B5E20'],
  '#8BC34A':
      ['#F1F8E9', '#DCEDC8', '#C5E1A5', '#AED581', '#9CCC65', '#8BC34A', '#7CB342', '#689F38', '#558B2F', '#33691E'],
  '#CDDC39':
      ['#F9FBE7', '#F0F4C3', '#E6EE9C', '#DCE775', '#D4E157', '#CDDC39', '#C0CA33', '#AFB42B', '#9E9D24', '#827717'],
  '#FFEB3B':
      ['#FFFDE7', '#FFF9C4', '#FFF59D', '#FFF176', '#FFEE58', '#FFEB3B', '#FDD835', '#FBC02D', '#F9A825', '#F57F17'],
  '#FFC107':
      ['#FFF8E1', '#FFECB3', '#FFE082', '#FFD54F', '#FFCA28', '#FFC107', '#FFB300', '#FFA000', '#FF8F00', '#FF6F00'],
  '#FF9800':
      ['#FFF3E0', '#FFE0B2', '#FFCC80', '#FFB74D', '#FFA726', '#FF9800', '#FB8C00', '#F57C00', '#EF6C00', '#E65100'],
  '#FF5722':
      ['#FBE9E7', '#FFCCBC', '#FFAB91', '#FF8A65', '#FF7043', '#FF5722', '#F4511E', '#E64A19', '#D84315', '#BF360C'],
  '#795548':
      ['#EFEBE9', '#D7CCC8', '#BCAAA4', '#A1887F', '#8D6E63', '#795548', '#6D4C41', '#5D4037', '#4E342E', '#3E2723'],
  '#9E9E9E':
      ['#FAFAFA', '#F5F5F5', '#EEEEEE', '#E0E0E0', '#BDBDBD', '#9E9E9E', '#757575', '#616161', '#424242', '#212121'],
  '#607D8B':
      ['#ECEFF1', '#CFD8DC', '#B0BEC5', '#90A4AE', '#78909C', '#607D8B', '#546E7A', '#455A64', '#37474F', '#263238']
};

ColorPicker.Spectrum.MaterialPalette = {
  title: 'Material',
  mutable: false,
  matchUserFormat: true,
  colors: Object.keys(ColorPicker.Spectrum.MaterialPaletteShades),
  colorNames: []
};

ColorPicker.Spectrum.Swatch = class {
  /**
   * @param {!Element} parentElement
   */
  constructor(parentElement) {
    /** @type {?string} */
    this._colorString;

    const swatchElement = parentElement.createChild('span', 'swatch');
    this._swatchInnerElement = swatchElement.createChild('span', 'swatch-inner');

    this._swatchOverlayElement = swatchElement.createChild('span', 'swatch-overlay');
    this._swatchOverlayElement.addEventListener('click', this._onCopyIconClick.bind(this));
    this._swatchOverlayElement.addEventListener('mouseout', this._onCopyIconMouseout.bind(this));
    this._swatchCopyIcon = UI.Icon.create('largeicon-copy', 'copy-color-icon');
    this._swatchCopyIcon.title = Common.UIString('Copy color to clipboard');
    this._swatchOverlayElement.appendChild(this._swatchCopyIcon);
  }

  /**
   * @param {!Common.Color} color
   * @param {string=} colorString
   */
  setColor(color, colorString) {
    this._swatchInnerElement.style.backgroundColor =
        /** @type {string} */ (color.asString(Common.Color.Format.RGBA));
    // Show border if the swatch is white.
    this._swatchInnerElement.classList.toggle('swatch-inner-white', color.hsla()[2] > 0.9);
    this._colorString = colorString || null;
    if (colorString)
      this._swatchOverlayElement.hidden = false;
    else
      this._swatchOverlayElement.hidden = true;
  }

  _onCopyIconClick() {
    this._swatchCopyIcon.setIconType('largeicon-checkmark');
    InspectorFrontendHost.copyText(this._colorString);
  }

  _onCopyIconMouseout() {
    this._swatchCopyIcon.setIconType('largeicon-copy');
  }
};
