// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
InlineEditor.CSSShadowEditor = class extends UI.VBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('inline_editor/cssShadowEditor.css');
    this.contentElement.tabIndex = 0;
    this.setDefaultFocusedElement(this.contentElement);

    this._typeField = this.contentElement.createChild('div', 'shadow-editor-field shadow-editor-flex-field');
    this._typeField.createChild('label', 'shadow-editor-label').textContent = Common.UIString('Type');
    this._outsetButton = this._typeField.createChild('button', 'shadow-editor-button-left');
    this._outsetButton.textContent = Common.UIString('Outset');
    this._outsetButton.addEventListener('click', this._onButtonClick.bind(this), false);
    this._insetButton = this._typeField.createChild('button', 'shadow-editor-button-right');
    this._insetButton.textContent = Common.UIString('Inset');
    this._insetButton.addEventListener('click', this._onButtonClick.bind(this), false);

    const xField = this.contentElement.createChild('div', 'shadow-editor-field');
    this._xInput = this._createTextInput(xField, Common.UIString('X offset'));
    const yField = this.contentElement.createChild('div', 'shadow-editor-field');
    this._yInput = this._createTextInput(yField, Common.UIString('Y offset'));
    this._xySlider = xField.createChild('canvas', 'shadow-editor-2D-slider');
    this._xySlider.width = InlineEditor.CSSShadowEditor.canvasSize;
    this._xySlider.height = InlineEditor.CSSShadowEditor.canvasSize;
    this._xySlider.tabIndex = -1;
    this._halfCanvasSize = InlineEditor.CSSShadowEditor.canvasSize / 2;
    this._innerCanvasSize = this._halfCanvasSize - InlineEditor.CSSShadowEditor.sliderThumbRadius;
    UI.installDragHandle(this._xySlider, this._dragStart.bind(this), this._dragMove.bind(this), null, 'default');
    this._xySlider.addEventListener('keydown', this._onCanvasArrowKey.bind(this), false);
    this._xySlider.addEventListener('blur', this._onCanvasBlur.bind(this), false);

    const blurField =
        this.contentElement.createChild('div', 'shadow-editor-field shadow-editor-flex-field shadow-editor-blur-field');
    this._blurInput = this._createTextInput(blurField, Common.UIString('Blur'));
    this._blurSlider = this._createSlider(blurField);

    this._spreadField = this.contentElement.createChild('div', 'shadow-editor-field shadow-editor-flex-field');
    this._spreadInput = this._createTextInput(this._spreadField, Common.UIString('Spread'));
    this._spreadSlider = this._createSlider(this._spreadField);
  }

  /**
   * @param {!Element} field
   * @param {string} propertyName
   * @return {!Element}
   */
  _createTextInput(field, propertyName) {
    const label = field.createChild('label', 'shadow-editor-label');
    label.textContent = propertyName;
    label.setAttribute('for', propertyName);
    const textInput = UI.createInput('shadow-editor-text-input', 'text');
    field.appendChild(textInput);
    textInput.id = propertyName;
    textInput.addEventListener('keydown', this._handleValueModification.bind(this), false);
    textInput.addEventListener('mousewheel', this._handleValueModification.bind(this), false);
    textInput.addEventListener('input', this._onTextInput.bind(this), false);
    textInput.addEventListener('blur', this._onTextBlur.bind(this), false);
    return textInput;
  }

  /**
   * @param {!Element} field
   * @return {!Element}
   */
  _createSlider(field) {
    const slider = UI.createSliderLabel(0, InlineEditor.CSSShadowEditor.maxRange, -1);
    slider.addEventListener('input', this._onSliderInput.bind(this), false);
    field.appendChild(slider);
    return slider;
  }

  /**
   * @override
   */
  wasShown() {
    this._updateUI();
  }

  /**
   * @param {!InlineEditor.CSSShadowModel} model
   */
  setModel(model) {
    this._model = model;
    this._typeField.classList.toggle('hidden', !model.isBoxShadow());
    this._spreadField.classList.toggle('hidden', !model.isBoxShadow());
    this._updateUI();
  }

  _updateUI() {
    this._updateButtons();
    this._xInput.value = this._model.offsetX().asCSSText();
    this._yInput.value = this._model.offsetY().asCSSText();
    this._blurInput.value = this._model.blurRadius().asCSSText();
    this._spreadInput.value = this._model.spreadRadius().asCSSText();
    this._blurSlider.value = this._model.blurRadius().amount;
    this._spreadSlider.value = this._model.spreadRadius().amount;
    this._updateCanvas(false);
  }

  _updateButtons() {
    this._insetButton.classList.toggle('enabled', this._model.inset());
    this._outsetButton.classList.toggle('enabled', !this._model.inset());
  }

  /**
   * @param {boolean} drawFocus
   */
  _updateCanvas(drawFocus) {
    const context = this._xySlider.getContext('2d');
    context.clearRect(0, 0, this._xySlider.width, this._xySlider.height);

    // Draw dashed axes.
    context.save();
    context.setLineDash([1, 1]);
    context.strokeStyle = 'rgba(210, 210, 210, 0.8)';
    context.beginPath();
    context.moveTo(this._halfCanvasSize, 0);
    context.lineTo(this._halfCanvasSize, InlineEditor.CSSShadowEditor.canvasSize);
    context.moveTo(0, this._halfCanvasSize);
    context.lineTo(InlineEditor.CSSShadowEditor.canvasSize, this._halfCanvasSize);
    context.stroke();
    context.restore();

    const thumbPoint = this._sliderThumbPosition();
    // Draw 2D slider line.
    context.save();
    context.translate(this._halfCanvasSize, this._halfCanvasSize);
    context.lineWidth = 2;
    context.strokeStyle = 'rgba(130, 130, 130, 0.75)';
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(thumbPoint.x, thumbPoint.y);
    context.stroke();
    // Draw 2D slider thumb.
    if (drawFocus) {
      context.beginPath();
      context.fillStyle = 'rgba(66, 133, 244, 0.4)';
      context.arc(thumbPoint.x, thumbPoint.y, InlineEditor.CSSShadowEditor.sliderThumbRadius + 2, 0, 2 * Math.PI);
      context.fill();
    }
    context.beginPath();
    context.fillStyle = '#4285F4';
    context.arc(thumbPoint.x, thumbPoint.y, InlineEditor.CSSShadowEditor.sliderThumbRadius, 0, 2 * Math.PI);
    context.fill();
    context.restore();
  }

  /**
   * @param {!Event} event
   */
  _onButtonClick(event) {
    const insetClicked = (event.currentTarget === this._insetButton);
    if (insetClicked && this._model.inset() || !insetClicked && !this._model.inset())
      return;
    this._model.setInset(insetClicked);
    this._updateButtons();
    this.dispatchEventToListeners(InlineEditor.CSSShadowEditor.Events.ShadowChanged, this._model);
  }

  /**
   * @param {!Event} event
   */
  _handleValueModification(event) {
    const modifiedValue = UI.createReplacementString(event.currentTarget.value, event, customNumberHandler);
    if (!modifiedValue)
      return;
    const length = InlineEditor.CSSLength.parse(modifiedValue);
    if (!length)
      return;
    if (event.currentTarget === this._blurInput && length.amount < 0)
      length.amount = 0;
    event.currentTarget.value = length.asCSSText();
    event.currentTarget.selectionStart = 0;
    event.currentTarget.selectionEnd = event.currentTarget.value.length;
    this._onTextInput(event);
    event.consume(true);

    /**
     * @param {string} prefix
     * @param {number} number
     * @param {string} suffix
     * @return {string}
     */
    function customNumberHandler(prefix, number, suffix) {
      if (!suffix.length)
        suffix = InlineEditor.CSSShadowEditor.defaultUnit;
      return prefix + number + suffix;
    }
  }

  /**
   * @param {!Event} event
   */
  _onTextInput(event) {
    this._changedElement = event.currentTarget;
    this._changedElement.classList.remove('invalid');
    const length = InlineEditor.CSSLength.parse(event.currentTarget.value);
    if (!length || event.currentTarget === this._blurInput && length.amount < 0)
      return;
    if (event.currentTarget === this._xInput) {
      this._model.setOffsetX(length);
      this._updateCanvas(false);
    } else if (event.currentTarget === this._yInput) {
      this._model.setOffsetY(length);
      this._updateCanvas(false);
    } else if (event.currentTarget === this._blurInput) {
      this._model.setBlurRadius(length);
      this._blurSlider.value = length.amount;
    } else if (event.currentTarget === this._spreadInput) {
      this._model.setSpreadRadius(length);
      this._spreadSlider.value = length.amount;
    }
    this.dispatchEventToListeners(InlineEditor.CSSShadowEditor.Events.ShadowChanged, this._model);
  }

  _onTextBlur() {
    if (!this._changedElement)
      return;
    let length = !this._changedElement.value.trim() ? InlineEditor.CSSLength.zero() :
                                                      InlineEditor.CSSLength.parse(this._changedElement.value);
    if (!length)
      length = InlineEditor.CSSLength.parse(this._changedElement.value + InlineEditor.CSSShadowEditor.defaultUnit);
    if (!length) {
      this._changedElement.classList.add('invalid');
      this._changedElement = null;
      return;
    }
    if (this._changedElement === this._xInput) {
      this._model.setOffsetX(length);
      this._xInput.value = length.asCSSText();
      this._updateCanvas(false);
    } else if (this._changedElement === this._yInput) {
      this._model.setOffsetY(length);
      this._yInput.value = length.asCSSText();
      this._updateCanvas(false);
    } else if (this._changedElement === this._blurInput) {
      if (length.amount < 0)
        length = InlineEditor.CSSLength.zero();
      this._model.setBlurRadius(length);
      this._blurInput.value = length.asCSSText();
      this._blurSlider.value = length.amount;
    } else if (this._changedElement === this._spreadInput) {
      this._model.setSpreadRadius(length);
      this._spreadInput.value = length.asCSSText();
      this._spreadSlider.value = length.amount;
    }
    this._changedElement = null;
    this.dispatchEventToListeners(InlineEditor.CSSShadowEditor.Events.ShadowChanged, this._model);
  }

  /**
   * @param {!Event} event
   */
  _onSliderInput(event) {
    if (event.currentTarget === this._blurSlider) {
      this._model.setBlurRadius(new InlineEditor.CSSLength(
          this._blurSlider.value, this._model.blurRadius().unit || InlineEditor.CSSShadowEditor.defaultUnit));
      this._blurInput.value = this._model.blurRadius().asCSSText();
      this._blurInput.classList.remove('invalid');
    } else if (event.currentTarget === this._spreadSlider) {
      this._model.setSpreadRadius(new InlineEditor.CSSLength(
          this._spreadSlider.value, this._model.spreadRadius().unit || InlineEditor.CSSShadowEditor.defaultUnit));
      this._spreadInput.value = this._model.spreadRadius().asCSSText();
      this._spreadInput.classList.remove('invalid');
    }
    this.dispatchEventToListeners(InlineEditor.CSSShadowEditor.Events.ShadowChanged, this._model);
  }

  /**
   * @param {!MouseEvent} event
   * @return {boolean}
   */
  _dragStart(event) {
    this._xySlider.focus();
    this._updateCanvas(true);
    this._canvasOrigin = new UI.Geometry.Point(
        this._xySlider.totalOffsetLeft() + this._halfCanvasSize,
        this._xySlider.totalOffsetTop() + this._halfCanvasSize);
    const clickedPoint = new UI.Geometry.Point(event.x - this._canvasOrigin.x, event.y - this._canvasOrigin.y);
    const thumbPoint = this._sliderThumbPosition();
    if (clickedPoint.distanceTo(thumbPoint) >= InlineEditor.CSSShadowEditor.sliderThumbRadius)
      this._dragMove(event);
    return true;
  }

  /**
   * @param {!MouseEvent} event
   */
  _dragMove(event) {
    let point = new UI.Geometry.Point(event.x - this._canvasOrigin.x, event.y - this._canvasOrigin.y);
    if (event.shiftKey)
      point = this._snapToClosestDirection(point);
    const constrainedPoint = this._constrainPoint(point, this._innerCanvasSize);
    const newX = Math.round((constrainedPoint.x / this._innerCanvasSize) * InlineEditor.CSSShadowEditor.maxRange);
    const newY = Math.round((constrainedPoint.y / this._innerCanvasSize) * InlineEditor.CSSShadowEditor.maxRange);

    if (event.shiftKey) {
      this._model.setOffsetX(
          new InlineEditor.CSSLength(newX, this._model.offsetX().unit || InlineEditor.CSSShadowEditor.defaultUnit));
      this._model.setOffsetY(
          new InlineEditor.CSSLength(newY, this._model.offsetY().unit || InlineEditor.CSSShadowEditor.defaultUnit));
    } else {
      if (!event.altKey) {
        this._model.setOffsetX(
            new InlineEditor.CSSLength(newX, this._model.offsetX().unit || InlineEditor.CSSShadowEditor.defaultUnit));
      }
      if (!UI.KeyboardShortcut.eventHasCtrlOrMeta(event)) {
        this._model.setOffsetY(
            new InlineEditor.CSSLength(newY, this._model.offsetY().unit || InlineEditor.CSSShadowEditor.defaultUnit));
      }
    }
    this._xInput.value = this._model.offsetX().asCSSText();
    this._yInput.value = this._model.offsetY().asCSSText();
    this._xInput.classList.remove('invalid');
    this._yInput.classList.remove('invalid');
    this._updateCanvas(true);
    this.dispatchEventToListeners(InlineEditor.CSSShadowEditor.Events.ShadowChanged, this._model);
  }

  _onCanvasBlur() {
    this._updateCanvas(false);
  }

  /**
   * @param {!Event} event
   */
  _onCanvasArrowKey(event) {
    let shiftX = 0;
    let shiftY = 0;
    if (event.key === 'ArrowRight')
      shiftX = 1;
    else if (event.key === 'ArrowLeft')
      shiftX = -1;
    else if (event.key === 'ArrowUp')
      shiftY = -1;
    else if (event.key === 'ArrowDown')
      shiftY = 1;

    if (!shiftX && !shiftY)
      return;
    event.consume(true);

    if (shiftX) {
      const offsetX = this._model.offsetX();
      const newAmount = Number.constrain(
          offsetX.amount + shiftX, -InlineEditor.CSSShadowEditor.maxRange, InlineEditor.CSSShadowEditor.maxRange);
      if (newAmount === offsetX.amount)
        return;
      this._model.setOffsetX(
          new InlineEditor.CSSLength(newAmount, offsetX.unit || InlineEditor.CSSShadowEditor.defaultUnit));
      this._xInput.value = this._model.offsetX().asCSSText();
      this._xInput.classList.remove('invalid');
    }
    if (shiftY) {
      const offsetY = this._model.offsetY();
      const newAmount = Number.constrain(
          offsetY.amount + shiftY, -InlineEditor.CSSShadowEditor.maxRange, InlineEditor.CSSShadowEditor.maxRange);
      if (newAmount === offsetY.amount)
        return;
      this._model.setOffsetY(
          new InlineEditor.CSSLength(newAmount, offsetY.unit || InlineEditor.CSSShadowEditor.defaultUnit));
      this._yInput.value = this._model.offsetY().asCSSText();
      this._yInput.classList.remove('invalid');
    }
    this._updateCanvas(true);
    this.dispatchEventToListeners(InlineEditor.CSSShadowEditor.Events.ShadowChanged, this._model);
  }

  /**
   * @param {!UI.Geometry.Point} point
   * @param {number} max
   * @return {!UI.Geometry.Point}
   */
  _constrainPoint(point, max) {
    if (Math.abs(point.x) <= max && Math.abs(point.y) <= max)
      return new UI.Geometry.Point(point.x, point.y);
    return point.scale(max / Math.max(Math.abs(point.x), Math.abs(point.y)));
  }

  /**
   * @param {!UI.Geometry.Point} point
   * @return {!UI.Geometry.Point}
   */
  _snapToClosestDirection(point) {
    let minDistance = Number.MAX_VALUE;
    let closestPoint = point;

    const directions = [
      new UI.Geometry.Point(0, -1),  // North
      new UI.Geometry.Point(1, -1),  // Northeast
      new UI.Geometry.Point(1, 0),   // East
      new UI.Geometry.Point(1, 1)    // Southeast
    ];

    for (const direction of directions) {
      const projection = point.projectOn(direction);
      const distance = point.distanceTo(projection);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = projection;
      }
    }

    return closestPoint;
  }

  /**
   * @return {!UI.Geometry.Point}
   */
  _sliderThumbPosition() {
    const x = (this._model.offsetX().amount / InlineEditor.CSSShadowEditor.maxRange) * this._innerCanvasSize;
    const y = (this._model.offsetY().amount / InlineEditor.CSSShadowEditor.maxRange) * this._innerCanvasSize;
    return this._constrainPoint(new UI.Geometry.Point(x, y), this._innerCanvasSize);
  }
};

/** @enum {symbol} */
InlineEditor.CSSShadowEditor.Events = {
  ShadowChanged: Symbol('ShadowChanged')
};

/** @type {number} */
InlineEditor.CSSShadowEditor.maxRange = 20;
/** @type {string} */
InlineEditor.CSSShadowEditor.defaultUnit = 'px';
/** @type {number} */
InlineEditor.CSSShadowEditor.sliderThumbRadius = 6;
/** @type {number} */
InlineEditor.CSSShadowEditor.canvasSize = 88;
