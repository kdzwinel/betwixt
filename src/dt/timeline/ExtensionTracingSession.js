// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Extensions.TracingSession}
 * @implements {Timeline.TimelineLoader.Client}
 */
Timeline.ExtensionTracingSession = class {
  /**
   * @param {!Extensions.ExtensionTraceProvider} provider
   * @param {!Timeline.PerformanceModel} performanceModel
   */
  constructor(provider, performanceModel) {
    this._provider = provider;
    this._performanceModel = performanceModel;
    /** @type {function()} */
    this._completionCallback;
    this._completionPromise = new Promise(fulfill => {
      this._completionCallback = fulfill;
    });
    this._timeOffset = 0;
  }

  /** @override */
  loadingStarted() {
  }

  /** @override */
  processingStarted() {
  }

  /**
   * @override
   * @param {number=} progress
   */
  loadingProgress(progress) {
  }

  /**
   * @override
   * @param {?SDK.TracingModel} tracingModel
   */
  loadingComplete(tracingModel) {
    if (!tracingModel)
      return;
    this._performanceModel.addExtensionEvents(this._provider.longDisplayName(), tracingModel, this._timeOffset);
    this._completionCallback();
  }

  /**
   * @override
   * @param {string} url
   * @param {number} timeOffsetMicroseconds
   */
  complete(url, timeOffsetMicroseconds) {
    if (!url) {
      this._completionCallback();
      return;
    }
    this._timeOffset = timeOffsetMicroseconds;
    Timeline.TimelineLoader.loadFromURL(url, this);
  }

  start() {
    this._provider.start(this);
  }

  /** @return {!Promise<string>} */
  stop() {
    this._provider.stop();
    return this._completionPromise;
  }
};
