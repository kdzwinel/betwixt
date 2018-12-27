// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Timeline.PerformanceModel = class extends Common.Object {
  constructor() {
    super();
    /** @type {?SDK.Target} */
    this._mainTarget = null;
    /** @type {?SDK.TracingModel} */
    this._tracingModel = null;
    /** @type {!Array<!TimelineModel.TimelineModelFilter>} */
    this._filters = [];

    this._timelineModel = new TimelineModel.TimelineModel();
    this._frameModel =
        new TimelineModel.TimelineFrameModel(event => Timeline.TimelineUIUtils.eventStyle(event).category.name);
    /** @type {?SDK.FilmStripModel} */
    this._filmStripModel = null;
    /** @type {?TimelineModel.TimelineIRModel} */
    this._irModel = new TimelineModel.TimelineIRModel();

    /** @type {!Timeline.PerformanceModel.Window} */
    this._window = {left: 0, right: Infinity};

    /** @type {!Array<!{title: string, model: !SDK.TracingModel, timeOffset: number}>} */
    this._extensionTracingModels = [];
    /** @type {number|undefined} */
    this._recordStartTime = undefined;
  }

  /**
   * @param {!SDK.Target} target
   */
  setMainTarget(target) {
    this._mainTarget = target;
  }

  /**
   * @param {number} time
   */
  setRecordStartTime(time) {
    this._recordStartTime = time;
  }

  /**
   * @return {number|undefined}
   */
  recordStartTime() {
    return this._recordStartTime;
  }

  /**
   * @param {!Array<!TimelineModel.TimelineModelFilter>} filters
   */
  setFilters(filters) {
    this._filters = filters;
  }

  /**
   * @return {!Array<!TimelineModel.TimelineModelFilter>}
   */
  filters() {
    return this._filters;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {boolean}
   */
  isVisible(event) {
    return this._filters.every(f => f.accept(event));
  }

  /**
   * @param {!SDK.TracingModel} model
   */
  setTracingModel(model) {
    this._tracingModel = model;
    this._timelineModel.setEvents(model);

    let inputEvents = null;
    let animationEvents = null;
    for (const track of this._timelineModel.tracks()) {
      if (track.type === TimelineModel.TimelineModel.TrackType.Input)
        inputEvents = track.asyncEvents;
      if (track.type === TimelineModel.TimelineModel.TrackType.Animation)
        animationEvents = track.asyncEvents;
    }
    if (inputEvents || animationEvents)
      this._irModel.populate(inputEvents || [], animationEvents || []);

    const mainTracks = this._timelineModel.tracks().filter(
        track => track.type === TimelineModel.TimelineModel.TrackType.MainThread && track.forMainFrame &&
            track.events.length);
    const threadData = mainTracks.map(track => {
      const event = track.events[0];
      return {thread: event.thread, time: event.startTime};
    });
    this._frameModel.addTraceEvents(this._mainTarget, this._timelineModel.inspectedTargetEvents(), threadData);

    for (const entry of this._extensionTracingModels) {
      entry.model.adjustTime(
          this._tracingModel.minimumRecordTime() + (entry.timeOffset / 1000) - this._recordStartTime);
    }
    this._autoWindowTimes();
  }

  /**
   * @param {string} title
   * @param {!SDK.TracingModel} model
   * @param {number} timeOffset
   */
  addExtensionEvents(title, model, timeOffset) {
    this._extensionTracingModels.push({model: model, title: title, timeOffset: timeOffset});
    if (!this._tracingModel)
      return;
    model.adjustTime(this._tracingModel.minimumRecordTime() + (timeOffset / 1000) - this._recordStartTime);
    this.dispatchEventToListeners(Timeline.PerformanceModel.Events.ExtensionDataAdded);
  }

  /**
   * @return {!SDK.TracingModel}
   */
  tracingModel() {
    if (!this._tracingModel)
      throw 'call setTracingModel before accessing PerformanceModel';
    return this._tracingModel;
  }

  /**
   * @return {!TimelineModel.TimelineModel}
   */
  timelineModel() {
    return this._timelineModel;
  }

  /**
   * @return {!SDK.FilmStripModel} filmStripModel
   */
  filmStripModel() {
    if (this._filmStripModel)
      return this._filmStripModel;
    if (!this._tracingModel)
      throw 'call setTracingModel before accessing PerformanceModel';
    this._filmStripModel = new SDK.FilmStripModel(this._tracingModel);
    return this._filmStripModel;
  }

  /**
   * @return {!Array<!TimelineModel.TimelineFrame>} frames
   */
  frames() {
    return this._frameModel.frames();
  }

  /**
   * @return {!TimelineModel.TimelineFrameModel} frames
   */
  frameModel() {
    return this._frameModel;
  }

  /**
   * @return {!Array<!Common.Segment>}
   */
  interactionRecords() {
    return this._irModel.interactionRecords();
  }

  /**
   * @return {!Array<!{title: string, model: !SDK.TracingModel}>}
   */
  extensionInfo() {
    return this._extensionTracingModels;
  }

  dispose() {
    if (this._tracingModel)
      this._tracingModel.dispose();
    for (const extensionEntry of this._extensionTracingModels)
      extensionEntry.model.dispose();
  }

  /**
   * @param {!TimelineModel.TimelineFrame} frame
   * @return {?SDK.FilmStripModel.Frame}
   */
  filmStripModelFrame(frame) {
    // For idle frames, look at the state at the beginning of the frame.
    const screenshotTime = frame.idle ? frame.startTime : frame.endTime;
    const filmStripFrame = this._filmStripModel.frameByTimestamp(screenshotTime);
    return filmStripFrame && filmStripFrame.timestamp - frame.endTime < 10 ? filmStripFrame : null;
  }

  /**
   * @param {!Common.OutputStream} stream
   * @return {!Promise<?FileError>}
   */
  save(stream) {
    const backingStorage = /** @type {!Bindings.TempFileBackingStorage} */ (this._tracingModel.backingStorage());
    return backingStorage.writeToStream(stream);
  }

  /**
   * @param {!Timeline.PerformanceModel.Window} window
   * @param {boolean=} animate
   */
  setWindow(window, animate) {
    this._window = window;
    this.dispatchEventToListeners(Timeline.PerformanceModel.Events.WindowChanged, {window, animate});
  }

  /**
   * @return {!Timeline.PerformanceModel.Window}
   */
  window() {
    return this._window;
  }

  _autoWindowTimes() {
    const timelineModel = this._timelineModel;
    let tasks = [];
    for (const track of timelineModel.tracks()) {
      // Deliberately pick up last main frame's track.
      if (track.type === TimelineModel.TimelineModel.TrackType.MainThread && track.forMainFrame)
        tasks = track.tasks;
    }
    if (!tasks.length) {
      this.setWindow({left: timelineModel.minimumRecordTime(), right: timelineModel.maximumRecordTime()});
      return;
    }

    /**
     * @param {number} startIndex
     * @param {number} stopIndex
     * @return {number}
     */
    function findLowUtilizationRegion(startIndex, stopIndex) {
      const /** @const */ threshold = 0.1;
      let cutIndex = startIndex;
      let cutTime = (tasks[cutIndex].startTime + tasks[cutIndex].endTime) / 2;
      let usedTime = 0;
      const step = Math.sign(stopIndex - startIndex);
      for (let i = startIndex; i !== stopIndex; i += step) {
        const task = tasks[i];
        const taskTime = (task.startTime + task.endTime) / 2;
        const interval = Math.abs(cutTime - taskTime);
        if (usedTime < threshold * interval) {
          cutIndex = i;
          cutTime = taskTime;
          usedTime = 0;
        }
        usedTime += task.duration;
      }
      return cutIndex;
    }
    const rightIndex = findLowUtilizationRegion(tasks.length - 1, 0);
    const leftIndex = findLowUtilizationRegion(0, rightIndex);
    let leftTime = tasks[leftIndex].startTime;
    let rightTime = tasks[rightIndex].endTime;
    const span = rightTime - leftTime;
    const totalSpan = timelineModel.maximumRecordTime() - timelineModel.minimumRecordTime();
    if (span < totalSpan * 0.1) {
      leftTime = timelineModel.minimumRecordTime();
      rightTime = timelineModel.maximumRecordTime();
    } else {
      leftTime = Math.max(leftTime - 0.05 * span, timelineModel.minimumRecordTime());
      rightTime = Math.min(rightTime + 0.05 * span, timelineModel.maximumRecordTime());
    }
    this.setWindow({left: leftTime, right: rightTime});
  }
};

/**
 * @enum {symbol}
 */
Timeline.PerformanceModel.Events = {
  ExtensionDataAdded: Symbol('ExtensionDataAdded'),
  WindowChanged: Symbol('WindowChanged')
};

/** @typedef {!{left: number, right: number}} */
Timeline.PerformanceModel.Window;
