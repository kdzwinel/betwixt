// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
TimelineModel.TimelineIRModel = class {
  constructor() {
    this.reset();
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {!TimelineModel.TimelineIRModel.Phases}
   */
  static phaseForEvent(event) {
    return event[TimelineModel.TimelineIRModel._eventIRPhase];
  }

  /**
   * @param {?Array<!SDK.TracingModel.AsyncEvent>} inputLatencies
   * @param {?Array<!SDK.TracingModel.AsyncEvent>} animations
   */
  populate(inputLatencies, animations) {
    this.reset();
    if (!inputLatencies)
      return;
    this._processInputLatencies(inputLatencies);
    if (animations)
      this._processAnimations(animations);
    const range = new Common.SegmentedRange();
    range.appendRange(this._drags);  // Drags take lower precedence than animation, as we can't detect them reliably.
    range.appendRange(this._cssAnimations);
    range.appendRange(this._scrolls);
    range.appendRange(this._responses);
    this._segments = range.segments();
  }

  /**
   * @param {!Array<!SDK.TracingModel.AsyncEvent>} events
   */
  _processInputLatencies(events) {
    const eventTypes = TimelineModel.TimelineIRModel.InputEvents;
    const phases = TimelineModel.TimelineIRModel.Phases;
    const thresholdsMs = TimelineModel.TimelineIRModel._mergeThresholdsMs;

    let scrollStart;
    let flingStart;
    let touchStart;
    let firstTouchMove;
    let mouseWheel;
    let mouseDown;
    let mouseMove;

    for (let i = 0; i < events.length; ++i) {
      const event = events[i];
      if (i > 0 && events[i].startTime < events[i - 1].startTime)
        console.assert(false, 'Unordered input events');
      const type = this._inputEventType(event.name);
      switch (type) {
        case eventTypes.ScrollBegin:
          this._scrolls.append(this._segmentForEvent(event, phases.Scroll));
          scrollStart = event;
          break;

        case eventTypes.ScrollEnd:
          if (scrollStart)
            this._scrolls.append(this._segmentForEventRange(scrollStart, event, phases.Scroll));
          else
            this._scrolls.append(this._segmentForEvent(event, phases.Scroll));
          scrollStart = null;
          break;

        case eventTypes.ScrollUpdate:
          touchStart = null;  // Since we're scrolling now, disregard other touch gestures.
          this._scrolls.append(this._segmentForEvent(event, phases.Scroll));
          break;

        case eventTypes.FlingStart:
          if (flingStart) {
            Common.console.error(
                Common.UIString('Two flings at the same time? %s vs %s', flingStart.startTime, event.startTime));
            break;
          }
          flingStart = event;
          break;

        case eventTypes.FlingCancel:
          // FIXME: also process renderer fling events.
          if (!flingStart)
            break;
          this._scrolls.append(this._segmentForEventRange(flingStart, event, phases.Fling));
          flingStart = null;
          break;

        case eventTypes.ImplSideFling:
          this._scrolls.append(this._segmentForEvent(event, phases.Fling));
          break;

        case eventTypes.ShowPress:
        case eventTypes.Tap:
        case eventTypes.KeyDown:
        case eventTypes.KeyDownRaw:
        case eventTypes.KeyUp:
        case eventTypes.Char:
        case eventTypes.Click:
        case eventTypes.ContextMenu:
          this._responses.append(this._segmentForEvent(event, phases.Response));
          break;

        case eventTypes.TouchStart:
          // We do not produce any response segment for TouchStart -- there's either going to be one upon
          // TouchMove for drag, or one for GestureTap.
          if (touchStart) {
            Common.console.error(
                Common.UIString('Two touches at the same time? %s vs %s', touchStart.startTime, event.startTime));
            break;
          }
          touchStart = event;
          event.steps[0][TimelineModel.TimelineIRModel._eventIRPhase] = phases.Response;
          firstTouchMove = null;
          break;

        case eventTypes.TouchCancel:
          touchStart = null;
          break;

        case eventTypes.TouchMove:
          if (firstTouchMove) {
            this._drags.append(this._segmentForEvent(event, phases.Drag));
          } else if (touchStart) {
            firstTouchMove = event;
            this._responses.append(this._segmentForEventRange(touchStart, event, phases.Response));
          }
          break;

        case eventTypes.TouchEnd:
          touchStart = null;
          break;

        case eventTypes.MouseDown:
          mouseDown = event;
          mouseMove = null;
          break;

        case eventTypes.MouseMove:
          if (mouseDown && !mouseMove && mouseDown.startTime + thresholdsMs.mouse > event.startTime) {
            this._responses.append(this._segmentForEvent(mouseDown, phases.Response));
            this._responses.append(this._segmentForEvent(event, phases.Response));
          } else if (mouseDown) {
            this._drags.append(this._segmentForEvent(event, phases.Drag));
          }
          mouseMove = event;
          break;

        case eventTypes.MouseUp:
          this._responses.append(this._segmentForEvent(event, phases.Response));
          mouseDown = null;
          break;

        case eventTypes.MouseWheel:
          // Do not consider first MouseWheel as trace viewer's implementation does -- in case of MouseWheel it's not really special.
          if (mouseWheel && canMerge(thresholdsMs.mouse, mouseWheel, event))
            this._scrolls.append(this._segmentForEventRange(mouseWheel, event, phases.Scroll));
          else
            this._scrolls.append(this._segmentForEvent(event, phases.Scroll));
          mouseWheel = event;
          break;
      }
    }

    /**
     * @param {number} threshold
     * @param {!SDK.TracingModel.AsyncEvent} first
     * @param {!SDK.TracingModel.AsyncEvent} second
     * @return {boolean}
     */
    function canMerge(threshold, first, second) {
      return first.endTime < second.startTime && second.startTime < first.endTime + threshold;
    }
  }

  /**
   * @param {!Array<!SDK.TracingModel.AsyncEvent>} events
   */
  _processAnimations(events) {
    for (let i = 0; i < events.length; ++i)
      this._cssAnimations.append(this._segmentForEvent(events[i], TimelineModel.TimelineIRModel.Phases.Animation));
  }

  /**
   * @param {!SDK.TracingModel.AsyncEvent} event
   * @param {!TimelineModel.TimelineIRModel.Phases} phase
   * @return {!Common.Segment}
   */
  _segmentForEvent(event, phase) {
    this._setPhaseForEvent(event, phase);
    return new Common.Segment(event.startTime, event.endTime, phase);
  }

  /**
   * @param {!SDK.TracingModel.AsyncEvent} startEvent
   * @param {!SDK.TracingModel.AsyncEvent} endEvent
   * @param {!TimelineModel.TimelineIRModel.Phases} phase
   * @return {!Common.Segment}
   */
  _segmentForEventRange(startEvent, endEvent, phase) {
    this._setPhaseForEvent(startEvent, phase);
    this._setPhaseForEvent(endEvent, phase);
    return new Common.Segment(startEvent.startTime, endEvent.endTime, phase);
  }

  /**
   * @param {!SDK.TracingModel.AsyncEvent} asyncEvent
   * @param {!TimelineModel.TimelineIRModel.Phases} phase
   */
  _setPhaseForEvent(asyncEvent, phase) {
    asyncEvent.steps[0][TimelineModel.TimelineIRModel._eventIRPhase] = phase;
  }

  /**
   * @return {!Array<!Common.Segment>}
   */
  interactionRecords() {
    return this._segments;
  }

  reset() {
    const thresholdsMs = TimelineModel.TimelineIRModel._mergeThresholdsMs;

    this._segments = [];
    this._drags = new Common.SegmentedRange(merge.bind(null, thresholdsMs.mouse));
    this._cssAnimations = new Common.SegmentedRange(merge.bind(null, thresholdsMs.animation));
    this._responses = new Common.SegmentedRange(merge.bind(null, 0));
    this._scrolls = new Common.SegmentedRange(merge.bind(null, thresholdsMs.animation));

    /**
     * @param {number} threshold
     * @param {!Common.Segment} first
     * @param {!Common.Segment} second
     */
    function merge(threshold, first, second) {
      return first.end + threshold >= second.begin && first.data === second.data ? first : null;
    }
  }

  /**
   * @param {string} eventName
   * @return {?TimelineModel.TimelineIRModel.InputEvents}
   */
  _inputEventType(eventName) {
    const prefix = 'InputLatency::';
    if (!eventName.startsWith(prefix)) {
      if (eventName === TimelineModel.TimelineIRModel.InputEvents.ImplSideFling)
        return /** @type {!TimelineModel.TimelineIRModel.InputEvents} */ (eventName);
      console.error('Unrecognized input latency event: ' + eventName);
      return null;
    }
    return /** @type {!TimelineModel.TimelineIRModel.InputEvents} */ (eventName.substr(prefix.length));
  }
};

/**
 * @enum {string}
 */
TimelineModel.TimelineIRModel.Phases = {
  Idle: 'Idle',
  Response: 'Response',
  Scroll: 'Scroll',
  Fling: 'Fling',
  Drag: 'Drag',
  Animation: 'Animation',
  Uncategorized: 'Uncategorized'
};

/**
 * @enum {string}
 */
TimelineModel.TimelineIRModel.InputEvents = {
  Char: 'Char',
  Click: 'GestureClick',
  ContextMenu: 'ContextMenu',
  FlingCancel: 'GestureFlingCancel',
  FlingStart: 'GestureFlingStart',
  ImplSideFling: TimelineModel.TimelineModel.RecordType.ImplSideFling,
  KeyDown: 'KeyDown',
  KeyDownRaw: 'RawKeyDown',
  KeyUp: 'KeyUp',
  LatencyScrollUpdate: 'ScrollUpdate',
  MouseDown: 'MouseDown',
  MouseMove: 'MouseMove',
  MouseUp: 'MouseUp',
  MouseWheel: 'MouseWheel',
  PinchBegin: 'GesturePinchBegin',
  PinchEnd: 'GesturePinchEnd',
  PinchUpdate: 'GesturePinchUpdate',
  ScrollBegin: 'GestureScrollBegin',
  ScrollEnd: 'GestureScrollEnd',
  ScrollUpdate: 'GestureScrollUpdate',
  ScrollUpdateRenderer: 'ScrollUpdate',
  ShowPress: 'GestureShowPress',
  Tap: 'GestureTap',
  TapCancel: 'GestureTapCancel',
  TapDown: 'GestureTapDown',
  TouchCancel: 'TouchCancel',
  TouchEnd: 'TouchEnd',
  TouchMove: 'TouchMove',
  TouchStart: 'TouchStart'
};

TimelineModel.TimelineIRModel._mergeThresholdsMs = {
  animation: 1,
  mouse: 40,
};

TimelineModel.TimelineIRModel._eventIRPhase = Symbol('eventIRPhase');
