/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */
/**
 * @interface
 */
SDK.TracingManagerClient = function() {};

SDK.TracingManagerClient.prototype = {
  /**
   * @param {!Array.<!SDK.TracingManager.EventPayload>} events
   */
  traceEventsCollected(events) {},
  tracingComplete() {},
  /**
   * @param {number} usage
   */
  tracingBufferUsage(usage) {},
  /**
   * @param {number} progress
   */
  eventsRetrievalProgress(progress) {}
};

/**
 * @unrestricted
 */
SDK.TracingManager = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    this._tracingAgent = target.tracingAgent();
    target.registerTracingDispatcher(new SDK.TracingDispatcher(this));

    /** @type {?SDK.TracingManagerClient} */
    this._activeClient = null;
    this._eventBufferSize = 0;
    this._eventsRetrieved = 0;
  }

  /**
   * @param {number=} usage
   * @param {number=} eventCount
   * @param {number=} percentFull
   */
  _bufferUsage(usage, eventCount, percentFull) {
    this._eventBufferSize = eventCount;
    this._activeClient.tracingBufferUsage(usage || percentFull || 0);
  }

  /**
   * @param {!Array.<!SDK.TracingManager.EventPayload>} events
   */
  _eventsCollected(events) {
    this._activeClient.traceEventsCollected(events);
    this._eventsRetrieved += events.length;
    if (!this._eventBufferSize)
      return;
    if (this._eventsRetrieved > this._eventBufferSize)
      this._eventsRetrieved = this._eventBufferSize;
    this._activeClient.eventsRetrievalProgress(this._eventsRetrieved / this._eventBufferSize);
  }

  _tracingComplete() {
    this._eventBufferSize = 0;
    this._eventsRetrieved = 0;
    this._activeClient.tracingComplete();
    this._activeClient = null;
    this._finishing = false;
  }

  /**
   * @param {!SDK.TracingManagerClient} client
   * @param {string} categoryFilter
   * @param {string} options
   * @return {!Promise}
   */
  start(client, categoryFilter, options) {
    if (this._activeClient)
      throw new Error('Tracing is already started');
    const bufferUsageReportingIntervalMs = 500;
    this._activeClient = client;
    return this._tracingAgent.start(
        categoryFilter, options, bufferUsageReportingIntervalMs, SDK.TracingManager.TransferMode.ReportEvents);
  }

  stop() {
    if (!this._activeClient)
      throw new Error('Tracing is not started');
    if (this._finishing)
      throw new Error('Tracing is already being stopped');
    this._finishing = true;
    this._tracingAgent.end();
  }
};

SDK.SDKModel.register(SDK.TracingManager, SDK.Target.Capability.Tracing, false);

/** @typedef {!{
        cat: (string|undefined),
        pid: number,
        tid: number,
        ts: number,
        ph: string,
        name: string,
        args: !Object,
        dur: number,
        id: string,
        id2: (!{global: (string|undefined), local: (string|undefined)}|undefined),
        scope: string,
        bind_id: string,
        s: string
    }}
 */
SDK.TracingManager.EventPayload;

SDK.TracingManager.TransferMode = {
  ReportEvents: 'ReportEvents',
  ReturnAsStream: 'ReturnAsStream'
};

/**
 * @implements {Protocol.TracingDispatcher}
 * @unrestricted
 */
SDK.TracingDispatcher = class {
  /**
   * @param {!SDK.TracingManager} tracingManager
   */
  constructor(tracingManager) {
    this._tracingManager = tracingManager;
  }

  /**
   * @override
   * @param {number=} usage
   * @param {number=} eventCount
   * @param {number=} percentFull
   */
  bufferUsage(usage, eventCount, percentFull) {
    this._tracingManager._bufferUsage(usage, eventCount, percentFull);
  }

  /**
   * @override
   * @param {!Array.<!SDK.TracingManager.EventPayload>} data
   */
  dataCollected(data) {
    this._tracingManager._eventsCollected(data);
  }

  /**
   * @override
   */
  tracingComplete() {
    this._tracingManager._tracingComplete();
  }
};
