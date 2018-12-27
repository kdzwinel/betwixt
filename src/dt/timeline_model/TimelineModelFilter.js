// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

TimelineModel.TimelineModelFilter = class {
  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {boolean}
   */
  accept(event) {
    return true;
  }
};

TimelineModel.TimelineVisibleEventsFilter = class extends TimelineModel.TimelineModelFilter {
  /**
   * @param {!Array<string>} visibleTypes
   */
  constructor(visibleTypes) {
    super();
    this._visibleTypes = new Set(visibleTypes);
  }

  /**
   * @override
   * @param {!SDK.TracingModel.Event} event
   * @return {boolean}
   */
  accept(event) {
    return this._visibleTypes.has(TimelineModel.TimelineVisibleEventsFilter._eventType(event));
  }

  /**
   * @return {!TimelineModel.TimelineModel.RecordType}
   */
  static _eventType(event) {
    if (event.hasCategory(TimelineModel.TimelineModel.Category.Console))
      return TimelineModel.TimelineModel.RecordType.ConsoleTime;
    if (event.hasCategory(TimelineModel.TimelineModel.Category.UserTiming))
      return TimelineModel.TimelineModel.RecordType.UserTiming;
    if (event.hasCategory(TimelineModel.TimelineModel.Category.LatencyInfo))
      return TimelineModel.TimelineModel.RecordType.LatencyInfo;
    return /** @type !TimelineModel.TimelineModel.RecordType */ (event.name);
  }
};

TimelineModel.TimelineInvisibleEventsFilter = class extends TimelineModel.TimelineModelFilter {
  /**
   * @param {!Array<string>} invisibleTypes
   */
  constructor(invisibleTypes) {
    super();
    this._invisibleTypes = new Set(invisibleTypes);
  }

  /**
   * @override
   * @param {!SDK.TracingModel.Event} event
   * @return {boolean}
   */
  accept(event) {
    return !this._invisibleTypes.has(TimelineModel.TimelineVisibleEventsFilter._eventType(event));
  }
};

TimelineModel.ExclusiveNameFilter = class extends TimelineModel.TimelineModelFilter {
  /**
   * @param {!Array<string>} excludeNames
   */
  constructor(excludeNames) {
    super();
    this._excludeNames = new Set(excludeNames);
  }

  /**
   * @override
   * @param {!SDK.TracingModel.Event} event
   * @return {boolean}
   */
  accept(event) {
    return !this._excludeNames.has(event.name);
  }
};

TimelineModel.ExcludeTopLevelFilter = class extends TimelineModel.TimelineModelFilter {
  constructor() {
    super();
  }

  /**
   * @override
   * @param {!SDK.TracingModel.Event} event
   * @return {boolean}
   */
  accept(event) {
    return !SDK.TracingModel.isTopLevelEvent(event);
  }
};
