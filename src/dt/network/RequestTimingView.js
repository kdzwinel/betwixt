/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
Network.RequestTimingView = class extends UI.VBox {
  /**
   * @param {!SDK.NetworkRequest} request
   * @param {!Network.NetworkTimeCalculator} calculator
   */
  constructor(request, calculator) {
    super();
    this.element.classList.add('resource-timing-view');

    this._request = request;
    this._calculator = calculator;
  }

  /**
   * @param {!Network.RequestTimeRangeNames} name
   * @return {string}
   */
  static _timeRangeTitle(name) {
    switch (name) {
      case Network.RequestTimeRangeNames.Push:
        return Common.UIString('Receiving Push');
      case Network.RequestTimeRangeNames.Queueing:
        return Common.UIString('Queueing');
      case Network.RequestTimeRangeNames.Blocking:
        return Common.UIString('Stalled');
      case Network.RequestTimeRangeNames.Connecting:
        return Common.UIString('Initial connection');
      case Network.RequestTimeRangeNames.DNS:
        return Common.UIString('DNS Lookup');
      case Network.RequestTimeRangeNames.Proxy:
        return Common.UIString('Proxy negotiation');
      case Network.RequestTimeRangeNames.ReceivingPush:
        return Common.UIString('Reading Push');
      case Network.RequestTimeRangeNames.Receiving:
        return Common.UIString('Content Download');
      case Network.RequestTimeRangeNames.Sending:
        return Common.UIString('Request sent');
      case Network.RequestTimeRangeNames.ServiceWorker:
        return Common.UIString('Request to ServiceWorker');
      case Network.RequestTimeRangeNames.ServiceWorkerPreparation:
        return Common.UIString('ServiceWorker Preparation');
      case Network.RequestTimeRangeNames.SSL:
        return Common.UIString('SSL');
      case Network.RequestTimeRangeNames.Total:
        return Common.UIString('Total');
      case Network.RequestTimeRangeNames.Waiting:
        return Common.UIString('Waiting (TTFB)');
      default:
        return Common.UIString(name);
    }
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @param {number} navigationStart
   * @return {!Array.<!Network.RequestTimeRange>}
   */
  static calculateRequestTimeRanges(request, navigationStart) {
    const result = [];
    /**
     * @param {!Network.RequestTimeRangeNames} name
     * @param {number} start
     * @param {number} end
     */
    function addRange(name, start, end) {
      if (start < Number.MAX_VALUE && start <= end)
        result.push({name: name, start: start, end: end});
    }

    /**
     * @param {!Array.<number>} numbers
     * @return {number|undefined}
     */
    function firstPositive(numbers) {
      for (let i = 0; i < numbers.length; ++i) {
        if (numbers[i] > 0)
          return numbers[i];
      }
      return undefined;
    }

    /**
     * @param {!Network.RequestTimeRangeNames} name
     * @param {number} start
     * @param {number} end
     */
    function addOffsetRange(name, start, end) {
      if (start >= 0 && end >= 0)
        addRange(name, startTime + (start / 1000), startTime + (end / 1000));
    }

    const timing = request.timing;
    if (!timing) {
      const start = request.issueTime() !== -1 ? request.issueTime() : request.startTime !== -1 ? request.startTime : 0;
      const middle = (request.responseReceivedTime === -1) ? Number.MAX_VALUE : request.responseReceivedTime;
      const end = (request.endTime === -1) ? Number.MAX_VALUE : request.endTime;
      addRange(Network.RequestTimeRangeNames.Total, start, end);
      addRange(Network.RequestTimeRangeNames.Blocking, start, middle);
      addRange(Network.RequestTimeRangeNames.Receiving, middle, end);
      return result;
    }

    const issueTime = request.issueTime();
    const startTime = timing.requestTime;
    const endTime = firstPositive([request.endTime, request.responseReceivedTime]) || startTime;

    addRange(Network.RequestTimeRangeNames.Total, issueTime < startTime ? issueTime : startTime, endTime);
    if (timing.pushStart) {
      const pushEnd = timing.pushEnd || endTime;
      // Only show the part of push that happened after the navigation/reload.
      // Pushes that happened on the same connection before we started main request will not be shown.
      if (pushEnd > navigationStart)
        addRange(Network.RequestTimeRangeNames.Push, Math.max(timing.pushStart, navigationStart), pushEnd);
    }
    if (issueTime < startTime)
      addRange(Network.RequestTimeRangeNames.Queueing, issueTime, startTime);

    const responseReceived = (request.responseReceivedTime - startTime) * 1000;
    if (request.fetchedViaServiceWorker) {
      addOffsetRange(Network.RequestTimeRangeNames.Blocking, 0, timing.workerStart);
      addOffsetRange(Network.RequestTimeRangeNames.ServiceWorkerPreparation, timing.workerStart, timing.workerReady);
      addOffsetRange(Network.RequestTimeRangeNames.ServiceWorker, timing.workerReady, timing.sendEnd);
      addOffsetRange(Network.RequestTimeRangeNames.Waiting, timing.sendEnd, responseReceived);
    } else if (!timing.pushStart) {
      const blockingEnd =
          firstPositive([timing.dnsStart, timing.connectStart, timing.sendStart, responseReceived]) || 0;
      addOffsetRange(Network.RequestTimeRangeNames.Blocking, 0, blockingEnd);
      addOffsetRange(Network.RequestTimeRangeNames.Proxy, timing.proxyStart, timing.proxyEnd);
      addOffsetRange(Network.RequestTimeRangeNames.DNS, timing.dnsStart, timing.dnsEnd);
      addOffsetRange(Network.RequestTimeRangeNames.Connecting, timing.connectStart, timing.connectEnd);
      addOffsetRange(Network.RequestTimeRangeNames.SSL, timing.sslStart, timing.sslEnd);
      addOffsetRange(Network.RequestTimeRangeNames.Sending, timing.sendStart, timing.sendEnd);
      addOffsetRange(
          Network.RequestTimeRangeNames.Waiting,
          Math.max(timing.sendEnd, timing.connectEnd, timing.dnsEnd, timing.proxyEnd, blockingEnd), responseReceived);
    }

    if (request.endTime !== -1) {
      addRange(
          timing.pushStart ? Network.RequestTimeRangeNames.ReceivingPush : Network.RequestTimeRangeNames.Receiving,
          request.responseReceivedTime, endTime);
    }

    return result;
  }

  /**
   * @param {!SDK.NetworkRequest} request
   * @param {!Network.NetworkTimeCalculator} calculator
   * @return {!Element}
   */
  static createTimingTable(request, calculator) {
    const tableElement = createElementWithClass('table', 'network-timing-table');
    UI.appendStyle(tableElement, 'network/networkTimingTable.css');
    const colgroup = tableElement.createChild('colgroup');
    colgroup.createChild('col', 'labels');
    colgroup.createChild('col', 'bars');
    colgroup.createChild('col', 'duration');

    const timeRanges = Network.RequestTimingView.calculateRequestTimeRanges(request, calculator.minimumBoundary());
    const startTime = timeRanges.map(r => r.start).reduce((a, b) => Math.min(a, b));
    const endTime = timeRanges.map(r => r.end).reduce((a, b) => Math.max(a, b));
    const scale = 100 / (endTime - startTime);

    let connectionHeader;
    let dataHeader;
    let queueingHeader;
    let totalDuration = 0;

    const startTimeHeader = tableElement.createChild('thead', 'network-timing-start');
    const queuedCell = startTimeHeader.createChild('tr').createChild('td');
    const startedCell = startTimeHeader.createChild('tr').createChild('td');
    queuedCell.colSpan = startedCell.colSpan = 2;
    queuedCell.createTextChild(Common.UIString('Queued at %s', calculator.formatValue(request.issueTime(), 2)));
    startedCell.createTextChild(Common.UIString('Started at %s', calculator.formatValue(request.startTime, 2)));

    let right;
    for (let i = 0; i < timeRanges.length; ++i) {
      const range = timeRanges[i];
      const rangeName = range.name;
      if (rangeName === Network.RequestTimeRangeNames.Total) {
        totalDuration = range.end - range.start;
        continue;
      }
      if (rangeName === Network.RequestTimeRangeNames.Push) {
        createHeader(Common.UIString('Server Push'));
      } else if (rangeName === Network.RequestTimeRangeNames.Queueing) {
        queueingHeader = tableElement.createChild('tr', 'network-timing-table-header');
        queueingHeader.createChild('td').createTextChild(Common.UIString('Resource Scheduling'));
        queueingHeader.createChild('td').createTextChild('');
        queueingHeader.createChild('td').createTextChild(Common.UIString('TIME'));
      } else if (Network.RequestTimingView.ConnectionSetupRangeNames.has(rangeName)) {
        if (!connectionHeader)
          connectionHeader = createHeader(Common.UIString('Connection Start'));
      } else {
        if (!dataHeader)
          dataHeader = createHeader(Common.UIString('Request/Response'));
      }

      const left = (scale * (range.start - startTime));
      right = (scale * (endTime - range.end));
      const duration = range.end - range.start;

      const tr = tableElement.createChild('tr');
      tr.createChild('td').createTextChild(Network.RequestTimingView._timeRangeTitle(rangeName));

      const row = tr.createChild('td').createChild('div', 'network-timing-row');
      const bar = row.createChild('span', 'network-timing-bar ' + rangeName);
      bar.style.left = left + '%';
      bar.style.right = right + '%';
      bar.textContent = '\u200B';  // Important for 0-time items to have 0 width.
      const label = tr.createChild('td').createChild('div', 'network-timing-bar-title');
      label.textContent = Number.secondsToString(duration, true);
    }

    if (!request.finished) {
      const cell = tableElement.createChild('tr').createChild('td', 'caution');
      cell.colSpan = 3;
      cell.createTextChild(Common.UIString('CAUTION: request is not finished yet!'));
    }

    const footer = tableElement.createChild('tr', 'network-timing-footer');
    const note = footer.createChild('td');
    note.colSpan = 1;
    note.appendChild(
        UI.createDocumentationLink('network-performance/reference#timing-explanation', Common.UIString('Explanation')));
    footer.createChild('td');
    footer.createChild('td').createTextChild(Number.secondsToString(totalDuration, true));

    const serverTimings = request.serverTimings;
    if (!serverTimings)
      return tableElement;

    const lastTimingRightEdge = right === undefined ? 100 : right;

    const breakElement = tableElement.createChild('tr', 'network-timing-table-header').createChild('td');
    breakElement.colSpan = 3;
    breakElement.createChild('hr', 'break');

    const serverHeader = tableElement.createChild('tr', 'network-timing-table-header');
    serverHeader.createChild('td').createTextChild(Common.UIString('Server Timing'));
    serverHeader.createChild('td');
    serverHeader.createChild('td').createTextChild(Common.UIString('TIME'));

    serverTimings.filter(item => item.metric.toLowerCase() !== 'total')
        .forEach(item => addTiming(item, lastTimingRightEdge));
    serverTimings.filter(item => item.metric.toLowerCase() === 'total')
        .forEach(item => addTiming(item, lastTimingRightEdge));

    return tableElement;

    /**
     * @param {!SDK.ServerTiming} serverTiming
     * @param {number} right
     */
    function addTiming(serverTiming, right) {
      const colorGenerator = new Common.Color.Generator({min: 0, max: 360, count: 36}, {min: 50, max: 80}, 80);
      const isTotal = serverTiming.metric.toLowerCase() === 'total';
      const tr = tableElement.createChild('tr', isTotal ? 'network-timing-footer' : '');
      const metric = tr.createChild('td', 'network-timing-metric');
      metric.createTextChild(serverTiming.description || serverTiming.metric);
      const row = tr.createChild('td').createChild('div', 'network-timing-row');

      if (serverTiming.value === null)
        return;
      const left = scale * (endTime - startTime - (serverTiming.value / 1000));
      if (left >= 0) {  // don't chart values too big or too small
        const bar = row.createChild('span', 'network-timing-bar server-timing');
        bar.style.left = left + '%';
        bar.style.right = right + '%';
        bar.textContent = '\u200B';  // Important for 0-time items to have 0 width.
        if (!isTotal)
          bar.style.backgroundColor = colorGenerator.colorForID(serverTiming.metric);
      }
      const label = tr.createChild('td').createChild('div', 'network-timing-bar-title');
      label.textContent = Number.millisToString(serverTiming.value, true);
    }

    /**
     * @param {string} title
     * @return {!Element}
     */
    function createHeader(title) {
      const dataHeader = tableElement.createChild('tr', 'network-timing-table-header');
      dataHeader.createChild('td').createTextChild(title);
      dataHeader.createChild('td').createTextChild('');
      dataHeader.createChild('td').createTextChild(Common.UIString('TIME'));
      return dataHeader;
    }
  }

  /**
   * @override
   */
  wasShown() {
    this._request.addEventListener(SDK.NetworkRequest.Events.TimingChanged, this._refresh, this);
    this._request.addEventListener(SDK.NetworkRequest.Events.FinishedLoading, this._refresh, this);
    this._calculator.addEventListener(Network.NetworkTimeCalculator.Events.BoundariesChanged, this._refresh, this);
    this._refresh();
  }

  /**
   * @override
   */
  willHide() {
    this._request.removeEventListener(SDK.NetworkRequest.Events.TimingChanged, this._refresh, this);
    this._request.removeEventListener(SDK.NetworkRequest.Events.FinishedLoading, this._refresh, this);
    this._calculator.removeEventListener(Network.NetworkTimeCalculator.Events.BoundariesChanged, this._refresh, this);
  }

  _refresh() {
    if (this._tableElement)
      this._tableElement.remove();

    this._tableElement = Network.RequestTimingView.createTimingTable(this._request, this._calculator);
    this._tableElement.classList.add('resource-timing-table');
    this.element.appendChild(this._tableElement);
  }
};

/** @enum {string} */
Network.RequestTimeRangeNames = {
  Push: 'push',
  Queueing: 'queueing',
  Blocking: 'blocking',
  Connecting: 'connecting',
  DNS: 'dns',
  Proxy: 'proxy',
  Receiving: 'receiving',
  ReceivingPush: 'receiving-push',
  Sending: 'sending',
  ServiceWorker: 'serviceworker',
  ServiceWorkerPreparation: 'serviceworker-preparation',
  SSL: 'ssl',
  Total: 'total',
  Waiting: 'waiting'
};

Network.RequestTimingView.ConnectionSetupRangeNames = new Set([
  Network.RequestTimeRangeNames.Queueing, Network.RequestTimeRangeNames.Blocking,
  Network.RequestTimeRangeNames.Connecting, Network.RequestTimeRangeNames.DNS, Network.RequestTimeRangeNames.Proxy,
  Network.RequestTimeRangeNames.SSL
]);

/** @typedef {{name: !Network.RequestTimeRangeNames, start: number, end: number}} */
Network.RequestTimeRange;
