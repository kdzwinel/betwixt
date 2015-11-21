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
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.Spectrum = function()
{
    /**
     * @param {!Element} parentElement
     */
    function appendSwitcherIcon(parentElement)
    {
        var icon = parentElement.createSVGChild("svg");
        icon.setAttribute("height", 16);
        icon.setAttribute("width", 16);
        var path = icon.createSVGChild("path");
        path.setAttribute("d", "M5,6 L11,6 L8,2 Z M5,10 L11,10 L8,14 Z");
        return icon;
    }

    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("elements/spectrum.css");
    this.contentElement.tabIndex = 0;

    this._colorElement = this.contentElement.createChild("div", "spectrum-color");
    this._colorDragElement = this._colorElement.createChild("div", "spectrum-sat fill").createChild("div", "spectrum-val fill").createChild("div", "spectrum-dragger");
    var contrastRatioSVG = this._colorElement.createSVGChild("svg", "spectrum-contrast-container fill");
    this._contrastRatioLine = contrastRatioSVG.createSVGChild("path", "spectrum-contrast-line");

    var toolbar = new WebInspector.Toolbar(this.contentElement);
    toolbar.element.classList.add("spectrum-eye-dropper");
    this._colorPickerButton = new WebInspector.ToolbarButton(WebInspector.UIString("Toggle color picker"), "eyedropper-toolbar-item");
    this._colorPickerButton.setToggled(true);
    this._colorPickerButton.addEventListener("click", this._toggleColorPicker.bind(this, undefined));
    toolbar.appendToolbarItem(this._colorPickerButton);

    var swatchElement = this.contentElement.createChild("span", "swatch");
    this._swatchInnerElement = swatchElement.createChild("span", "swatch-inner");

    this._hueElement = this.contentElement.createChild("div", "spectrum-hue");
    this._hueSlider = this._hueElement.createChild("div", "spectrum-slider");
    this._alphaElement = this.contentElement.createChild("div", "spectrum-alpha");
    this._alphaElementBackground = this._alphaElement.createChild("div", "spectrum-alpha-background");
    this._alphaSlider = this._alphaElement.createChild("div", "spectrum-slider");

    var displaySwitcher = this.contentElement.createChild("div", "spectrum-display-switcher spectrum-switcher");
    appendSwitcherIcon(displaySwitcher);
    displaySwitcher.addEventListener("click", this._formatViewSwitch.bind(this));

    // RGBA/HSLA display.
    this._displayContainer = this.contentElement.createChild("div", "spectrum-text source-code");
    this._textValues = [];
    for (var i = 0; i < 4; ++i) {
        var inputValue = this._displayContainer.createChild("input", "spectrum-text-value");
        inputValue.maxLength = 4;
        this._textValues.push(inputValue);
        inputValue.addEventListener("keydown", this._inputChanged.bind(this), false);
        inputValue.addEventListener("input", this._inputChanged.bind(this), false);
        inputValue.addEventListener("mousewheel", this._inputChanged.bind(this), false);
    }

    this._textLabels = this._displayContainer.createChild("div", "spectrum-text-label");

    // HEX display.
    this._hexContainer = this.contentElement.createChild("div", "spectrum-text spectrum-text-hex source-code");
    this._hexValue = this._hexContainer.createChild("input", "spectrum-text-value");
    this._hexValue.maxLength = 7;
    this._hexValue.addEventListener("keydown", this._inputChanged.bind(this), false);
    this._hexValue.addEventListener("input", this._inputChanged.bind(this), false);
    this._hexValue.addEventListener("mousewheel", this._inputChanged.bind(this), false);

    var label = this._hexContainer.createChild("div", "spectrum-text-label");
    label.textContent = "HEX";

    WebInspector.installDragHandle(this._hueElement, dragStart.bind(this, positionHue.bind(this)), positionHue.bind(this), null, "default");
    WebInspector.installDragHandle(this._alphaElement, dragStart.bind(this, positionAlpha.bind(this)), positionAlpha.bind(this), null, "default");
    WebInspector.installDragHandle(this._colorElement, dragStart.bind(this, positionColor.bind(this)), positionColor.bind(this), null, "default");

    this.element.classList.add("palettes-enabled");
    /** @type {!Map.<string, !WebInspector.Spectrum.Palette>} */
    this._palettes = new Map();
    this._palettePanel = this.contentElement.createChild("div", "palette-panel");
    this._palettePanelShowing = false;
    this._paletteContainer = this.contentElement.createChild("div", "spectrum-palette");
    this._paletteContainer.addEventListener("contextmenu", this._showPaletteColorContextMenu.bind(this, -1));
    this._shadesContainer = this.contentElement.createChild("div", "palette-color-shades hidden");
    WebInspector.installDragHandle(this._paletteContainer, this._paletteDragStart.bind(this), this._paletteDrag.bind(this), this._paletteDragEnd.bind(this), "default");
    var paletteSwitcher = this.contentElement.createChild("div", "spectrum-palette-switcher spectrum-switcher");
    appendSwitcherIcon(paletteSwitcher);
    paletteSwitcher.addEventListener("click", this._togglePalettePanel.bind(this, true));

    this._deleteIconToolbar = new WebInspector.Toolbar();
    this._deleteIconToolbar.element.classList.add("delete-color-toolbar");
    this._deleteButton = new WebInspector.ToolbarButton("", "garbage-collect-toolbar-item");
    this._deleteIconToolbar.appendToolbarItem(this._deleteButton);

    var overlay = this.contentElement.createChild("div", "spectrum-overlay fill");
    overlay.addEventListener("click", this._togglePalettePanel.bind(this, false));

    this._addColorToolbar = new WebInspector.Toolbar();
    this._addColorToolbar.element.classList.add("add-color-toolbar");
    var addColorButton = new WebInspector.ToolbarButton(WebInspector.UIString("Add to palette"), "add-toolbar-item");
    addColorButton.addEventListener("click", this._addColorToCustomPalette.bind(this));
    this._addColorToolbar.appendToolbarItem(addColorButton);

    this._loadPalettes();
    new WebInspector.Spectrum.PaletteGenerator(this._generatedPaletteLoaded.bind(this));

    /**
     * @param {function(!Event)} callback
     * @param {!Event} event
     * @return {boolean}
     * @this {WebInspector.Spectrum}
     */
    function dragStart(callback, event)
    {
        this._hueAlphaLeft = this._hueElement.totalOffsetLeft();
        this._colorOffset = this._colorElement.totalOffset();
        callback(event);
        return true;
    }

    /**
     * @param {!Event} event
     * @this {WebInspector.Spectrum}
     */
    function positionHue(event)
    {
        var hsva = this._hsv.slice();
        hsva[0] = Number.constrain(1 - (event.x - this._hueAlphaLeft) / this._hueAlphaWidth, 0, 1);
        this._innerSetColor(hsva,  "", undefined, WebInspector.Spectrum._ChangeSource.Other);
    }

    /**
     * @param {!Event} event
     * @this {WebInspector.Spectrum}
     */
    function positionAlpha(event)
    {
        var newAlpha = Math.round((event.x - this._hueAlphaLeft) / this._hueAlphaWidth * 100) / 100;
        var hsva = this._hsv.slice();
        hsva[3] = Number.constrain(newAlpha, 0, 1);
        var colorFormat = undefined;
        if (hsva[3] !== 1 && (this._colorFormat === WebInspector.Color.Format.ShortHEX || this._colorFormat === WebInspector.Color.Format.HEX || this._colorFormat === WebInspector.Color.Format.Nickname))
            colorFormat = WebInspector.Color.Format.RGB;
        this._innerSetColor(hsva, "", colorFormat, WebInspector.Spectrum._ChangeSource.Other);
    }

    /**
     * @param {!Event} event
     * @this {WebInspector.Spectrum}
     */
    function positionColor(event)
    {
        var hsva = this._hsv.slice();
        hsva[1] = Number.constrain((event.x - this._colorOffset.left) / this.dragWidth, 0, 1);
        hsva[2] = Number.constrain(1 - (event.y - this._colorOffset.top) / this.dragHeight, 0, 1);
        this._innerSetColor(hsva,  "", undefined, WebInspector.Spectrum._ChangeSource.Other);
    }
}

WebInspector.Spectrum._ChangeSource = {
    Input: "Input",
    Model: "Model",
    Other: "Other"
}

WebInspector.Spectrum.Events = {
    ColorChanged: "ColorChanged",
    SizeChanged: "SizeChanged"
};

WebInspector.Spectrum._colorChipSize = 24;
WebInspector.Spectrum._itemsPerPaletteRow = 8;

WebInspector.Spectrum.prototype = {
    _updatePalettePanel: function()
    {
        this._palettePanel.removeChildren();
        var title = this._palettePanel.createChild("div", "palette-title");
        title.textContent = WebInspector.UIString("Color Palettes");
        var toolbar = new WebInspector.Toolbar(this._palettePanel);
        var closeButton = new WebInspector.ToolbarButton("Return to color picker", "delete-toolbar-item");
        closeButton.addEventListener("click", this._togglePalettePanel.bind(this, false));
        toolbar.appendToolbarItem(closeButton);
        for (var palette of this._palettes.values())
            this._palettePanel.appendChild(this._createPreviewPaletteElement(palette));
    },

    /**
     * @param {boolean} show
     */
    _togglePalettePanel: function(show)
    {
        if (this._palettePanelShowing === show)
            return;
        if (show)
            this._updatePalettePanel();
        this._focus();
        this._palettePanelShowing = show;
        this.contentElement.classList.toggle("palette-panel-showing", show);
    },

    _focus: function()
    {
        if (WebInspector.currentFocusElement() !== this.contentElement)
            WebInspector.setCurrentFocusElement(this.contentElement);
    },

    /**
     * @param {string} colorText
     * @param {number=} animationDelay
     * @return {!Element}
     */
    _createPaletteColor: function(colorText, animationDelay)
    {
        var element = createElementWithClass("div", "spectrum-palette-color");
        element.style.background = String.sprintf("linear-gradient(%s, %s), url(Images/checker.png)", colorText, colorText);
        if (animationDelay)
            element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, delay: animationDelay, fill: "backwards" });
        element.title = colorText;
        return element;
    },

    /**
     * @param {!WebInspector.Spectrum.Palette} palette
     * @param {boolean} animate
     * @param {!Event=} event
     */
    _showPalette: function(palette, animate, event)
    {
        this._resizeForSelectedPalette();
        this._paletteContainer.removeChildren();
        for (var i = 0; i < palette.colors.length; i++) {
            var animationDelay = animate ? i * 100 / palette.colors.length : 0;
            var colorElement = this._createPaletteColor(palette.colors[i], animationDelay);
            colorElement.addEventListener("mousedown", this._paletteColorSelected.bind(this, palette.colors[i], palette.matchUserFormat));
            if (palette.mutable) {
                colorElement.__mutable = true;
                colorElement.__color = palette.colors[i];
                colorElement.addEventListener("contextmenu", this._showPaletteColorContextMenu.bind(this, i));
            } else if (palette === WebInspector.Spectrum.MaterialPalette) {
                colorElement.classList.add("has-material-shades");
                var shadow = colorElement.createChild("div", "spectrum-palette-color spectrum-palette-color-shadow");
                shadow.style.background = palette.colors[i];
                shadow = colorElement.createChild("div", "spectrum-palette-color spectrum-palette-color-shadow");
                shadow.style.background = palette.colors[i];
                var controller = new WebInspector.LongClickController(colorElement);
                controller.enable();
                controller.addEventListener(WebInspector.LongClickController.Events.LongClick, this._showLightnessShades.bind(this, colorElement, palette.colors[i]));
            }
            this._paletteContainer.appendChild(colorElement);
        }
        this._paletteContainerMutable = palette.mutable;

        var numItems = palette.colors.length;
        if (palette.mutable)
            numItems++;
        if (palette.mutable) {
            this._paletteContainer.appendChild(this._addColorToolbar.element);
            this._paletteContainer.appendChild(this._deleteIconToolbar.element);
        } else {
            this._addColorToolbar.element.remove();
            this._deleteIconToolbar.element.remove();
        }

        this._togglePalettePanel(false);
        this._focus();
    },

    /**
     * @param {!Element} colorElement
     * @param {string} colorText
     * @param {!WebInspector.Event} event
     */
    _showLightnessShades: function(colorElement, colorText, event)
    {
        /**
         * @param {!Element} element
         * @this {!WebInspector.Spectrum}
         */
        function closeLightnessShades(element)
        {
            this._shadesContainer.classList.add("hidden");
            element.classList.remove("spectrum-shades-shown");
            this._shadesContainer.ownerDocument.removeEventListener("mousedown", this._shadesCloseHandler, true);
            delete this._shadesCloseHandler;
        }

        if (this._shadesCloseHandler)
            this._shadesCloseHandler();

        this._shadesContainer.classList.remove("hidden");
        this._shadesContainer.removeChildren();
        this._shadesContainer.animate([{ transform: "scaleY(0)", opacity: "0" }, { transform: "scaleY(1)", opacity: "1" }], { duration: 200, easing: "cubic-bezier(0.4, 0, 0.2, 1)" });
        var anchorBox = colorElement.boxInWindow();
        this._shadesContainer.style.top = colorElement.offsetTop + "px";
        this._shadesContainer.style.left = colorElement.offsetLeft + "px";
        colorElement.classList.add("spectrum-shades-shown");

        var shades = WebInspector.Spectrum.MaterialPaletteShades[colorText];
        for (var i = shades.length - 1; i >= 0; i--) {
            var shadeElement = this._createPaletteColor(shades[i], i * 200 / shades.length + 100);
            shadeElement.addEventListener("mousedown", this._paletteColorSelected.bind(this, shades[i], false));
            this._shadesContainer.appendChild(shadeElement);
        }

        WebInspector.setCurrentFocusElement(this._shadesContainer);
        this._shadesCloseHandler = closeLightnessShades.bind(this, colorElement);
        this._shadesContainer.ownerDocument.addEventListener("mousedown", this._shadesCloseHandler, true);
    },

    /**
     * @param {!Event} e
     * @return {number}
     */
    _slotIndexForEvent: function(e)
    {
        var localX = e.pageX - this._paletteContainer.totalOffsetLeft();
        var localY = e.pageY - this._paletteContainer.totalOffsetTop();
        var col = Math.min(localX / WebInspector.Spectrum._colorChipSize | 0, WebInspector.Spectrum._itemsPerPaletteRow - 1);
        var row = (localY / WebInspector.Spectrum._colorChipSize) | 0;
        return Math.min(row * WebInspector.Spectrum._itemsPerPaletteRow + col, this._customPaletteSetting.get().colors.length - 1);
    },

    /**
     * @param {!Event} e
     * @return {boolean}
     */
    _isDraggingToBin: function(e)
    {
        return e.pageX > this._deleteIconToolbar.element.totalOffsetLeft();
    },

    /**
     * @param {!Event} e
     * @return {boolean}
     */
    _paletteDragStart: function(e)
    {
        var element = e.deepElementFromPoint();
        if (!element || !element.__mutable)
            return false;

        var index = this._slotIndexForEvent(e);
        this._dragElement = element;
        this._dragHotSpotX = e.pageX - (index % WebInspector.Spectrum._itemsPerPaletteRow) * WebInspector.Spectrum._colorChipSize;
        this._dragHotSpotY = e.pageY - (index / WebInspector.Spectrum._itemsPerPaletteRow | 0) * WebInspector.Spectrum._colorChipSize;

        this._deleteIconToolbar.element.classList.add("dragging");
        return true;
    },

    /**
     * @param {!Event} e
     */
    _paletteDrag: function(e)
    {
        if (e.pageX < this._paletteContainer.totalOffsetLeft() || e.pageY < this._paletteContainer.totalOffsetTop())
            return;
        var newIndex = this._slotIndexForEvent(e);
        var offsetX = e.pageX - (newIndex % WebInspector.Spectrum._itemsPerPaletteRow) * WebInspector.Spectrum._colorChipSize;
        var offsetY = e.pageY - (newIndex / WebInspector.Spectrum._itemsPerPaletteRow | 0) * WebInspector.Spectrum._colorChipSize;

        var isDeleting = this._isDraggingToBin(e);
        this._deleteIconToolbar.element.classList.toggle("delete-color-toolbar-active", isDeleting);
        var dragElementTransform = "translateX(" + (offsetX - this._dragHotSpotX) + "px) translateY(" + (offsetY - this._dragHotSpotY) + "px)";
        this._dragElement.style.transform = isDeleting ? dragElementTransform + " scale(0.8)" : dragElementTransform;
        var children = Array.prototype.slice.call(this._paletteContainer.children);
        var index = children.indexOf(this._dragElement);
        /** @type {!Map.<!Element, {left: number, top: number}>} */
        var swatchOffsets = new Map();
        for (var swatch of children)
            swatchOffsets.set(swatch, swatch.totalOffset());

        if (index !== newIndex)
            this._paletteContainer.insertBefore(this._dragElement, children[newIndex > index ? newIndex + 1 : newIndex]);

        for (var swatch of children) {
            if (swatch === this._dragElement)
                continue;
            var before = swatchOffsets.get(swatch);
            var after = swatch.totalOffset();
            if (before.left !== after.left || before.top !== after.top) {
                swatch.animate([
                    { transform: "translateX(" + (before.left - after.left) + "px) translateY(" + (before.top - after.top) + "px)" },
                    { transform: "none" }], { duration: 100, easing: "cubic-bezier(0, 0, 0.2, 1)" });
            }
        }
    },

    /**
     * @param {!Event} e
     */
    _paletteDragEnd: function(e)
    {
        if (this._isDraggingToBin(e))
            this._dragElement.remove();
        this._dragElement.style.removeProperty("transform");
        var children = this._paletteContainer.children;
        var colors = [];
        for (var i = 0; i < children.length; ++i) {
            if (children[i].__color)
                colors.push(children[i].__color);
        }
        var palette = this._customPaletteSetting.get();
        palette.colors = colors;
        this._customPaletteSetting.set(palette);
        this._showPalette(this._customPaletteSetting.get(), false);

        this._deleteIconToolbar.element.classList.remove("dragging");
        this._deleteIconToolbar.element.classList.remove("delete-color-toolbar-active");
        this._deleteButton.setToggled(false);
    },

    _loadPalettes: function()
    {
        this._palettes.set(WebInspector.Spectrum.MaterialPalette.title, WebInspector.Spectrum.MaterialPalette);
        /** @type {!WebInspector.Spectrum.Palette} */
        var defaultCustomPalette = { title: "Custom", colors: [], mutable: true };
        this._customPaletteSetting = WebInspector.settings.createSetting("customColorPalette", defaultCustomPalette);
        this._palettes.set(this._customPaletteSetting.get().title, this._customPaletteSetting.get());

        this._selectedColorPalette = WebInspector.settings.createSetting("selectedColorPalette", WebInspector.Spectrum.GeneratedPaletteTitle);
        var palette = this._palettes.get(this._selectedColorPalette.get());
        if (palette)
            this._showPalette(palette, true);
    },

    /**
     * @param {!WebInspector.Spectrum.Palette} generatedPalette
     */
    _generatedPaletteLoaded: function(generatedPalette)
    {
        if (generatedPalette.colors.length)
            this._palettes.set(generatedPalette.title, generatedPalette);
        if (this._selectedColorPalette.get() !== generatedPalette.title) {
            return;
        } else if (!generatedPalette.colors.length) {
            this._paletteSelected(WebInspector.Spectrum.MaterialPalette);
            return;
        }
        this._showPalette(generatedPalette, true);
    },

    /**
     * @param {!WebInspector.Spectrum.Palette} palette
     * @return {!Element}
     */
    _createPreviewPaletteElement: function(palette)
    {
        var colorsPerPreviewRow = 5;
        var previewElement = createElementWithClass("div", "palette-preview");
        var titleElement = previewElement.createChild("div", "palette-preview-title");
        titleElement.textContent = palette.title;
        for (var i = 0; i < colorsPerPreviewRow && i < palette.colors.length; i++)
            previewElement.appendChild(this._createPaletteColor(palette.colors[i]));
        for (; i < colorsPerPreviewRow; i++)
            previewElement.createChild("div", "spectrum-palette-color empty-color");
        previewElement.addEventListener("click", this._paletteSelected.bind(this, palette));
        return previewElement;
    },

    /**
     * @param {!WebInspector.Spectrum.Palette} palette
     */
    _paletteSelected: function(palette)
    {
        this._selectedColorPalette.set(palette.title);
        this._showPalette(palette, true);
    },

    _resizeForSelectedPalette: function()
    {
        var palette = this._palettes.get(this._selectedColorPalette.get());
        if (!palette)
            return;
        var numColors = palette.colors.length;
        if (palette === this._customPaletteSetting.get())
            numColors++;
        var rowsNeeded = Math.max(1, Math.ceil(numColors / WebInspector.Spectrum._itemsPerPaletteRow));
        if (this._numPaletteRowsShown === rowsNeeded)
            return;
        this._numPaletteRowsShown = rowsNeeded;
        var paletteColorHeight = 12;
        var paletteMargin = 12;
        var paletteTop = 235;
        this.element.style.height = (paletteTop + paletteMargin + (paletteColorHeight + paletteMargin) * rowsNeeded) + "px";
        this.dispatchEventToListeners(WebInspector.Spectrum.Events.SizeChanged);
    },

    /**
     * @param {string} colorText
     * @param {boolean} matchUserFormat
     */
    _paletteColorSelected: function(colorText, matchUserFormat)
    {
        var color = WebInspector.Color.parse(colorText);
        if (!color)
            return;
        this._innerSetColor(color.hsva(), colorText, matchUserFormat ? this._colorFormat :  color.format(), WebInspector.Spectrum._ChangeSource.Other);
    },

    _addColorToCustomPalette: function()
    {
        var palette = this._customPaletteSetting.get();
        palette.colors.push(this.colorString());
        this._customPaletteSetting.set(palette);
        this._showPalette(this._customPaletteSetting.get(), false);
    },

    /**
     * @param {number} colorIndex
     * @param {!Event} event
     */
    _showPaletteColorContextMenu: function(colorIndex, event)
    {
        if (!this._paletteContainerMutable)
            return;
        var contextMenu = new WebInspector.ContextMenu(event);
        if (colorIndex !== -1) {
            contextMenu.appendItem(WebInspector.UIString("Remove color"), this._deletePaletteColors.bind(this, colorIndex, false));
            contextMenu.appendItem(WebInspector.UIString("Remove all to the right"), this._deletePaletteColors.bind(this, colorIndex, true));
        }
        contextMenu.appendItem(WebInspector.UIString("Clear palette"), this._deletePaletteColors.bind(this, -1, true));
        contextMenu.show();
    },

    /**
     * @param {number} colorIndex
     * @param {boolean} toRight
     */
    _deletePaletteColors: function(colorIndex, toRight)
    {
        var palette = this._customPaletteSetting.get();
        if (toRight)
            palette.colors.splice(colorIndex + 1, palette.colors.length - colorIndex - 1);
        else
            palette.colors.splice(colorIndex, 1);
        this._customPaletteSetting.set(palette);
        this._showPalette(this._customPaletteSetting.get(), false);
    },

    /**
     * @param {!WebInspector.Color} color
     * @param {string} colorFormat
     */
    setColor: function(color, colorFormat)
    {
        this._originalFormat = colorFormat;
        this._innerSetColor(color.hsva(), "", colorFormat, WebInspector.Spectrum._ChangeSource.Model);
    },

    /**
     * @param {!Array<number>|undefined} hsva
     * @param {string|undefined} colorString
     * @param {string|undefined} colorFormat
     * @param {string} changeSource
     */
    _innerSetColor: function(hsva, colorString, colorFormat, changeSource)
    {
        if (hsva !== undefined)
            this._hsv = hsva;
        if (colorString !== undefined)
            this._colorString = colorString;
        if (colorFormat !== undefined) {
            console.assert(colorFormat !== WebInspector.Color.Format.Original, "Spectrum's color format cannot be Original");
            if (colorFormat === WebInspector.Color.Format.RGBA)
                colorFormat = WebInspector.Color.Format.RGB;
            else if (colorFormat === WebInspector.Color.Format.HSLA)
                colorFormat = WebInspector.Color.Format.HSL;
            this._colorFormat = colorFormat;
        }

        this._updateHelperLocations();
        this._updateUI();

        if (changeSource !== WebInspector.Spectrum._ChangeSource.Input)
            this._updateInput();
        if (changeSource !== WebInspector.Spectrum._ChangeSource.Model)
            this.dispatchEventToListeners(WebInspector.Spectrum.Events.ColorChanged, this.colorString());
    },

    /**
     * @param {!WebInspector.Color} color
     */
    setContrastColor: function(color)
    {
        this._contrastColor = color;
        this._updateUI();
    },

    /**
     * @return {!WebInspector.Color}
     */
    _color: function()
    {
        return WebInspector.Color.fromHSVA(this._hsv);
    },

    /**
     * @return {string}
     */
    colorString: function()
    {
        if (this._colorString)
            return this._colorString;
        var cf = WebInspector.Color.Format;
        var color = this._color();
        var colorString = color.asString(this._colorFormat);
        if (colorString)
            return colorString;

        if (this._colorFormat === cf.Nickname || this._colorFormat === cf.ShortHEX) {
            colorString = color.asString(cf.HEX);
            if (colorString)
                return colorString;
        }

        console.assert(color.hasAlpha());
        return this._colorFormat === cf.HSL ? /** @type {string} */(color.asString(cf.HSLA)) : /** @type {string} */(color.asString(cf.RGBA));
    },

    _updateHelperLocations: function()
    {
        var h = this._hsv[0];
        var s = this._hsv[1];
        var v = this._hsv[2];
        var alpha = this._hsv[3];

        // Where to show the little circle that displays your current selected color.
        var dragX = s * this.dragWidth;
        var dragY = this.dragHeight - (v * this.dragHeight);

        dragX = Math.max(-this._colorDragElementHeight,
                        Math.min(this.dragWidth - this._colorDragElementHeight, dragX - this._colorDragElementHeight));
        dragY = Math.max(-this._colorDragElementHeight,
                        Math.min(this.dragHeight - this._colorDragElementHeight, dragY - this._colorDragElementHeight));

        this._colorDragElement.positionAt(dragX, dragY);

        // Where to show the bar that displays your current selected hue.
        var hueSlideX = (1 - h) * this._hueAlphaWidth - this.slideHelperWidth;
        this._hueSlider.style.left = hueSlideX + "px";
        var alphaSlideX = alpha * this._hueAlphaWidth - this.slideHelperWidth;
        this._alphaSlider.style.left = alphaSlideX + "px";
    },

    _updateInput: function()
    {
        var cf = WebInspector.Color.Format;
        if (this._colorFormat === cf.HEX || this._colorFormat === cf.ShortHEX || this._colorFormat === cf.Nickname) {
            this._hexContainer.hidden = false;
            this._displayContainer.hidden = true;
            if (this._colorFormat === cf.ShortHEX && this._color().canBeShortHex())
                this._hexValue.value = this._color().asString(cf.ShortHEX);
            else
                this._hexValue.value = this._color().asString(cf.HEX);
        } else {
            // RGBA, HSLA display.
            this._hexContainer.hidden = true;
            this._displayContainer.hidden = false;
            var isRgb = this._colorFormat === cf.RGB;
            this._textLabels.textContent = isRgb ? "RGBA" : "HSLA";
            var colorValues = isRgb ? this._color().canonicalRGBA() : this._color().canonicalHSLA();
            for (var i = 0; i < 3; ++i) {
                this._textValues[i].value = colorValues[i];
                if (!isRgb && (i === 1 || i === 2))
                    this._textValues[i].value += "%";
            }
            this._textValues[3].value= Math.round(colorValues[3] * 100) / 100;
        }
    },

    /**
     * @param {number} requiredContrast
     */
    _drawContrastRatioLine: function(requiredContrast)
    {
        if (!this._contrastColor || !this.dragWidth || !this.dragHeight)
            return;

        /** const */ var width = this.dragWidth;
        /** const */ var height = this.dragHeight;
        /** const */ var dS = 0.02;
        /** const */ var epsilon = 0.002;
        /** const */ var H = 0;
        /** const */ var S = 1;
        /** const */ var V = 2;
        /** const */ var A = 3;

        var fgRGBA = [];
        WebInspector.Color.hsva2rgba(this._hsv, fgRGBA);
        var fgLuminance = WebInspector.Color.luminance(fgRGBA);
        var bgRGBA = this._contrastColor.rgba();
        var bgLuminance = WebInspector.Color.luminance(bgRGBA);
        var fgIsLighter = fgLuminance > bgLuminance;
        var desiredLuminance = WebInspector.Color.desiredLuminance(bgLuminance, requiredContrast, fgIsLighter);

        var lastV = this._hsv[V];
        var currentSlope = 0;
        var candidateHSVA = [this._hsv[H], 0, 0, this._hsv[A]];
        var pathBuilder = [];
        var candidateRGBA = [];
        WebInspector.Color.hsva2rgba(candidateHSVA, candidateRGBA);
        var flattenedRGBA = [];
        WebInspector.Color.flattenColors(candidateRGBA, bgRGBA, flattenedRGBA);

        /**
         * Approach the desired contrast ratio by modifying the given component
         * from the given starting value.
         * @param {number} index
         * @param {number} x
         * @param {boolean} onAxis
         * @return {?number}
         */
        function approach(index, x, onAxis)
        {
            while (0 <= x && x <= 1) {
                candidateHSVA[index] = x;
                WebInspector.Color.hsva2rgba(candidateHSVA, candidateRGBA);
                WebInspector.Color.flattenColors(candidateRGBA, bgRGBA, flattenedRGBA);
                var fgLuminance = WebInspector.Color.luminance(flattenedRGBA);
                var dLuminance = fgLuminance - desiredLuminance;

                if (Math.abs(dLuminance) < (onAxis ? epsilon / 10 : epsilon))
                    return x;
                else
                    x += (index === V ? -dLuminance : dLuminance);
            }
            return null;
        }

        for (var s = 0; s < 1 + dS; s += dS) {
            s = Math.min(1, s);
            candidateHSVA[S] = s;

            var v = lastV;
            v = lastV + currentSlope * dS;

            v = approach(V, v, s == 0);
            if (v === null)
                break;

            currentSlope = (v - lastV) / dS;

            pathBuilder.push(pathBuilder.length ? "L" : "M");
            pathBuilder.push(s * width);
            pathBuilder.push((1 - v) * height);
        }

        if (s < 1 + dS) {
            s -= dS;
            candidateHSVA[V] = 1;
            s = approach(S, s, true);
            if (s !== null)
                pathBuilder = pathBuilder.concat(["L", s * width, -1])
        }

        this._contrastRatioLine.setAttribute("d", pathBuilder.join(" "));
    },

    _updateUI: function()
    {
        var h = WebInspector.Color.fromHSVA([this._hsv[0], 1, 1, 1]);
        this._colorElement.style.backgroundColor = /** @type {string} */ (h.asString(WebInspector.Color.Format.RGB));
        if (Runtime.experiments.isEnabled("colorContrastRatio")) {
            // TODO(samli): Determine size of text and switch between AA/AAA ratings.
            this._drawContrastRatioLine(4.5);
        }
        this._swatchInnerElement.style.backgroundColor = /** @type {string} */ (this._color().asString(WebInspector.Color.Format.RGBA));
        // Show border if the swatch is white.
        this._swatchInnerElement.classList.toggle("swatch-inner-white", this._color().hsla()[2] > 0.9);
        this._colorDragElement.style.backgroundColor = /** @type {string} */ (this._color().asString(WebInspector.Color.Format.RGBA));
        var noAlpha = WebInspector.Color.fromHSVA(this._hsv.slice(0,3).concat(1));
        this._alphaElementBackground.style.backgroundImage = String.sprintf("linear-gradient(to right, rgba(0,0,0,0), %s)", noAlpha.asString(WebInspector.Color.Format.RGB));
    },

    _formatViewSwitch: function()
    {
        var cf = WebInspector.Color.Format;
        var format = cf.RGB;
        if (this._colorFormat === cf.RGB)
            format = cf.HSL;
        else if (this._colorFormat === cf.HSL && !this._color().hasAlpha())
            format = this._originalFormat === cf.ShortHEX ? cf.ShortHEX : cf.HEX;
        this._innerSetColor(undefined, "", format, WebInspector.Spectrum._ChangeSource.Other);
    },

    /**
     * @param {!Event} event
     */
    _inputChanged: function(event)
    {
        /**
         * @param {!Element} element
         * @return {string}
         */
        function elementValue(element)
        {
            return element.value;
        }

        var inputElement = /** @type {!Element} */(event.currentTarget);
        var arrowKeyOrMouseWheelEvent = (event.keyIdentifier === "Up" || event.keyIdentifier === "Down" || event.type === "mousewheel");
        var pageKeyPressed = (event.keyIdentifier === "PageUp" || event.keyIdentifier === "PageDown");
        if (arrowKeyOrMouseWheelEvent || pageKeyPressed) {
            var newValue = WebInspector.createReplacementString(inputElement.value, event);
            if (newValue) {
                inputElement.value = newValue;
                inputElement.selectionStart = 0;
                inputElement.selectionEnd = newValue.length;
            }
            event.consume(true);
        }

        const cf = WebInspector.Color.Format;
        var colorString;
        if (this._colorFormat === cf.HEX || this._colorFormat === cf.ShortHEX) {
            colorString = this._hexValue.value;
        } else {
            var format = this._colorFormat === cf.RGB ? "rgba" : "hsla";
            var values = this._textValues.map(elementValue).join(",");
            colorString = String.sprintf("%s(%s)", format, values);
        }

        var color = WebInspector.Color.parse(colorString);
        if (!color)
            return;
        var hsv = color.hsva();
        if (this._colorFormat === cf.HEX || this._colorFormat === cf.ShortHEX)
            this._colorFormat = color.canBeShortHex() ? cf.ShortHEX : cf.HEX;
        this._innerSetColor(hsv, colorString, undefined, WebInspector.Spectrum._ChangeSource.Input);
    },

    wasShown: function()
    {
        this._hueAlphaWidth = this._hueElement.offsetWidth;
        this.slideHelperWidth = this._hueSlider.offsetWidth / 2;
        this.dragWidth = this._colorElement.offsetWidth;
        this.dragHeight = this._colorElement.offsetHeight;
        this._colorDragElementHeight = this._colorDragElement.offsetHeight / 2;
        this._innerSetColor(undefined, undefined, undefined, WebInspector.Spectrum._ChangeSource.Model);
        this._toggleColorPicker(true);
        WebInspector.targetManager.addModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.ColorPicked, this._colorPicked, this);
    },

    willHide: function()
    {
        this._toggleColorPicker(false);
        WebInspector.targetManager.removeModelListener(WebInspector.ResourceTreeModel, WebInspector.ResourceTreeModel.EventTypes.ColorPicked, this._colorPicked, this);
    },

    /**
     * @param {boolean=} enabled
     * @param {!WebInspector.Event=} event
     */
    _toggleColorPicker: function(enabled, event)
    {
        if (enabled === undefined)
            enabled = !this._colorPickerButton.toggled();
        this._colorPickerButton.setToggled(enabled);
        for (var target of WebInspector.targetManager.targets())
            target.pageAgent().setColorPickerEnabled(enabled);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _colorPicked: function(event)
    {
        var rgbColor = /** @type {!DOMAgent.RGBA} */ (event.data);
        var rgba = [rgbColor.r, rgbColor.g, rgbColor.b, (rgbColor.a / 2.55 | 0) / 100];
        var color = WebInspector.Color.fromRGBA(rgba);
        this._innerSetColor(color.hsva(), "", undefined, WebInspector.Spectrum._ChangeSource.Other);
        InspectorFrontendHost.bringToFront();
    },


    __proto__: WebInspector.VBox.prototype
}

/** @typedef {{ title: string, colors: !Array.<string>, mutable: boolean }} */
WebInspector.Spectrum.Palette;
WebInspector.Spectrum.GeneratedPaletteTitle = "Page colors";

/**
 * @constructor
 * @param {function(!WebInspector.Spectrum.Palette)} callback
 */
WebInspector.Spectrum.PaletteGenerator = function(callback)
{
    this._callback = callback;
    /** @type {!Map.<string, number>} */
    this._frequencyMap = new Map();
    var stylesheetPromises = [];
    for (var target of WebInspector.targetManager.targets(WebInspector.Target.Type.Page)) {
        var cssModel = WebInspector.CSSStyleModel.fromTarget(target);
        for (var stylesheet of cssModel.allStyleSheets())
            stylesheetPromises.push(new Promise(this._processStylesheet.bind(this, stylesheet)));
    }
    Promise.all(stylesheetPromises)
        .catchException(null)
        .then(this._finish.bind(this));
}

WebInspector.Spectrum.PaletteGenerator.prototype = {
    /**
     * @param {string} a
     * @param {string} b
     * @return {number}
     */
    _frequencyComparator: function(a, b)
    {
        return this._frequencyMap.get(b) - this._frequencyMap.get(a);
    },

    _finish: function()
    {
        /**
         * @param {string} a
         * @param {string} b
         * @return {number}
         */
        function hueComparator(a, b)
        {
            var hsva = paletteColors.get(a).hsva();
            var hsvb = paletteColors.get(b).hsva();

            // First trim the shades of gray
            if (hsvb[1] < 0.12 && hsva[1] < 0.12)
                return hsvb[2]*hsvb[3] - hsva[2]*hsva[3];
            if (hsvb[1] < 0.12)
                return -1;
            if (hsva[1] < 0.12)
                return 1;

            // Equal hue -> sort by sat
            if (hsvb[0] === hsva[0])
                return hsvb[1]*hsvb[3] - hsva[1]*hsva[3];

            return (hsvb[0] + 0.94) % 1 - (hsva[0] + 0.94) % 1;
        }

        var colors = this._frequencyMap.keysArray();
        colors = colors.sort(this._frequencyComparator.bind(this));
        /** @type {!Map.<string, !WebInspector.Color>} */
        var paletteColors = new Map();
        var colorsPerRow = 24;
        while (paletteColors.size < colorsPerRow && colors.length) {
            var colorText = colors.shift();
            var color = WebInspector.Color.parse(colorText);
            if (!color || color.nickname() === "white" || color.nickname() === "black")
                continue;
            paletteColors.set(colorText, color);
        }

        this._callback({ title: WebInspector.Spectrum.GeneratedPaletteTitle, colors: paletteColors.keysArray().sort(hueComparator), mutable: false });
    },

    /**
     * @param {!WebInspector.CSSStyleSheetHeader} stylesheet
     * @param {function(?)} resolve
     * @this {WebInspector.Spectrum.PaletteGenerator}
     */
    _processStylesheet: function(stylesheet, resolve)
    {
        /**
         * @param {?string} text
         * @this {WebInspector.Spectrum.PaletteGenerator}
         */
        function parseContent(text)
        {
            text = text.toLowerCase();
            var regexResult = text.match(/((?:rgb|hsl)a?\([^)]+\)|#[0-9a-f]{6}|#[0-9a-f]{3})/g) || [];
            for (var c of regexResult) {
                var frequency = this._frequencyMap.get(c) || 0;
                this._frequencyMap.set(c, ++frequency);
            }
            resolve(null);
        }

        stylesheet.requestContent(parseContent.bind(this));
    }
}

WebInspector.Spectrum.MaterialPaletteShades = {
    "#F44336": ["#FFEBEE", "#FFCDD2", "#EF9A9A", "#E57373", "#EF5350", "#F44336", "#E53935", "#D32F2F", "#C62828", "#B71C1C"],
    "#E91E63": ["#FCE4EC", "#F8BBD0", "#F48FB1", "#F06292", "#EC407A", "#E91E63", "#D81B60", "#C2185B", "#AD1457", "#880E4F"],
    "#9C27B0": ["#F3E5F5", "#E1BEE7", "#CE93D8", "#BA68C8", "#AB47BC", "#9C27B0", "#8E24AA", "#7B1FA2", "#6A1B9A", "#4A148C"],
    "#673AB7": ["#EDE7F6", "#D1C4E9", "#B39DDB", "#9575CD", "#7E57C2", "#673AB7", "#5E35B1", "#512DA8", "#4527A0", "#311B92"],
    "#3F51B5": ["#E8EAF6", "#C5CAE9", "#9FA8DA", "#7986CB", "#5C6BC0", "#3F51B5", "#3949AB", "#303F9F", "#283593", "#1A237E"],
    "#2196F3": ["#E3F2FD", "#BBDEFB", "#90CAF9", "#64B5F6", "#42A5F5", "#2196F3", "#1E88E5", "#1976D2", "#1565C0", "#0D47A1"],
    "#03A9F4": ["#E1F5FE", "#B3E5FC", "#81D4FA", "#4FC3F7", "#29B6F6", "#03A9F4", "#039BE5", "#0288D1", "#0277BD", "#01579B"],
    "#00BCD4": ["#E0F7FA", "#B2EBF2", "#80DEEA", "#4DD0E1", "#26C6DA", "#00BCD4", "#00ACC1", "#0097A7", "#00838F", "#006064"],
    "#009688": ["#E0F2F1", "#B2DFDB", "#80CBC4", "#4DB6AC", "#26A69A", "#009688", "#00897B", "#00796B", "#00695C", "#004D40"],
    "#4CAF50": ["#E8F5E9", "#C8E6C9", "#A5D6A7", "#81C784", "#66BB6A", "#4CAF50", "#43A047", "#388E3C", "#2E7D32", "#1B5E20"],
    "#8BC34A": ["#F1F8E9", "#DCEDC8", "#C5E1A5", "#AED581", "#9CCC65", "#8BC34A", "#7CB342", "#689F38", "#558B2F", "#33691E"],
    "#CDDC39": ["#F9FBE7", "#F0F4C3", "#E6EE9C", "#DCE775", "#D4E157", "#CDDC39", "#C0CA33", "#AFB42B", "#9E9D24", "#827717"],
    "#FFEB3B": ["#FFFDE7", "#FFF9C4", "#FFF59D", "#FFF176", "#FFEE58", "#FFEB3B", "#FDD835", "#FBC02D", "#F9A825", "#F57F17"],
    "#FFC107": ["#FFF8E1", "#FFECB3", "#FFE082", "#FFD54F", "#FFCA28", "#FFC107", "#FFB300", "#FFA000", "#FF8F00", "#FF6F00"],
    "#FF9800": ["#FFF3E0", "#FFE0B2", "#FFCC80", "#FFB74D", "#FFA726", "#FF9800", "#FB8C00", "#F57C00", "#EF6C00", "#E65100"],
    "#FF5722": ["#FBE9E7", "#FFCCBC", "#FFAB91", "#FF8A65", "#FF7043", "#FF5722", "#F4511E", "#E64A19", "#D84315", "#BF360C"],
    "#795548": ["#EFEBE9", "#D7CCC8", "#BCAAA4", "#A1887F", "#8D6E63", "#795548", "#6D4C41", "#5D4037", "#4E342E", "#3E2723"],
    "#9E9E9E": ["#FAFAFA", "#F5F5F5", "#EEEEEE", "#E0E0E0", "#BDBDBD", "#9E9E9E", "#757575", "#616161", "#424242", "#212121"],
    "#607D8B": ["#ECEFF1", "#CFD8DC", "#B0BEC5", "#90A4AE", "#78909C", "#607D8B", "#546E7A", "#455A64", "#37474F", "#263238"]
};

WebInspector.Spectrum.MaterialPalette = { title: "Material", mutable: false, matchUserFormat: true, colors: Object.keys(WebInspector.Spectrum.MaterialPaletteShades) };
