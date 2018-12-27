// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {PerfUI.FlameChartDataProvider}
 * @unrestricted
 */
Timeline.TimelineFlameChartNetworkDataProvider = class {
  constructor() {
    this._font = '11px ' + Host.fontFamily();
    this.setModel(null);
    this._style = {
      padding: 4,
      height: 17,
      collapsible: true,
      color: UI.themeSupport.patchColorText('#222', UI.ThemeSupport.ColorUsage.Foreground),
      font: this._font,
      backgroundColor: UI.themeSupport.patchColorText('white', UI.ThemeSupport.ColorUsage.Background),
      nestingLevel: 0,
      useFirstLineForOverview: false,
      useDecoratorsForOverview: true,
      shareHeaderLine: false
    };
    this._group = {startLevel: 0, name: Common.UIString('Network'), expanded: false, style: this._style};
    this._minimumBoundary = 0;
    this._maximumBoundary = 0;
    this._timeSpan = 0;
  }

  /**
   * @param {?Timeline.PerformanceModel} performanceModel
   */
  setModel(performanceModel) {
    this._model = performanceModel && performanceModel.timelineModel();
    this._maxLevel = 0;
    this._timelineData = null;
    /** @type {!Array<!TimelineModel.TimelineModel.NetworkRequest>} */
    this._requests = [];
  }

  /**
   * @return {boolean}
   */
  isEmpty() {
    this.timelineData();
    return !this._requests.length;
  }

  /**
   * @override
   * @return {number}
   */
  maxStackDepth() {
    return this._maxLevel;
  }

  /**
   * @override
   * @return {!PerfUI.FlameChart.TimelineData}
   */
  timelineData() {
    if (this._timelineData)
      return this._timelineData;
    /** @type {!Array<!TimelineModel.TimelineModel.NetworkRequest>} */
    this._requests = [];
    this._timelineData = new PerfUI.FlameChart.TimelineData([], [], [], []);
    if (this._model)
      this._appendTimelineData();
    return this._timelineData;
  }

  /**
   * @override
   * @return {number}
   */
  minimumBoundary() {
    return this._minimumBoundary;
  }

  /**
   * @override
   * @return {number}
   */
  totalTime() {
    return this._timeSpan;
  }

  /**
   * @param {number} startTime
   * @param {number} endTime
   */
  setWindowTimes(startTime, endTime) {
    this._startTime = startTime;
    this._endTime = endTime;
    this._updateTimelineData();
  }

  /**
   * @param {number} index
   * @return {?Timeline.TimelineSelection}
   */
  createSelection(index) {
    if (index === -1)
      return null;
    const request = this._requests[index];
    this._lastSelection =
        new Timeline.TimelineFlameChartView.Selection(Timeline.TimelineSelection.fromNetworkRequest(request), index);
    return this._lastSelection.timelineSelection;
  }

  /**
   * @param {?Timeline.TimelineSelection} selection
   * @return {number}
   */
  entryIndexForSelection(selection) {
    if (!selection)
      return -1;

    if (this._lastSelection && this._lastSelection.timelineSelection.object() === selection.object())
      return this._lastSelection.entryIndex;

    if (selection.type() !== Timeline.TimelineSelection.Type.NetworkRequest)
      return -1;
    const request = /** @type{!TimelineModel.TimelineModel.NetworkRequest} */ (selection.object());
    const index = this._requests.indexOf(request);
    if (index !== -1) {
      this._lastSelection =
          new Timeline.TimelineFlameChartView.Selection(Timeline.TimelineSelection.fromNetworkRequest(request), index);
    }
    return index;
  }

  /**
   * @override
   * @param {number} index
   * @return {string}
   */
  entryColor(index) {
    const request = /** @type {!TimelineModel.TimelineModel.NetworkRequest} */ (this._requests[index]);
    const category = Timeline.TimelineUIUtils.networkRequestCategory(request);
    return Timeline.TimelineUIUtils.networkCategoryColor(category);
  }

  /**
   * @override
   * @param {number} index
   * @return {string}
   */
  textColor(index) {
    return Timeline.FlameChartStyle.textColor;
  }

  /**
   * @override
   * @param {number} index
   * @return {?string}
   */
  entryTitle(index) {
    const request = /** @type {!TimelineModel.TimelineModel.NetworkRequest} */ (this._requests[index]);
    const parsedURL = new Common.ParsedURL(request.url || '');
    return parsedURL.isValid ? `${parsedURL.displayName} (${parsedURL.host})` : request.url || null;
  }

  /**
   * @override
   * @param {number} index
   * @return {?string}
   */
  entryFont(index) {
    return this._font;
  }

  /**
   * @override
   * @param {number} index
   * @param {!CanvasRenderingContext2D} context
   * @param {?string} text
   * @param {number} barX
   * @param {number} barY
   * @param {number} barWidth
   * @param {number} barHeight
   * @param {number} unclippedBarX
   * @param {number} timeToPixelRatio
   * @return {boolean}
   */
  decorateEntry(index, context, text, barX, barY, barWidth, barHeight, unclippedBarX, timeToPixelRatio) {
    const request = /** @type {!TimelineModel.TimelineModel.NetworkRequest} */ (this._requests[index]);
    if (!request.timing)
      return false;

    /**
     * @param {number} time
     * @return {number}
     */
    function timeToPixel(time) {
      return Math.floor(unclippedBarX + (time - beginTime) * timeToPixelRatio);
    }

    const /** @const */ minBarWidthPx = 2;
    const beginTime = request.beginTime();
    const startTime = request.startTime;
    const endTime = request.endTime;
    const requestTime = request.timing.requestTime * 1000;
    const sendStart = Math.max(timeToPixel(requestTime + request.timing.sendStart), unclippedBarX);
    const headersEnd = Math.max(timeToPixel(requestTime + request.timing.receiveHeadersEnd), sendStart);
    const finish = Math.max(timeToPixel(request.finishTime || endTime), headersEnd + minBarWidthPx);
    const start = timeToPixel(startTime);
    const end = Math.max(timeToPixel(endTime), finish);

    context.fillStyle = 'hsla(0, 100%, 100%, 0.8)';
    context.fillRect(sendStart + 0.5, barY + 0.5, headersEnd - sendStart - 0.5, barHeight - 2);
    context.fillStyle = UI.themeSupport.patchColorText('white', UI.ThemeSupport.ColorUsage.Background);
    context.fillRect(barX, barY - 0.5, sendStart - barX, barHeight);
    context.fillRect(finish, barY - 0.5, barX + barWidth - finish, barHeight);

    if (request.timing.pushStart) {
      const pushStart = timeToPixel(request.timing.pushStart * 1000);
      const pushEnd = timeToPixel(request.timing.pushEnd * 1000);
      const dentSize = Number.constrain(pushEnd - pushStart - 2, 0, 4);
      const padding = 1;
      context.save();
      context.beginPath();
      context.moveTo(pushStart + dentSize, barY + barHeight / 2);
      context.lineTo(pushStart, barY + padding);
      context.lineTo(pushEnd - dentSize, barY + padding);
      context.lineTo(pushEnd, barY + barHeight / 2);
      context.lineTo(pushEnd - dentSize, barY + barHeight - padding);
      context.lineTo(pushStart, barY + barHeight - padding);
      context.closePath();
      context.fillStyle = this.entryColor(index);
      context.globalAlpha = 0.3;
      context.fill();
      context.restore();
    }

    /**
     * @param {number} begin
     * @param {number} end
     * @param {number} y
     */
    function drawTick(begin, end, y) {
      const /** @const */ tickHeightPx = 6;
      context.moveTo(begin, y - tickHeightPx / 2);
      context.lineTo(begin, y + tickHeightPx / 2);
      context.moveTo(begin, y);
      context.lineTo(end, y);
    }

    context.beginPath();
    context.lineWidth = 1;
    context.strokeStyle = '#ccc';
    const lineY = Math.floor(barY + barHeight / 2) + 0.5;
    const leftTick = start + 0.5;
    const rightTick = end - 0.5;
    drawTick(leftTick, sendStart, lineY);
    drawTick(rightTick, finish, lineY);
    context.stroke();

    if (typeof request.priority === 'string') {
      const color = this._colorForPriority(request.priority);
      if (color) {
        context.fillStyle = color;
        context.fillRect(sendStart + 0.5, barY + 0.5, 3.5, 3.5);
      }
    }

    const textStart = Math.max(sendStart, 0);
    const textWidth = finish - textStart;
    const /** @const */ minTextWidthPx = 20;
    if (textWidth >= minTextWidthPx) {
      text = this.entryTitle(index) || '';
      if (request.fromServiceWorker)
        text = '⚙ ' + text;
      if (text) {
        const /** @const */ textPadding = 4;
        const /** @const */ textBaseline = 5;
        const textBaseHeight = barHeight - textBaseline;
        const trimmedText = UI.trimTextEnd(context, text, textWidth - 2 * textPadding);
        context.fillStyle = '#333';
        context.fillText(trimmedText, textStart + textPadding, barY + textBaseHeight);
      }
    }

    return true;
  }

  /**
   * @override
   * @param {number} index
   * @return {boolean}
   */
  forceDecoration(index) {
    return true;
  }

  /**
   * @override
   * @param {number} index
   * @return {?Element}
   */
  prepareHighlightedEntryInfo(index) {
    const /** @const */ maxURLChars = 80;
    const request = /** @type {!TimelineModel.TimelineModel.NetworkRequest} */ (this._requests[index]);
    if (!request.url)
      return null;
    const element = createElement('div');
    const root = UI.createShadowRootWithCoreStyles(element, 'timeline/timelineFlamechartPopover.css');
    const contents = root.createChild('div', 'timeline-flamechart-popover');
    const duration = request.endTime - request.startTime;
    if (request.startTime && isFinite(duration))
      contents.createChild('span', 'timeline-info-network-time').textContent = Number.millisToString(duration);
    if (typeof request.priority === 'string') {
      const div = contents.createChild('span');
      div.textContent =
          PerfUI.uiLabelForNetworkPriority(/** @type {!Protocol.Network.ResourcePriority} */ (request.priority));
      div.style.color = this._colorForPriority(request.priority) || 'black';
    }
    contents.createChild('span').textContent = request.url.trimMiddle(maxURLChars);
    return element;
  }

  /**
   * @param {string} priority
   * @return {?string}
   */
  _colorForPriority(priority) {
    if (!this._priorityToValue) {
      const priorities = Protocol.Network.ResourcePriority;
      this._priorityToValue = new Map([
        [priorities.VeryLow, 1], [priorities.Low, 2], [priorities.Medium, 3], [priorities.High, 4],
        [priorities.VeryHigh, 5]
      ]);
    }
    const value = this._priorityToValue.get(priority);
    return value ? `hsla(214, 80%, 50%, ${value / 5})` : null;
  }

  _appendTimelineData() {
    this._minimumBoundary = this._model.minimumRecordTime();
    this._maximumBoundary = this._model.maximumRecordTime();
    this._timeSpan = this._model.isEmpty() ? 1000 : this._maximumBoundary - this._minimumBoundary;
    this._model.networkRequests().forEach(this._appendEntry.bind(this));
    this._updateTimelineData();
  }

  _updateTimelineData() {
    if (!this._timelineData)
      return;
    const lastTimeByLevel = [];
    let maxLevel = 0;
    for (let i = 0; i < this._requests.length; ++i) {
      const r = this._requests[i];
      const beginTime = r.beginTime();
      const visible = beginTime < this._endTime && r.endTime > this._startTime;
      if (!visible) {
        this._timelineData.entryLevels[i] = -1;
        continue;
      }
      while (lastTimeByLevel.length && lastTimeByLevel.peekLast() <= beginTime)
        lastTimeByLevel.pop();
      this._timelineData.entryLevels[i] = lastTimeByLevel.length;
      lastTimeByLevel.push(r.endTime);
      maxLevel = Math.max(maxLevel, lastTimeByLevel.length);
    }
    for (let i = 0; i < this._requests.length; ++i) {
      if (this._timelineData.entryLevels[i] === -1)
        this._timelineData.entryLevels[i] = maxLevel;
    }
    this._timelineData = new PerfUI.FlameChart.TimelineData(
        this._timelineData.entryLevels, this._timelineData.entryTotalTimes, this._timelineData.entryStartTimes,
        [this._group]);
    this._maxLevel = maxLevel;
  }


  /**
   * @param {!TimelineModel.TimelineModel.NetworkRequest} request
   */
  _appendEntry(request) {
    this._requests.push(request);
    this._timelineData.entryStartTimes.push(request.beginTime());
    this._timelineData.entryTotalTimes.push(request.endTime - request.beginTime());
    this._timelineData.entryLevels.push(this._requests.length - 1);
  }

  /**
   * @return {number}
   */
  preferredHeight() {
    return this._style.height * (this._group.expanded ? Number.constrain(this._maxLevel + 1, 4, 8.5) : 1);
  }

  /**
   * @return {boolean}
   */
  isExpanded() {
    return this._group.expanded;
  }

  /**
   * @override
   * @param {number} value
   * @param {number=} precision
   * @return {string}
   */
  formatValue(value, precision) {
    return Number.preciseMillisToString(value, precision);
  }

  /**
   * @override
   * @param {number} entryIndex
   * @return {boolean}
   */
  canJumpToEntry(entryIndex) {
    return false;
  }
};
