/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) 2008, 2009 Anthony Ricaud <rik@webkit.org>
 * Copyright (C) 2009 Google Inc. All rights reserved.
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
PerfUI.TimelineGrid = class {
  constructor() {
    this.element = createElement('div');
    UI.appendStyle(this.element, 'perf_ui/timelineGrid.css');

    this._dividersElement = this.element.createChild('div', 'resources-dividers');

    this._gridHeaderElement = createElement('div');
    this._gridHeaderElement.classList.add('timeline-grid-header');
    this._eventDividersElement = this._gridHeaderElement.createChild('div', 'resources-event-dividers');
    this._dividersLabelBarElement = this._gridHeaderElement.createChild('div', 'resources-dividers-label-bar');
    this.element.appendChild(this._gridHeaderElement);
  }

  /**
   * @param {!PerfUI.TimelineGrid.Calculator} calculator
   * @param {number=} freeZoneAtLeft
   * @return {!PerfUI.TimelineGrid.DividersData}
   */
  static calculateGridOffsets(calculator, freeZoneAtLeft) {
    /** @const */ const minGridSlicePx = 64;  // minimal distance between grid lines.

    const clientWidth = calculator.computePosition(calculator.maximumBoundary());
    let dividersCount = clientWidth / minGridSlicePx;
    let gridSliceTime = calculator.boundarySpan() / dividersCount;
    const pixelsPerTime = clientWidth / calculator.boundarySpan();

    // Align gridSliceTime to a nearest round value.
    // We allow spans that fit into the formula: span = (1|2|5)x10^n,
    // e.g.: ...  .1  .2  .5  1  2  5  10  20  50  ...
    // After a span has been chosen make grid lines at multiples of the span.

    const logGridSliceTime = Math.ceil(Math.log(gridSliceTime) / Math.LN10);
    gridSliceTime = Math.pow(10, logGridSliceTime);
    if (gridSliceTime * pixelsPerTime >= 5 * minGridSlicePx)
      gridSliceTime = gridSliceTime / 5;
    if (gridSliceTime * pixelsPerTime >= 2 * minGridSlicePx)
      gridSliceTime = gridSliceTime / 2;

    const firstDividerTime =
        Math.ceil((calculator.minimumBoundary() - calculator.zeroTime()) / gridSliceTime) * gridSliceTime +
        calculator.zeroTime();
    let lastDividerTime = calculator.maximumBoundary();
    // Add some extra space past the right boundary as the rightmost divider label text
    // may be partially shown rather than just pop up when a new rightmost divider gets into the view.
    lastDividerTime += minGridSlicePx / pixelsPerTime;
    dividersCount = Math.ceil((lastDividerTime - firstDividerTime) / gridSliceTime);

    if (!gridSliceTime)
      dividersCount = 0;

    const offsets = [];
    for (let i = 0; i < dividersCount; ++i) {
      const time = firstDividerTime + gridSliceTime * i;
      if (calculator.computePosition(time) < freeZoneAtLeft)
        continue;
      offsets.push({position: Math.floor(calculator.computePosition(time)), time: time});
    }

    return {offsets: offsets, precision: Math.max(0, -Math.floor(Math.log(gridSliceTime * 1.01) / Math.LN10))};
  }

  /**
   * @param {!CanvasRenderingContext2D} context
   * @param {!PerfUI.TimelineGrid.DividersData} dividersData
   */
  static drawCanvasGrid(context, dividersData) {
    context.save();
    context.scale(window.devicePixelRatio, window.devicePixelRatio);
    const height = Math.floor(context.canvas.height / window.devicePixelRatio);
    context.strokeStyle = UI.themeSupport.patchColorText('rgba(0, 0, 0, 0.1)', UI.ThemeSupport.ColorUsage.Foreground);
    context.lineWidth = 1;

    context.translate(0.5, 0.5);
    context.beginPath();
    for (const offsetInfo of dividersData.offsets) {
      context.moveTo(offsetInfo.position, 0);
      context.lineTo(offsetInfo.position, height);
    }
    context.stroke();
    context.restore();
  }

  /**
   * @param {!CanvasRenderingContext2D} context
   * @param {!PerfUI.TimelineGrid.DividersData} dividersData
   * @param {function(number):string} formatTimeFunction
   * @param {number} paddingTop
   * @param {number} headerHeight
   * @param {number=} freeZoneAtLeft
   */
  static drawCanvasHeaders(context, dividersData, formatTimeFunction, paddingTop, headerHeight, freeZoneAtLeft) {
    context.save();
    context.scale(window.devicePixelRatio, window.devicePixelRatio);
    const width = Math.ceil(context.canvas.width / window.devicePixelRatio);

    context.beginPath();
    context.fillStyle =
        UI.themeSupport.patchColorText('rgba(255, 255, 255, 0.5)', UI.ThemeSupport.ColorUsage.Background);
    context.fillRect(0, 0, width, headerHeight);

    context.fillStyle = UI.themeSupport.patchColorText('#333', UI.ThemeSupport.ColorUsage.Foreground);
    context.textBaseline = 'hanging';
    context.font = '11px ' + Host.fontFamily();

    const paddingRight = 4;
    for (const offsetInfo of dividersData.offsets) {
      const text = formatTimeFunction(offsetInfo.time);
      const textWidth = context.measureText(text).width;
      const textPosition = offsetInfo.position - textWidth - paddingRight;
      if (!freeZoneAtLeft || freeZoneAtLeft < textPosition)
        context.fillText(text, textPosition, paddingTop);
    }
    context.restore();
  }

  get dividersElement() {
    return this._dividersElement;
  }

  get dividersLabelBarElement() {
    return this._dividersLabelBarElement;
  }

  removeDividers() {
    this._dividersElement.removeChildren();
    this._dividersLabelBarElement.removeChildren();
  }

  /**
   * @param {!PerfUI.TimelineGrid.Calculator} calculator
   * @param {number=} freeZoneAtLeft
   * @return {boolean}
   */
  updateDividers(calculator, freeZoneAtLeft) {
    const dividersData = PerfUI.TimelineGrid.calculateGridOffsets(calculator, freeZoneAtLeft);
    const dividerOffsets = dividersData.offsets;
    const precision = dividersData.precision;

    const dividersElementClientWidth = this._dividersElement.clientWidth;

    // Reuse divider elements and labels.
    let divider = /** @type {?Element} */ (this._dividersElement.firstChild);
    let dividerLabelBar = /** @type {?Element} */ (this._dividersLabelBarElement.firstChild);

    for (let i = 0; i < dividerOffsets.length; ++i) {
      if (!divider) {
        divider = createElement('div');
        divider.className = 'resources-divider';
        this._dividersElement.appendChild(divider);

        dividerLabelBar = createElement('div');
        dividerLabelBar.className = 'resources-divider';
        const label = createElement('div');
        label.className = 'resources-divider-label';
        dividerLabelBar._labelElement = label;
        dividerLabelBar.appendChild(label);
        this._dividersLabelBarElement.appendChild(dividerLabelBar);
      }

      const time = dividerOffsets[i].time;
      const position = dividerOffsets[i].position;
      dividerLabelBar._labelElement.textContent = calculator.formatValue(time, precision);

      const percentLeft = 100 * position / dividersElementClientWidth;
      divider.style.left = percentLeft + '%';
      dividerLabelBar.style.left = percentLeft + '%';

      divider = /** @type {?Element} */ (divider.nextSibling);
      dividerLabelBar = /** @type {?Element} */ (dividerLabelBar.nextSibling);
    }

    // Remove extras.
    while (divider) {
      const nextDivider = divider.nextSibling;
      this._dividersElement.removeChild(divider);
      divider = nextDivider;
    }
    while (dividerLabelBar) {
      const nextDivider = dividerLabelBar.nextSibling;
      this._dividersLabelBarElement.removeChild(dividerLabelBar);
      dividerLabelBar = nextDivider;
    }
    return true;
  }

  /**
   * @param {!Element} divider
   */
  addEventDivider(divider) {
    this._eventDividersElement.appendChild(divider);
  }

  /**
   * @param {!Array.<!Element>} dividers
   */
  addEventDividers(dividers) {
    this._gridHeaderElement.removeChild(this._eventDividersElement);
    for (const divider of dividers)
      this._eventDividersElement.appendChild(divider);
    this._gridHeaderElement.appendChild(this._eventDividersElement);
  }

  removeEventDividers() {
    this._eventDividersElement.removeChildren();
  }

  hideEventDividers() {
    this._eventDividersElement.classList.add('hidden');
  }

  showEventDividers() {
    this._eventDividersElement.classList.remove('hidden');
  }

  hideDividers() {
    this._dividersElement.classList.add('hidden');
  }

  showDividers() {
    this._dividersElement.classList.remove('hidden');
  }

  /**
   * @param {number} scrollTop
   */
  setScrollTop(scrollTop) {
    this._dividersLabelBarElement.style.top = scrollTop + 'px';
    this._eventDividersElement.style.top = scrollTop + 'px';
  }
};

/** @typedef {!{offsets: !Array<!{position: number, time: number}>, precision: number}} */
PerfUI.TimelineGrid.DividersData;

/**
 * @interface
 */
PerfUI.TimelineGrid.Calculator = function() {};

PerfUI.TimelineGrid.Calculator.prototype = {
  /**
   * @param {number} time
   * @return {number}
   */
  computePosition(time) {},

  /**
   * @param {number} time
   * @param {number=} precision
   * @return {string}
   */
  formatValue(time, precision) {},

  /** @return {number} */
  minimumBoundary() {},

  /** @return {number} */
  zeroTime() {},

  /** @return {number} */
  maximumBoundary() {},

  /** @return {number} */
  boundarySpan() {}
};
