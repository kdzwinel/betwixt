/*
 * Copyright 2015 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @unrestricted
 */
SDK.FilmStripModel = class {
  /**
   * @param {!SDK.TracingModel} tracingModel
   * @param {number=} zeroTime
   */
  constructor(tracingModel, zeroTime) {
    this.reset(tracingModel, zeroTime);
  }

  /**
   * @param {!SDK.TracingModel} tracingModel
   * @param {number=} zeroTime
   */
  reset(tracingModel, zeroTime) {
    this._zeroTime = zeroTime || tracingModel.minimumRecordTime();
    this._spanTime = tracingModel.maximumRecordTime() - this._zeroTime;

    /** @type {!Array<!SDK.FilmStripModel.Frame>} */
    this._frames = [];
    const browserMain = SDK.TracingModel.browserMainThread(tracingModel);
    if (!browserMain)
      return;

    const events = browserMain.events();
    for (let i = 0; i < events.length; ++i) {
      const event = events[i];
      if (event.startTime < this._zeroTime)
        continue;
      if (!event.hasCategory(SDK.FilmStripModel._category))
        continue;
      if (event.name === SDK.FilmStripModel.TraceEvents.CaptureFrame) {
        const data = event.args['data'];
        if (data)
          this._frames.push(SDK.FilmStripModel.Frame._fromEvent(this, event, this._frames.length));
      } else if (event.name === SDK.FilmStripModel.TraceEvents.Screenshot) {
        this._frames.push(SDK.FilmStripModel.Frame._fromSnapshot(
            this, /** @type {!SDK.TracingModel.ObjectSnapshot} */ (event), this._frames.length));
      }
    }
  }

  /**
   * @return {!Array<!SDK.FilmStripModel.Frame>}
   */
  frames() {
    return this._frames;
  }

  /**
   * @return {number}
   */
  zeroTime() {
    return this._zeroTime;
  }

  /**
   * @return {number}
   */
  spanTime() {
    return this._spanTime;
  }

  /**
   * @param {number} timestamp
   * @return {?SDK.FilmStripModel.Frame}
   */
  frameByTimestamp(timestamp) {
    const index = this._frames.upperBound(timestamp, (timestamp, frame) => timestamp - frame.timestamp) - 1;
    return index >= 0 ? this._frames[index] : null;
  }
};

SDK.FilmStripModel._category = 'disabled-by-default-devtools.screenshot';

SDK.FilmStripModel.TraceEvents = {
  CaptureFrame: 'CaptureFrame',
  Screenshot: 'Screenshot'
};

/**
 * @unrestricted
 */
SDK.FilmStripModel.Frame = class {
  /**
   * @param {!SDK.FilmStripModel} model
   * @param {number} timestamp
   * @param {number} index
   */
  constructor(model, timestamp, index) {
    this._model = model;
    this.timestamp = timestamp;
    this.index = index;
    /** @type {?string} */
    this._imageData = null;
    /** @type {?SDK.TracingModel.ObjectSnapshot} */
    this._snapshot = null;
  }

  /**
   * @param {!SDK.FilmStripModel} model
   * @param {!SDK.TracingModel.Event} event
   * @param {number} index
   * @return {!SDK.FilmStripModel.Frame}
   */
  static _fromEvent(model, event, index) {
    const frame = new SDK.FilmStripModel.Frame(model, event.startTime, index);
    frame._imageData = event.args['data'];
    return frame;
  }

  /**
   * @param {!SDK.FilmStripModel} model
   * @param {!SDK.TracingModel.ObjectSnapshot} snapshot
   * @param {number} index
   * @return {!SDK.FilmStripModel.Frame}
   */
  static _fromSnapshot(model, snapshot, index) {
    const frame = new SDK.FilmStripModel.Frame(model, snapshot.startTime, index);
    frame._snapshot = snapshot;
    return frame;
  }

  /**
   * @return {!SDK.FilmStripModel}
   */
  model() {
    return this._model;
  }

  /**
   * @return {!Promise<?string>}
   */
  imageDataPromise() {
    if (this._imageData || !this._snapshot)
      return Promise.resolve(this._imageData);

    return /** @type {!Promise<?string>} */ (this._snapshot.objectPromise());
  }
};
