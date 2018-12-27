// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
Network.NetworkWaterfallColumn = class extends UI.VBox {
  /**
   * @param {!Network.NetworkTimeCalculator} calculator
   */
  constructor(calculator) {
    // TODO(allada) Make this a shadowDOM when the NetworkWaterfallColumn gets moved into NetworkLogViewColumns.
    super(false);
    this.registerRequiredCSS('network/networkWaterfallColumn.css');

    this._canvas = this.contentElement.createChild('canvas');
    this._canvas.tabIndex = 0;
    this.setDefaultFocusedElement(this._canvas);
    this._canvasPosition = this._canvas.getBoundingClientRect();

    /** @const */
    this._leftPadding = 5;
    /** @const */
    this._fontSize = 10;

    this._rightPadding = 0;
    this._scrollTop = 0;

    this._headerHeight = 0;
    this._calculator = calculator;

    // this._rawRowHeight captures model height (41 or 21px),
    // this._rowHeight is computed height of the row in CSS pixels, can be 20.8 for zoomed-in content.
    this._rawRowHeight = 0;
    this._rowHeight = 0;

    this._offsetWidth = 0;
    this._offsetHeight = 0;
    this._startTime = this._calculator.minimumBoundary();
    this._endTime = this._calculator.maximumBoundary();

    this._popoverHelper = new UI.PopoverHelper(this.element, this._getPopoverRequest.bind(this));
    this._popoverHelper.setHasPadding(true);
    this._popoverHelper.setTimeout(300, 300);

    /** @type {!Array<!Network.NetworkNode>} */
    this._nodes = [];

    /** @type {?Network.NetworkNode} */
    this._hoveredNode = null;

    /** @type {!Map<string, !Array<number>>} */
    this._eventDividers = new Map();

    /** @type {(number|undefined)} */
    this._updateRequestID;

    this.element.addEventListener('mousemove', this._onMouseMove.bind(this), true);
    this.element.addEventListener('mouseleave', event => this._setHoveredNode(null, false), true);

    this._styleForTimeRangeName = Network.NetworkWaterfallColumn._buildRequestTimeRangeStyle();

    const resourceStyleTuple = Network.NetworkWaterfallColumn._buildResourceTypeStyle();
    /** @type {!Map<!Common.ResourceType, !Network.NetworkWaterfallColumn._LayerStyle>} */
    this._styleForWaitingResourceType = resourceStyleTuple[0];
    /** @type {!Map<!Common.ResourceType, !Network.NetworkWaterfallColumn._LayerStyle>} */
    this._styleForDownloadingResourceType = resourceStyleTuple[1];

    const baseLineColor = UI.themeSupport.patchColorText('#a5a5a5', UI.ThemeSupport.ColorUsage.Foreground);
    /** @type {!Network.NetworkWaterfallColumn._LayerStyle} */
    this._wiskerStyle = {borderColor: baseLineColor, lineWidth: 1};
    /** @type {!Network.NetworkWaterfallColumn._LayerStyle} */
    this._hoverDetailsStyle = {fillStyle: baseLineColor, lineWidth: 1, borderColor: baseLineColor};

    /** @type {!Map<!Network.NetworkWaterfallColumn._LayerStyle, !Path2D>} */
    this._pathForStyle = new Map();
    /** @type {!Array<!Network.NetworkWaterfallColumn._TextLayer>} */
    this._textLayers = [];
  }

  /**
   * @return {!Map<!Network.RequestTimeRangeNames, !Network.NetworkWaterfallColumn._LayerStyle>}
   */
  static _buildRequestTimeRangeStyle() {
    const types = Network.RequestTimeRangeNames;
    const styleMap = new Map();
    styleMap.set(types.Connecting, {fillStyle: '#FF9800'});
    styleMap.set(types.SSL, {fillStyle: '#9C27B0'});
    styleMap.set(types.DNS, {fillStyle: '#009688'});
    styleMap.set(types.Proxy, {fillStyle: '#A1887F'});
    styleMap.set(types.Blocking, {fillStyle: '#AAAAAA'});
    styleMap.set(types.Push, {fillStyle: '#8CDBff'});
    styleMap.set(types.Queueing, {fillStyle: 'white', lineWidth: 2, borderColor: 'lightgrey'});
    // This ensures we always show at least 2 px for a request.
    styleMap.set(types.Receiving, {fillStyle: '#03A9F4', lineWidth: 2, borderColor: '#03A9F4'});
    styleMap.set(types.Waiting, {fillStyle: '#00C853'});
    styleMap.set(types.ReceivingPush, {fillStyle: '#03A9F4'});
    styleMap.set(types.ServiceWorker, {fillStyle: 'orange'});
    styleMap.set(types.ServiceWorkerPreparation, {fillStyle: 'orange'});
    return styleMap;
  }

  /**
   * @return {!Array<!Map<!Common.ResourceType, !Network.NetworkWaterfallColumn._LayerStyle>>}
   */
  static _buildResourceTypeStyle() {
    const baseResourceTypeColors = new Map([
      ['document', 'hsl(215, 100%, 80%)'],
      ['font', 'hsl(8, 100%, 80%)'],
      ['media', 'hsl(90, 50%, 80%)'],
      ['image', 'hsl(90, 50%, 80%)'],
      ['script', 'hsl(31, 100%, 80%)'],
      ['stylesheet', 'hsl(272, 64%, 80%)'],
      ['texttrack', 'hsl(8, 100%, 80%)'],
      ['websocket', 'hsl(0, 0%, 95%)'],
      ['xhr', 'hsl(53, 100%, 80%)'],
      ['fetch', 'hsl(53, 100%, 80%)'],
      ['other', 'hsl(0, 0%, 95%)'],
    ]);
    const waitingStyleMap = new Map();
    const downloadingStyleMap = new Map();

    for (const resourceType of Object.values(Common.resourceTypes)) {
      let color = baseResourceTypeColors.get(resourceType.name());
      if (!color)
        color = baseResourceTypeColors.get('other');
      const borderColor = toBorderColor(color);

      waitingStyleMap.set(resourceType, {fillStyle: toWaitingColor(color), lineWidth: 1, borderColor: borderColor});
      downloadingStyleMap.set(resourceType, {fillStyle: color, lineWidth: 1, borderColor: borderColor});
    }
    return [waitingStyleMap, downloadingStyleMap];

    /**
     * @param {string} color
     */
    function toBorderColor(color) {
      const parsedColor = Common.Color.parse(color);
      const hsla = parsedColor.hsla();
      hsla[1] /= 2;
      hsla[2] -= Math.min(hsla[2], 0.2);
      return parsedColor.asString(null);
    }

    /**
     * @param {string} color
     */
    function toWaitingColor(color) {
      const parsedColor = Common.Color.parse(color);
      const hsla = parsedColor.hsla();
      hsla[2] *= 1.1;
      return parsedColor.asString(null);
    }
  }

  _resetPaths() {
    this._pathForStyle.clear();
    this._pathForStyle.set(this._wiskerStyle, new Path2D());
    this._styleForTimeRangeName.forEach(style => this._pathForStyle.set(style, new Path2D()));
    this._styleForWaitingResourceType.forEach(style => this._pathForStyle.set(style, new Path2D()));
    this._styleForDownloadingResourceType.forEach(style => this._pathForStyle.set(style, new Path2D()));
    this._pathForStyle.set(this._hoverDetailsStyle, new Path2D());
  }

  /**
   * @override
   */
  willHide() {
    this._popoverHelper.hidePopover();
  }

  /**
   * @override
   */
  wasShown() {
    this.update();
  }

  /**
   * @param {!Event} event
   */
  _onMouseMove(event) {
    this._setHoveredNode(this.getNodeFromPoint(event.offsetX, event.offsetY), event.shiftKey);
  }

  /**
   * @param {!Event} event
   * @return {?UI.PopoverRequest}
   */
  _getPopoverRequest(event) {
    if (!this._hoveredNode)
      return null;
    const request = this._hoveredNode.request();
    if (!request)
      return null;
    const useTimingBars = !Common.moduleSetting('networkColorCodeResourceTypes').get() && !this._calculator.startAtZero;
    let range;
    let start;
    let end;
    if (useTimingBars) {
      range = Network.RequestTimingView.calculateRequestTimeRanges(request, 0)
                  .find(data => data.name === Network.RequestTimeRangeNames.Total);
      start = this._timeToPosition(range.start);
      end = this._timeToPosition(range.end);
    } else {
      range = this._getSimplifiedBarRange(request, 0);
      start = range.start;
      end = range.end;
    }

    if (end - start < 50) {
      const halfWidth = (end - start) / 2;
      start = start + halfWidth - 25;
      end = end - halfWidth + 25;
    }

    if (event.clientX < this._canvasPosition.left + start || event.clientX > this._canvasPosition.left + end)
      return null;

    const rowIndex = this._nodes.findIndex(node => node.hovered());
    const barHeight = this._getBarHeight(range.name);
    const y = this._headerHeight + (this._rowHeight * rowIndex - this._scrollTop) + ((this._rowHeight - barHeight) / 2);

    if (event.clientY < this._canvasPosition.top + y || event.clientY > this._canvasPosition.top + y + barHeight)
      return null;

    const anchorBox = this.element.boxInWindow();
    anchorBox.x += start;
    anchorBox.y += y;
    anchorBox.width = end - start;
    anchorBox.height = barHeight;

    return {
      box: anchorBox,
      show: popover => {
        const content =
            Network.RequestTimingView.createTimingTable(/** @type {!SDK.NetworkRequest} */ (request), this._calculator);
        popover.contentElement.appendChild(content);
        return Promise.resolve(true);
      }
    };
  }

  /**
   * @param {?Network.NetworkNode} node
   * @param {boolean} highlightInitiatorChain
   */
  _setHoveredNode(node, highlightInitiatorChain) {
    if (this._hoveredNode)
      this._hoveredNode.setHovered(false, false);
    this._hoveredNode = node;
    if (this._hoveredNode)
      this._hoveredNode.setHovered(true, highlightInitiatorChain);
  }

  /**
   * @param {number} height
   */
  setRowHeight(height) {
    this._rawRowHeight = height;
    this._updateRowHeight();
  }

  _updateRowHeight() {
    this._rowHeight = Math.round(this._rawRowHeight * window.devicePixelRatio) / window.devicePixelRatio;
  }

  /**
   * @param {number} height
   */
  setHeaderHeight(height) {
    this._headerHeight = height;
  }

  /**
   * @param {number} padding
   */
  setRightPadding(padding) {
    this._rightPadding = padding;
    this._calculateCanvasSize();
  }

  /**
   * @param {!Network.NetworkTimeCalculator} calculator
   */
  setCalculator(calculator) {
    this._calculator = calculator;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @return {?Network.NetworkNode}
   */
  getNodeFromPoint(x, y) {
    if (y <= this._headerHeight)
      return null;
    return this._nodes[Math.floor((this._scrollTop + y - this._headerHeight) / this._rowHeight)];
  }

  scheduleDraw() {
    if (this._updateRequestID)
      return;
    this._updateRequestID = this.element.window().requestAnimationFrame(() => this.update());
  }

  /**
   * @param {number=} scrollTop
   * @param {!Map<string, !Array<number>>=} eventDividers
   * @param {!Array<!Network.NetworkNode>=} nodes
   */
  update(scrollTop, eventDividers, nodes) {
    if (scrollTop !== undefined && this._scrollTop !== scrollTop) {
      this._popoverHelper.hidePopover();
      this._scrollTop = scrollTop;
    }
    if (nodes) {
      this._nodes = nodes;
      this._calculateCanvasSize();
    }
    if (eventDividers !== undefined)
      this._eventDividers = eventDividers;
    if (this._updateRequestID) {
      this.element.window().cancelAnimationFrame(this._updateRequestID);
      delete this._updateRequestID;
    }

    this._startTime = this._calculator.minimumBoundary();
    this._endTime = this._calculator.maximumBoundary();
    this._resetCanvas();
    this._resetPaths();
    this._textLayers = [];
    this._draw();
  }

  _resetCanvas() {
    const ratio = window.devicePixelRatio;
    this._canvas.width = this._offsetWidth * ratio;
    this._canvas.height = this._offsetHeight * ratio;
    this._canvas.style.width = this._offsetWidth + 'px';
    this._canvas.style.height = this._offsetHeight + 'px';
  }

  /**
   * @override
   */
  onResize() {
    super.onResize();
    this._updateRowHeight();
    this._calculateCanvasSize();
    this.scheduleDraw();
  }

  _calculateCanvasSize() {
    this._offsetWidth = this.contentElement.offsetWidth - this._rightPadding;
    this._offsetHeight = this.contentElement.offsetHeight;
    this._calculator.setDisplayWidth(this._offsetWidth);
    this._canvasPosition = this._canvas.getBoundingClientRect();
  }

  /**
   * @param {number} time
   * @return {number}
   */
  _timeToPosition(time) {
    const availableWidth = this._offsetWidth - this._leftPadding;
    const timeToPixel = availableWidth / (this._endTime - this._startTime);
    return Math.floor(this._leftPadding + (time - this._startTime) * timeToPixel);
  }

  _didDrawForTest() {
  }

  _draw() {
    const useTimingBars = !Common.moduleSetting('networkColorCodeResourceTypes').get() && !this._calculator.startAtZero;
    const nodes = this._nodes;
    const context = this._canvas.getContext('2d');
    context.save();
    context.scale(window.devicePixelRatio, window.devicePixelRatio);
    context.translate(0, this._headerHeight);
    context.rect(0, 0, this._offsetWidth, this._offsetHeight);
    context.clip();
    const firstRequestIndex = Math.floor(this._scrollTop / this._rowHeight);
    const lastRequestIndex =
        Math.min(nodes.length, firstRequestIndex + Math.ceil(this._offsetHeight / this._rowHeight));
    for (let i = firstRequestIndex; i < lastRequestIndex; i++) {
      const rowOffset = this._rowHeight * i;
      const node = nodes[i];
      this._decorateRow(context, node, rowOffset - this._scrollTop);
      let drawNodes = [];
      if (node.hasChildren() && !node.expanded)
        drawNodes = /** @type {!Array<!Network.NetworkNode>} */ (node.flatChildren());
      drawNodes.push(node);
      for (const drawNode of drawNodes) {
        if (useTimingBars)
          this._buildTimingBarLayers(drawNode, rowOffset - this._scrollTop);
        else
          this._buildSimplifiedBarLayers(context, drawNode, rowOffset - this._scrollTop);
      }
    }
    this._drawLayers(context);

    context.save();
    context.fillStyle = UI.themeSupport.patchColorText('#888', UI.ThemeSupport.ColorUsage.Foreground);
    for (const textData of this._textLayers)
      context.fillText(textData.text, textData.x, textData.y);
    context.restore();

    this._drawEventDividers(context);
    context.restore();

    const freeZoneAtLeft = 75;
    const freeZoneAtRight = 18;
    const dividersData = PerfUI.TimelineGrid.calculateGridOffsets(this._calculator);
    PerfUI.TimelineGrid.drawCanvasGrid(context, dividersData);
    PerfUI.TimelineGrid.drawCanvasHeaders(
        context, dividersData, time => this._calculator.formatValue(time, dividersData.precision), this._fontSize,
        this._headerHeight, freeZoneAtLeft);
    context.clearRect(this._offsetWidth - freeZoneAtRight, 0, freeZoneAtRight, this._headerHeight);
    this._didDrawForTest();
  }

  /**
   * @param {!CanvasRenderingContext2D} context
   */
  _drawLayers(context) {
    for (const entry of this._pathForStyle) {
      const style = /** @type {!Network.NetworkWaterfallColumn._LayerStyle} */ (entry[0]);
      const path = /** @type {!Path2D} */ (entry[1]);
      context.save();
      context.beginPath();
      if (style.lineWidth) {
        context.lineWidth = style.lineWidth;
        context.strokeStyle = style.borderColor;
        context.stroke(path);
      }
      if (style.fillStyle) {
        context.fillStyle = style.fillStyle;
        context.fill(path);
      }
      context.restore();
    }
  }

  /**
   * @param {!CanvasRenderingContext2D} context
   */
  _drawEventDividers(context) {
    context.save();
    context.lineWidth = 1;
    for (const color of this._eventDividers.keys()) {
      context.strokeStyle = color;
      for (const time of this._eventDividers.get(color)) {
        context.beginPath();
        const x = this._timeToPosition(time);
        context.moveTo(x, 0);
        context.lineTo(x, this._offsetHeight);
      }
      context.stroke();
    }
    context.restore();
  }

  /**
   * @param {!Network.RequestTimeRangeNames=} type
   * @return {number}
   */
  _getBarHeight(type) {
    const types = Network.RequestTimeRangeNames;
    switch (type) {
      case types.Connecting:
      case types.SSL:
      case types.DNS:
      case types.Proxy:
      case types.Blocking:
      case types.Push:
      case types.Queueing:
        return 7;
      default:
        return 13;
    }
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @param {number} borderOffset
   * @return {!{start: number, mid: number, end: number}}
   */
  _getSimplifiedBarRange(request, borderOffset) {
    const drawWidth = this._offsetWidth - this._leftPadding;
    const percentages = this._calculator.computeBarGraphPercentages(request);
    return {
      start: this._leftPadding + Math.floor((percentages.start / 100) * drawWidth) + borderOffset,
      mid: this._leftPadding + Math.floor((percentages.middle / 100) * drawWidth) + borderOffset,
      end: this._leftPadding + Math.floor((percentages.end / 100) * drawWidth) + borderOffset
    };
  }

  /**
   * @param {!CanvasRenderingContext2D} context
   * @param {!Network.NetworkNode} node
   * @param {number} y
   */
  _buildSimplifiedBarLayers(context, node, y) {
    const request = node.request();
    if (!request)
      return;
    const borderWidth = 1;
    const borderOffset = borderWidth % 2 === 0 ? 0 : 0.5;

    const ranges = this._getSimplifiedBarRange(request, borderOffset);
    const height = this._getBarHeight();
    y += Math.floor(this._rowHeight / 2 - height / 2 + borderWidth) - borderWidth / 2;

    const waitingStyle = this._styleForWaitingResourceType.get(request.resourceType());
    const waitingPath = this._pathForStyle.get(waitingStyle);
    waitingPath.rect(ranges.start, y, ranges.mid - ranges.start, height - borderWidth);

    const barWidth = Math.max(2, ranges.end - ranges.mid);
    const downloadingStyle = this._styleForDownloadingResourceType.get(request.resourceType());
    const downloadingPath = this._pathForStyle.get(downloadingStyle);
    downloadingPath.rect(ranges.mid, y, barWidth, height - borderWidth);

    /** @type {?{left: string, right: string, tooltip: (string|undefined)}} */
    let labels = null;
    if (node.hovered()) {
      labels = this._calculator.computeBarGraphLabels(request);
      const barDotLineLength = 10;
      const leftLabelWidth = context.measureText(labels.left).width;
      const rightLabelWidth = context.measureText(labels.right).width;
      const hoverLinePath = this._pathForStyle.get(this._hoverDetailsStyle);

      if (leftLabelWidth < ranges.mid - ranges.start) {
        const midBarX = ranges.start + (ranges.mid - ranges.start - leftLabelWidth) / 2;
        this._textLayers.push({text: labels.left, x: midBarX, y: y + this._fontSize});
      } else if (barDotLineLength + leftLabelWidth + this._leftPadding < ranges.start) {
        this._textLayers.push(
            {text: labels.left, x: ranges.start - leftLabelWidth - barDotLineLength - 1, y: y + this._fontSize});
        hoverLinePath.moveTo(ranges.start - barDotLineLength, y + Math.floor(height / 2));
        hoverLinePath.arc(ranges.start, y + Math.floor(height / 2), 2, 0, 2 * Math.PI);
        hoverLinePath.moveTo(ranges.start - barDotLineLength, y + Math.floor(height / 2));
        hoverLinePath.lineTo(ranges.start, y + Math.floor(height / 2));
      }

      const endX = ranges.mid + barWidth + borderOffset;
      if (rightLabelWidth < endX - ranges.mid) {
        const midBarX = ranges.mid + (endX - ranges.mid - rightLabelWidth) / 2;
        this._textLayers.push({text: labels.right, x: midBarX, y: y + this._fontSize});
      } else if (endX + barDotLineLength + rightLabelWidth < this._offsetWidth - this._leftPadding) {
        this._textLayers.push({text: labels.right, x: endX + barDotLineLength + 1, y: y + this._fontSize});
        hoverLinePath.moveTo(endX, y + Math.floor(height / 2));
        hoverLinePath.arc(endX, y + Math.floor(height / 2), 2, 0, 2 * Math.PI);
        hoverLinePath.moveTo(endX, y + Math.floor(height / 2));
        hoverLinePath.lineTo(endX + barDotLineLength, y + Math.floor(height / 2));
      }
    }

    if (!this._calculator.startAtZero) {
      const queueingRange = Network.RequestTimingView.calculateRequestTimeRanges(request, 0)
                                .find(data => data.name === Network.RequestTimeRangeNames.Total);
      const leftLabelWidth = labels ? context.measureText(labels.left).width : 0;
      const leftTextPlacedInBar = leftLabelWidth < ranges.mid - ranges.start;
      const wiskerTextPadding = 13;
      const textOffset = (labels && !leftTextPlacedInBar) ? leftLabelWidth + wiskerTextPadding : 0;
      const queueingStart = this._timeToPosition(queueingRange.start);
      if (ranges.start - textOffset > queueingStart) {
        const wiskerPath = this._pathForStyle.get(this._wiskerStyle);
        wiskerPath.moveTo(queueingStart, y + Math.floor(height / 2));
        wiskerPath.lineTo(ranges.start - textOffset, y + Math.floor(height / 2));

        // TODO(allada) This needs to be floored.
        const wiskerHeight = height / 2;
        wiskerPath.moveTo(queueingStart + borderOffset, y + wiskerHeight / 2);
        wiskerPath.lineTo(queueingStart + borderOffset, y + height - wiskerHeight / 2 - 1);
      }
    }
  }

  /**
   * @param {!Network.NetworkNode} node
   * @param {number} y
   */
  _buildTimingBarLayers(node, y) {
    const request = node.request();
    if (!request)
      return;
    const ranges = Network.RequestTimingView.calculateRequestTimeRanges(request, 0);
    for (const range of ranges) {
      if (range.name === Network.RequestTimeRangeNames.Total || range.name === Network.RequestTimeRangeNames.Sending ||
          range.end - range.start === 0)
        continue;

      const style = this._styleForTimeRangeName.get(range.name);
      const path = this._pathForStyle.get(style);
      const lineWidth = style.lineWidth || 0;
      const height = this._getBarHeight(range.name);
      const middleBarY = y + Math.floor(this._rowHeight / 2 - height / 2) + lineWidth / 2;
      const start = this._timeToPosition(range.start);
      const end = this._timeToPosition(range.end);
      path.rect(start, middleBarY, end - start, height - lineWidth);
    }
  }

  /**
   * @param {!CanvasRenderingContext2D} context
   * @param {!Network.NetworkNode} node
   * @param {number} y
   */
  _decorateRow(context, node, y) {
    context.save();
    context.beginPath();
    context.fillStyle = node.backgroundColor();
    context.rect(0, y, this._offsetWidth, this._rowHeight);
    context.fill();
    context.restore();
  }
};

/** @typedef {!{fillStyle: (string|undefined), lineWidth: (number|undefined), borderColor: (string|undefined)}} */
Network.NetworkWaterfallColumn._LayerStyle;

/** @typedef {!{x: number, y: number, text: string}} */
Network.NetworkWaterfallColumn._TextLayer;
