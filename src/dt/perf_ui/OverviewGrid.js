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
PerfUI.OverviewGrid = class {
  /**
   * @param {string} prefix
   */
  constructor(prefix) {
    this.element = createElement('div');
    this.element.id = prefix + '-overview-container';

    this._grid = new PerfUI.TimelineGrid();
    this._grid.element.id = prefix + '-overview-grid';
    this._grid.setScrollTop(0);

    this.element.appendChild(this._grid.element);

    this._window = new PerfUI.OverviewGrid.Window(this.element, this._grid.dividersLabelBarElement);
  }

  /**
   * @return {number}
   */
  clientWidth() {
    return this.element.clientWidth;
  }

  /**
   * @param {!PerfUI.TimelineGrid.Calculator} calculator
   */
  updateDividers(calculator) {
    this._grid.updateDividers(calculator);
  }

  /**
   * @param {!Array.<!Element>} dividers
   */
  addEventDividers(dividers) {
    this._grid.addEventDividers(dividers);
  }

  removeEventDividers() {
    this._grid.removeEventDividers();
  }

  reset() {
    this._window.reset();
  }

  /**
   * @return {number}
   */
  windowLeft() {
    return this._window.windowLeft;
  }

  /**
   * @return {number}
   */
  windowRight() {
    return this._window.windowRight;
  }

  /**
   * @param {number} left
   * @param {number} right
   */
  setWindow(left, right) {
    this._window._setWindow(left, right);
  }

  /**
   * @param {symbol} eventType
   * @param {function(!Common.Event)} listener
   * @param {!Object=} thisObject
   * @return {!Common.EventTarget.EventDescriptor}
   */
  addEventListener(eventType, listener, thisObject) {
    return this._window.addEventListener(eventType, listener, thisObject);
  }

  /**
   * @param {?function(!Event):boolean} clickHandler
   */
  setClickHandler(clickHandler) {
    this._window.setClickHandler(clickHandler);
  }

  /**
   * @param {number} zoomFactor
   * @param {number} referencePoint
   */
  zoom(zoomFactor, referencePoint) {
    this._window._zoom(zoomFactor, referencePoint);
  }

  /**
   * @param {boolean} enabled
   */
  setResizeEnabled(enabled) {
    this._window.setEnabled(enabled);
  }
};

PerfUI.OverviewGrid.MinSelectableSize = 14;

PerfUI.OverviewGrid.WindowScrollSpeedFactor = .3;

PerfUI.OverviewGrid.ResizerOffset = 3.5;  // half pixel because offset values are not rounded but ceiled

/**
 * @unrestricted
 */
PerfUI.OverviewGrid.Window = class extends Common.Object {
  /**
   * @param {!Element} parentElement
   * @param {!Element=} dividersLabelBarElement
   */
  constructor(parentElement, dividersLabelBarElement) {
    super();
    this._parentElement = parentElement;

    UI.installDragHandle(
        this._parentElement, this._startWindowSelectorDragging.bind(this), this._windowSelectorDragging.bind(this),
        this._endWindowSelectorDragging.bind(this), 'text', null);
    if (dividersLabelBarElement) {
      UI.installDragHandle(
          dividersLabelBarElement, this._startWindowDragging.bind(this), this._windowDragging.bind(this), null,
          '-webkit-grabbing', '-webkit-grab');
    }

    this._parentElement.addEventListener('mousewheel', this._onMouseWheel.bind(this), true);
    this._parentElement.addEventListener('dblclick', this._resizeWindowMaximum.bind(this), true);
    UI.appendStyle(this._parentElement, 'perf_ui/overviewGrid.css');

    this._leftResizeElement = parentElement.createChild('div', 'overview-grid-window-resizer');
    UI.installDragHandle(
        this._leftResizeElement, this._resizerElementStartDragging.bind(this),
        this._leftResizeElementDragging.bind(this), null, 'ew-resize');
    this._rightResizeElement = parentElement.createChild('div', 'overview-grid-window-resizer');
    UI.installDragHandle(
        this._rightResizeElement, this._resizerElementStartDragging.bind(this),
        this._rightResizeElementDragging.bind(this), null, 'ew-resize');

    this._leftCurtainElement = parentElement.createChild('div', 'window-curtain-left');
    this._rightCurtainElement = parentElement.createChild('div', 'window-curtain-right');
    this.reset();
  }

  reset() {
    this.windowLeft = 0.0;
    this.windowRight = 1.0;
    this.setEnabled(true);
    this._updateCurtains();
  }

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = enabled;
  }

  /**
   * @param {?function(!Event):boolean} clickHandler
   */
  setClickHandler(clickHandler) {
    this._clickHandler = clickHandler;
  }

  /**
   * @param {!Event} event
   */
  _resizerElementStartDragging(event) {
    if (!this._enabled)
      return false;
    this._resizerParentOffsetLeft = event.pageX - event.offsetX - event.target.offsetLeft;
    event.stopPropagation();
    return true;
  }

  /**
   * @param {!Event} event
   */
  _leftResizeElementDragging(event) {
    this._resizeWindowLeft(event.pageX - this._resizerParentOffsetLeft);
    event.preventDefault();
  }

  /**
   * @param {!Event} event
   */
  _rightResizeElementDragging(event) {
    this._resizeWindowRight(event.pageX - this._resizerParentOffsetLeft);
    event.preventDefault();
  }

  /**
   * @param {!Event} event
   * @return {boolean}
   */
  _startWindowSelectorDragging(event) {
    if (!this._enabled)
      return false;
    this._offsetLeft = this._parentElement.totalOffsetLeft();
    const position = event.x - this._offsetLeft;
    this._overviewWindowSelector = new PerfUI.OverviewGrid.WindowSelector(this._parentElement, position);
    return true;
  }

  /**
   * @param {!Event} event
   */
  _windowSelectorDragging(event) {
    this._overviewWindowSelector._updatePosition(event.x - this._offsetLeft);
    event.preventDefault();
  }

  /**
   * @param {!Event} event
   */
  _endWindowSelectorDragging(event) {
    const window = this._overviewWindowSelector._close(event.x - this._offsetLeft);
    delete this._overviewWindowSelector;
    const clickThreshold = 3;
    if (window.end - window.start < clickThreshold) {
      if (this._clickHandler && this._clickHandler.call(null, event))
        return;
      const middle = window.end;
      window.start = Math.max(0, middle - PerfUI.OverviewGrid.MinSelectableSize / 2);
      window.end = Math.min(this._parentElement.clientWidth, middle + PerfUI.OverviewGrid.MinSelectableSize / 2);
    } else if (window.end - window.start < PerfUI.OverviewGrid.MinSelectableSize) {
      if (this._parentElement.clientWidth - window.end > PerfUI.OverviewGrid.MinSelectableSize)
        window.end = window.start + PerfUI.OverviewGrid.MinSelectableSize;
      else
        window.start = window.end - PerfUI.OverviewGrid.MinSelectableSize;
    }
    this._setWindowPosition(window.start, window.end);
  }

  /**
   * @param {!Event} event
   * @return {boolean}
   */
  _startWindowDragging(event) {
    this._dragStartPoint = event.pageX;
    this._dragStartLeft = this.windowLeft;
    this._dragStartRight = this.windowRight;
    event.stopPropagation();
    return true;
  }

  /**
   * @param {!Event} event
   */
  _windowDragging(event) {
    event.preventDefault();
    let delta = (event.pageX - this._dragStartPoint) / this._parentElement.clientWidth;
    if (this._dragStartLeft + delta < 0)
      delta = -this._dragStartLeft;

    if (this._dragStartRight + delta > 1)
      delta = 1 - this._dragStartRight;

    this._setWindow(this._dragStartLeft + delta, this._dragStartRight + delta);
  }

  /**
   * @param {number} start
   */
  _resizeWindowLeft(start) {
    // Glue to edge.
    if (start < 10)
      start = 0;
    else if (start > this._rightResizeElement.offsetLeft - 4)
      start = this._rightResizeElement.offsetLeft - 4;
    this._setWindowPosition(start, null);
  }

  /**
   * @param {number} end
   */
  _resizeWindowRight(end) {
    // Glue to edge.
    if (end > this._parentElement.clientWidth - 10)
      end = this._parentElement.clientWidth;
    else if (end < this._leftResizeElement.offsetLeft + PerfUI.OverviewGrid.MinSelectableSize)
      end = this._leftResizeElement.offsetLeft + PerfUI.OverviewGrid.MinSelectableSize;
    this._setWindowPosition(null, end);
  }

  _resizeWindowMaximum() {
    this._setWindowPosition(0, this._parentElement.clientWidth);
  }

  /**
   * @param {number} windowLeft
   * @param {number} windowRight
   */
  _setWindow(windowLeft, windowRight) {
    this.windowLeft = windowLeft;
    this.windowRight = windowRight;
    this._updateCurtains();
    this.dispatchEventToListeners(PerfUI.OverviewGrid.Events.WindowChanged);
  }

  _updateCurtains() {
    let left = this.windowLeft;
    let right = this.windowRight;
    const width = right - left;

    // We allow actual time window to be arbitrarily small but don't want the UI window to be too small.
    const widthInPixels = width * this._parentElement.clientWidth;
    const minWidthInPixels = PerfUI.OverviewGrid.MinSelectableSize / 2;
    if (widthInPixels < minWidthInPixels) {
      const factor = minWidthInPixels / widthInPixels;
      left = ((this.windowRight + this.windowLeft) - width * factor) / 2;
      right = ((this.windowRight + this.windowLeft) + width * factor) / 2;
    }
    this._leftResizeElement.style.left = (100 * left).toFixed(2) + '%';
    this._rightResizeElement.style.left = (100 * right).toFixed(2) + '%';

    this._leftCurtainElement.style.width = (100 * left).toFixed(2) + '%';
    this._rightCurtainElement.style.width = (100 * (1 - right)).toFixed(2) + '%';
  }

  /**
   * @param {?number} start
   * @param {?number} end
   */
  _setWindowPosition(start, end) {
    const clientWidth = this._parentElement.clientWidth;
    const windowLeft = typeof start === 'number' ? start / clientWidth : this.windowLeft;
    const windowRight = typeof end === 'number' ? end / clientWidth : this.windowRight;
    this._setWindow(windowLeft, windowRight);
  }

  /**
   * @param {!Event} event
   */
  _onMouseWheel(event) {
    if (!this._enabled)
      return;
    if (typeof event.wheelDeltaY === 'number' && event.wheelDeltaY) {
      const zoomFactor = 1.1;
      const mouseWheelZoomSpeed = 1 / 120;

      const reference = event.offsetX / event.target.clientWidth;
      this._zoom(Math.pow(zoomFactor, -event.wheelDeltaY * mouseWheelZoomSpeed), reference);
    }
    if (typeof event.wheelDeltaX === 'number' && event.wheelDeltaX) {
      let offset = Math.round(event.wheelDeltaX * PerfUI.OverviewGrid.WindowScrollSpeedFactor);
      const windowLeft = this._leftResizeElement.offsetLeft + PerfUI.OverviewGrid.ResizerOffset;
      const windowRight = this._rightResizeElement.offsetLeft + PerfUI.OverviewGrid.ResizerOffset;

      if (windowLeft - offset < 0)
        offset = windowLeft;

      if (windowRight - offset > this._parentElement.clientWidth)
        offset = windowRight - this._parentElement.clientWidth;

      this._setWindowPosition(windowLeft - offset, windowRight - offset);

      event.preventDefault();
    }
  }

  /**
   * @param {number} factor
   * @param {number} reference
   */
  _zoom(factor, reference) {
    let left = this.windowLeft;
    let right = this.windowRight;
    const windowSize = right - left;
    let newWindowSize = factor * windowSize;
    if (newWindowSize > 1) {
      newWindowSize = 1;
      factor = newWindowSize / windowSize;
    }
    left = reference + (left - reference) * factor;
    left = Number.constrain(left, 0, 1 - newWindowSize);

    right = reference + (right - reference) * factor;
    right = Number.constrain(right, newWindowSize, 1);
    this._setWindow(left, right);
  }
};

/** @enum {symbol} */
PerfUI.OverviewGrid.Events = {
  WindowChanged: Symbol('WindowChanged')
};

/**
 * @unrestricted
 */
PerfUI.OverviewGrid.WindowSelector = class {
  constructor(parent, position) {
    this._startPosition = position;
    this._width = parent.offsetWidth;
    this._windowSelector = createElement('div');
    this._windowSelector.className = 'overview-grid-window-selector';
    this._windowSelector.style.left = this._startPosition + 'px';
    this._windowSelector.style.right = this._width - this._startPosition + 'px';
    parent.appendChild(this._windowSelector);
  }

  _close(position) {
    position = Math.max(0, Math.min(position, this._width));
    this._windowSelector.remove();
    return this._startPosition < position ? {start: this._startPosition, end: position} :
                                            {start: position, end: this._startPosition};
  }

  _updatePosition(position) {
    position = Math.max(0, Math.min(position, this._width));
    if (position < this._startPosition) {
      this._windowSelector.style.left = position + 'px';
      this._windowSelector.style.right = this._width - this._startPosition + 'px';
    } else {
      this._windowSelector.style.left = this._startPosition + 'px';
      this._windowSelector.style.right = this._width - position + 'px';
    }
  }
};
