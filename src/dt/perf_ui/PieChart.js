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
PerfUI.PieChart = class {
  /**
   * @param {number} size
   * @param {function(number):string=} formatter
   * @param {boolean=} showTotal
   */
  constructor(size, formatter, showTotal) {
    this.element = createElement('div');
    this._shadowRoot = UI.createShadowRootWithCoreStyles(this.element, 'perf_ui/pieChart.css');
    const root = this._shadowRoot.createChild('div', 'root');
    const svg = this._createSVGChild(root, 'svg');
    this._group = this._createSVGChild(svg, 'g');
    this._innerR = 0.618;
    const strokeWidth = 1 / size;
    let circle = this._createSVGChild(this._group, 'circle');
    circle.setAttribute('r', 1);
    circle.setAttribute('stroke', 'hsl(0, 0%, 80%)');
    circle.setAttribute('fill', 'transparent');
    circle.setAttribute('stroke-width', strokeWidth);
    circle = this._createSVGChild(this._group, 'circle');
    circle.setAttribute('r', this._innerR);
    circle.setAttribute('stroke', 'hsl(0, 0%, 80%)');
    circle.setAttribute('fill', 'transparent');
    circle.setAttribute('stroke-width', strokeWidth);
    this._foregroundElement = root.createChild('div', 'pie-chart-foreground');
    if (showTotal)
      this._totalElement = this._foregroundElement.createChild('div', 'pie-chart-total');
    this._formatter = formatter;
    this._slices = [];
    this._lastAngle = -Math.PI / 2;
    this._setSize(size);
  }

  /**
   * @param {number} totalValue
   */
  setTotal(totalValue) {
    for (let i = 0; i < this._slices.length; ++i)
      this._slices[i].remove();
    this._slices = [];
    this._totalValue = totalValue;
    this._lastAngle = -Math.PI / 2;
    let totalString;
    if (totalValue)
      totalString = this._formatter ? this._formatter(totalValue) : totalValue;
    else
      totalString = '';
    if (this._totalElement)
      this._totalElement.textContent = totalString;
  }

  /**
   * @param {number} value
   */
  _setSize(value) {
    this._group.setAttribute('transform', 'scale(' + (value / 2) + ') translate(1, 1) scale(0.99, 0.99)');
    const size = value + 'px';
    this.element.style.width = size;
    this.element.style.height = size;
  }

  /**
   * @param {number} value
   * @param {string} color
   */
  addSlice(value, color) {
    let sliceAngle = value / this._totalValue * 2 * Math.PI;
    if (!isFinite(sliceAngle))
      return;
    sliceAngle = Math.min(sliceAngle, 2 * Math.PI * 0.9999);
    const path = this._createSVGChild(this._group, 'path');
    const x1 = Math.cos(this._lastAngle);
    const y1 = Math.sin(this._lastAngle);
    this._lastAngle += sliceAngle;
    const x2 = Math.cos(this._lastAngle);
    const y2 = Math.sin(this._lastAngle);
    const r2 = this._innerR;
    const x3 = x2 * r2;
    const y3 = y2 * r2;
    const x4 = x1 * r2;
    const y4 = y1 * r2;
    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    path.setAttribute('d',
        `M${x1},${y1} A1,1,0,${largeArc},1,${x2},${y2} L${x3},${y3} A${r2},${r2},0,${largeArc},0,${x4},${y4} Z`);
    path.setAttribute('fill', color);
    this._slices.push(path);
  }

  /**
   * @param {!Element} parent
   * @param {string} childType
   * @return {!Element}
   */
  _createSVGChild(parent, childType) {
    const child = parent.ownerDocument.createElementNS('http://www.w3.org/2000/svg', childType);
    parent.appendChild(child);
    return child;
  }
};
