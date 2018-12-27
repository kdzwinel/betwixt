/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
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
 * @implements {PerfUI.FlameChartDataProvider}
 * @unrestricted
 */
Timeline.TimelineFlameChartDataProvider = class extends Common.Object {
  constructor() {
    super();
    this.reset();
    this._font = '11px ' + Host.fontFamily();
    /** @type {?PerfUI.FlameChart.TimelineData} */
    this._timelineData = null;
    this._currentLevel = 0;
    /** @type {?Timeline.PerformanceModel} */
    this._performanceModel = null;
    /** @type {?TimelineModel.TimelineModel} */
    this._model = null;
    this._minimumBoundary = 0;
    this._maximumBoundary = 0;
    this._timeSpan = 0;

    this._consoleColorGenerator =
        new Common.Color.Generator({min: 30, max: 55}, {min: 70, max: 100, count: 6}, 50, 0.7);
    this._extensionColorGenerator =
        new Common.Color.Generator({min: 210, max: 300}, {min: 70, max: 100, count: 6}, 70, 0.7);

    this._headerLevel1 = this._buildGroupStyle({shareHeaderLine: false});
    this._headerLevel2 = this._buildGroupStyle({padding: 2, nestingLevel: 1, collapsible: false});
    this._staticHeader = this._buildGroupStyle({collapsible: false});
    this._framesHeader = this._buildGroupStyle({useFirstLineForOverview: true});
    this._timingsHeader = this._buildGroupStyle({shareHeaderLine: true, useFirstLineForOverview: true});
    this._screenshotsHeader =
        this._buildGroupStyle({useFirstLineForOverview: true, nestingLevel: 1, collapsible: false, itemsHeight: 150});
    this._interactionsHeaderLevel1 = this._buildGroupStyle({useFirstLineForOverview: true});
    this._interactionsHeaderLevel2 = this._buildGroupStyle({padding: 2, nestingLevel: 1});

    /** @type {!Map<string, number>} */
    this._flowEventIndexById = new Map();
  }

  /**
   * @param {!Object} extra
   * @return {!PerfUI.FlameChart.GroupStyle}
   */
  _buildGroupStyle(extra) {
    const defaultGroupStyle = {
      padding: 4,
      height: 17,
      collapsible: true,
      color: UI.themeSupport.patchColorText('#222', UI.ThemeSupport.ColorUsage.Foreground),
      backgroundColor: UI.themeSupport.patchColorText('white', UI.ThemeSupport.ColorUsage.Background),
      font: this._font,
      nestingLevel: 0,
      shareHeaderLine: true
    };
    return /** @type {!PerfUI.FlameChart.GroupStyle} */ (Object.assign(defaultGroupStyle, extra));
  }

  /**
   * @param {?Timeline.PerformanceModel} performanceModel
   */
  setModel(performanceModel) {
    this.reset();
    this._performanceModel = performanceModel;
    this._model = performanceModel && performanceModel.timelineModel();
  }

  /**
   * @param {!PerfUI.FlameChart.Group} group
   * @return {?TimelineModel.TimelineModel.Track}
   */
  groupTrack(group) {
    return group._track || null;
  }

  /**
   * @override
   * @param {number} entryIndex
   * @return {?string}
   */
  entryTitle(entryIndex) {
    const entryTypes = Timeline.TimelineFlameChartDataProvider.EntryType;
    const entryType = this._entryType(entryIndex);
    if (entryType === entryTypes.Event) {
      const event = /** @type {!SDK.TracingModel.Event} */ (this._entryData[entryIndex]);
      if (event.phase === SDK.TracingModel.Phase.AsyncStepInto || event.phase === SDK.TracingModel.Phase.AsyncStepPast)
        return event.name + ':' + event.args['step'];
      if (event._blackboxRoot)
        return Common.UIString('Blackboxed');
      if (this._performanceModel.timelineModel().isMarkerEvent(event))
        return Timeline.TimelineUIUtils.markerShortTitle(event);
      const name = Timeline.TimelineUIUtils.eventStyle(event).title;
      const detailsText =
          Timeline.TimelineUIUtils.buildDetailsTextForTraceEvent(event, this._model.targetByEvent(event));
      if (event.name === TimelineModel.TimelineModel.RecordType.JSFrame && detailsText)
        return detailsText;
      return detailsText ? Common.UIString('%s (%s)', name, detailsText) : name;
    }
    if (entryType === entryTypes.ExtensionEvent) {
      const event = /** @type {!SDK.TracingModel.Event} */ (this._entryData[entryIndex]);
      return event.name;
    }
    if (entryType === entryTypes.Screenshot)
      return '';
    let title = this._entryIndexToTitle[entryIndex];
    if (!title) {
      title = Common.UIString('Unexpected entryIndex %d', entryIndex);
      console.error(title);
    }
    return title;
  }

  /**
   * @override
   * @param {number} index
   * @return {string}
   */
  textColor(index) {
    const event = this._entryData[index];
    return event && event._blackboxRoot ? '#888' : Timeline.FlameChartStyle.textColor;
  }

  /**
   * @override
   * @param {number} index
   * @return {?string}
   */
  entryFont(index) {
    return this._font;
  }

  reset() {
    this._currentLevel = 0;
    this._timelineData = null;
    /** @type {!Array<!SDK.FilmStripModel.Frame|!SDK.TracingModel.Event|!TimelineModel.TimelineFrame|!TimelineModel.TimelineIRModel.Phases>} */
    this._entryData = [];
    /** @type {!Array<!SDK.TracingModel.Event>} */
    this._entryParent = [];
    /** @type {!Array<!Timeline.TimelineFlameChartDataProvider.EntryType>} */
    this._entryTypeByLevel = [];
    /** @type {!Array<string>} */
    this._entryIndexToTitle = [];
    /** @type {!Array<!Timeline.TimelineFlameChartMarker>} */
    this._markers = [];
    /** @type {!Map<!Timeline.TimelineCategory, string>} */
    this._asyncColorByCategory = new Map();
    /** @type {!Map<!TimelineModel.TimelineIRModel.Phases, string>} */
    this._asyncColorByInteractionPhase = new Map();
    /** @type {!Array<!{title: string, model: !SDK.TracingModel}>} */
    this._extensionInfo = [];
    /** @type {!Map<!SDK.FilmStripModel.Frame, ?Image>} */
    this._screenshotImageCache = new Map();
  }

  /**
   * @override
   * @return {number}
   */
  maxStackDepth() {
    return this._currentLevel;
  }

  /**
   * @override
   * @return {!PerfUI.FlameChart.TimelineData}
   */
  timelineData() {
    if (this._timelineData)
      return this._timelineData;

    this._timelineData = new PerfUI.FlameChart.TimelineData([], [], [], []);
    if (!this._model)
      return this._timelineData;

    this._flowEventIndexById.clear();
    this._minimumBoundary = this._model.minimumRecordTime();
    this._timeSpan = this._model.isEmpty() ? 1000 : this._model.maximumRecordTime() - this._minimumBoundary;
    this._currentLevel = 0;

    if (this._model.isGenericTrace())
      this._processGenericTrace();
    else
      this._processInspectorTrace();

    return this._timelineData;
  }

  _processGenericTrace() {
    const processGroupStyle = this._buildGroupStyle({shareHeaderLine: false});
    const threadGroupStyle = this._buildGroupStyle({padding: 2, nestingLevel: 1, shareHeaderLine: false});
    const eventEntryType = Timeline.TimelineFlameChartDataProvider.EntryType.Event;
    /** @type {!Multimap<!SDK.TracingModel.Process, !TimelineModel.TimelineModel.Track>} */
    const tracksByProcess = new Multimap();
    for (const track of this._model.tracks())
      tracksByProcess.set(track.thread.process(), track);
    for (const process of tracksByProcess.keysArray()) {
      if (tracksByProcess.size > 1) {
        const name = `${process.name()} ${process.id()}`;
        this._appendHeader(name, processGroupStyle, false /* selectable */);
      }
      for (const track of tracksByProcess.get(process)) {
        const group = this._appendSyncEvents(
            track, track.events, track.name, threadGroupStyle, eventEntryType, true /* selectable */);
        if (!this._timelineData.selectedGroup || track.name === TimelineModel.TimelineModel.BrowserMainThreadName)
          this._timelineData.selectedGroup = group;
      }
    }
  }

  _processInspectorTrace() {
    this._appendFrames();
    this._appendInteractionRecords();

    const eventEntryType = Timeline.TimelineFlameChartDataProvider.EntryType.Event;

    const weight = track => {
      switch (track.type) {
        case TimelineModel.TimelineModel.TrackType.Input:
          return 0;
        case TimelineModel.TimelineModel.TrackType.Animation:
          return 1;
        case TimelineModel.TimelineModel.TrackType.Timings:
          return 2;
        case TimelineModel.TimelineModel.TrackType.Console:
          return 3;
        case TimelineModel.TimelineModel.TrackType.MainThread:
          return track.forMainFrame ? 4 : 5;
        case TimelineModel.TimelineModel.TrackType.Worker:
          return 6;
        case TimelineModel.TimelineModel.TrackType.Raster:
          return 7;
        case TimelineModel.TimelineModel.TrackType.GPU:
          return 8;
        case TimelineModel.TimelineModel.TrackType.Other:
          return 9;
      }
    };

    const tracks = this._model.tracks().slice();
    tracks.stableSort((a, b) => weight(a) - weight(b));
    let rasterCount = 0;
    for (const track of tracks) {
      switch (track.type) {
        case TimelineModel.TimelineModel.TrackType.Input:
          this._appendAsyncEventsGroup(
              track, ls`Input`, track.asyncEvents, this._interactionsHeaderLevel2, eventEntryType,
              false /* selectable */);
          break;
        case TimelineModel.TimelineModel.TrackType.Animation:
          this._appendAsyncEventsGroup(
              track, ls`Animation`, track.asyncEvents, this._interactionsHeaderLevel2, eventEntryType,
              false /* selectable */);
          break;
        case TimelineModel.TimelineModel.TrackType.Timings:
          const group = this._appendHeader(ls`Timings`, this._timingsHeader, true /* selectable */);
          group._track = track;
          this._appendPageMetrics();
          this._appendAsyncEventsGroup(
              track, null, track.asyncEvents, this._timingsHeader, eventEntryType, true /* selectable */);
          break;
        case TimelineModel.TimelineModel.TrackType.Console:
          this._appendAsyncEventsGroup(
              track, ls`Console`, track.asyncEvents, this._headerLevel1, eventEntryType, true /* selectable */);
          break;
        case TimelineModel.TimelineModel.TrackType.MainThread:
          if (track.forMainFrame) {
            const group = this._appendSyncEvents(
                track, track.events, track.url ? ls`Main \u2014 ${track.url}` : ls`Main`, this._headerLevel1,
                eventEntryType, true /* selectable */);
            if (group)
              this._timelineData.selectedGroup = group;
          } else {
            this._appendSyncEvents(
                track, track.events, track.url ? ls`Frame \u2014 ${track.url}` : ls`Subframe`, this._headerLevel1,
                eventEntryType, true /* selectable */);
          }
          break;
        case TimelineModel.TimelineModel.TrackType.Worker:
          this._appendSyncEvents(
              track, track.events, track.url ? ls`Worker \u2014 ${track.url}` : ls`Dedicated Worker`,
              this._headerLevel1, eventEntryType, true /* selectable */);
          break;
        case TimelineModel.TimelineModel.TrackType.Raster:
          if (!rasterCount)
            this._appendHeader(ls`Raster`, this._headerLevel1, false /* selectable */);
          ++rasterCount;
          this._appendSyncEvents(
              track, track.events, ls`Rasterizer Thread ${rasterCount}`, this._headerLevel2, eventEntryType,
              true /* selectable */);
          break;
        case TimelineModel.TimelineModel.TrackType.GPU:
          this._appendSyncEvents(
              track, track.events, ls`GPU`, this._headerLevel1, eventEntryType, true /* selectable */);
          break;
        case TimelineModel.TimelineModel.TrackType.Other:
          this._appendSyncEvents(
              track, track.events, track.name || ls`Thread`, this._headerLevel1, eventEntryType, true /* selectable */);
          this._appendAsyncEventsGroup(
              track, track.name, track.asyncEvents, this._headerLevel1, eventEntryType, true /* selectable */);
          break;
      }
    }
    if (this._timelineData.selectedGroup)
      this._timelineData.selectedGroup.expanded = true;

    for (let extensionIndex = 0; extensionIndex < this._extensionInfo.length; extensionIndex++)
      this._innerAppendExtensionEvents(extensionIndex);

    this._markers.sort((a, b) => a.startTime() - b.startTime());
    this._timelineData.markers = this._markers;
    this._flowEventIndexById.clear();
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
   * @param {!TimelineModel.TimelineModelFilter} filter
   * @return {!Array<number>}
   */
  search(startTime, endTime, filter) {
    const result = [];
    const entryTypes = Timeline.TimelineFlameChartDataProvider.EntryType;
    this.timelineData();
    for (let i = 0; i < this._entryData.length; ++i) {
      if (this._entryType(i) !== entryTypes.Event)
        continue;
      const event = /** @type {!SDK.TracingModel.Event} */ (this._entryData[i]);
      if (event.startTime > endTime)
        continue;
      if ((event.endTime || event.startTime) < startTime)
        continue;
      if (filter.accept(event))
        result.push(i);
    }
    result.sort(
        (a, b) => SDK.TracingModel.Event.compareStartTime(
            /** @type {!SDK.TracingModel.Event} */ (this._entryData[a]),
            /** @type {!SDK.TracingModel.Event} */ (this._entryData[b])));
    return result;
  }

  /**
   * @param {?TimelineModel.TimelineModel.Track} track
   * @param {!Array<!SDK.TracingModel.Event>} events
   * @param {string} title
   * @param {!PerfUI.FlameChart.GroupStyle} style
   * @param {!Timeline.TimelineFlameChartDataProvider.EntryType} entryType
   * @param {boolean} selectable
   * @return {?PerfUI.FlameChart.Group}
   */
  _appendSyncEvents(track, events, title, style, entryType, selectable) {
    if (!events.length)
      return null;
    const isExtension = entryType === Timeline.TimelineFlameChartDataProvider.EntryType.ExtensionEvent;
    const openEvents = [];
    const flowEventsEnabled = Runtime.experiments.isEnabled('timelineFlowEvents');
    const blackboxingEnabled = !isExtension && Runtime.experiments.isEnabled('blackboxJSFramesOnTimeline');
    let maxStackDepth = 0;
    let group = null;
    if (track && track.type === TimelineModel.TimelineModel.TrackType.MainThread) {
      group = this._appendHeader(title, style, selectable);
      group._track = track;
    }
    for (let i = 0; i < events.length; ++i) {
      const e = events[i];
      if (!isExtension && this._performanceModel.timelineModel().isMarkerEvent(e)) {
        this._markers.push(new Timeline.TimelineFlameChartMarker(
            e.startTime, e.startTime - this._model.minimumRecordTime(),
            Timeline.TimelineUIUtils.markerStyleForEvent(e)));
      }
      if (!SDK.TracingModel.isFlowPhase(e.phase)) {
        if (!e.endTime && e.phase !== SDK.TracingModel.Phase.Instant)
          continue;
        if (SDK.TracingModel.isAsyncPhase(e.phase))
          continue;
        if (!isExtension && !this._performanceModel.isVisible(e))
          continue;
      }
      while (openEvents.length && openEvents.peekLast().endTime <= e.startTime)
        openEvents.pop();
      e._blackboxRoot = false;
      if (blackboxingEnabled && this._isBlackboxedEvent(e)) {
        const parent = openEvents.peekLast();
        if (parent && parent._blackboxRoot)
          continue;
        e._blackboxRoot = true;
      }
      if (!group) {
        group = this._appendHeader(title, style, selectable);
        if (selectable)
          group._track = track;
      }

      const level = this._currentLevel + openEvents.length;
      if (flowEventsEnabled)
        this._appendFlowEvent(e, level);
      const index = this._appendEvent(e, level);
      if (openEvents.length)
        this._entryParent[index] = openEvents.peekLast();
      if (!isExtension && this._performanceModel.timelineModel().isMarkerEvent(e))
        this._timelineData.entryTotalTimes[this._entryData.length] = undefined;

      maxStackDepth = Math.max(maxStackDepth, openEvents.length + 1);
      if (e.endTime)
        openEvents.push(e);
    }
    this._entryTypeByLevel.length = this._currentLevel + maxStackDepth;
    this._entryTypeByLevel.fill(entryType, this._currentLevel);
    this._currentLevel += maxStackDepth;
    return group;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {boolean}
   */
  _isBlackboxedEvent(event) {
    if (event.name !== TimelineModel.TimelineModel.RecordType.JSFrame)
      return false;
    const url = event.args['data']['url'];
    return url && this._isBlackboxedURL(url);
  }

  /**
   * @param {string} url
   * @return {boolean}
   */
  _isBlackboxedURL(url) {
    return Bindings.blackboxManager.isBlackboxedURL(url);
  }

  /**
   * @param {?TimelineModel.TimelineModel.Track} track
   * @param {?string} header
   * @param {!Array<!SDK.TracingModel.AsyncEvent>} events
   * @param {!PerfUI.FlameChart.GroupStyle} style
   * @param {!Timeline.TimelineFlameChartDataProvider.EntryType} entryType
   * @param {boolean} selectable
   * @return {?PerfUI.FlameChart.Group}
   */
  _appendAsyncEventsGroup(track, header, events, style, entryType, selectable) {
    if (!events.length)
      return null;
    const lastUsedTimeByLevel = [];
    let group = null;
    for (let i = 0; i < events.length; ++i) {
      const asyncEvent = events[i];
      if (!this._performanceModel.isVisible(asyncEvent))
        continue;
      if (!group && header) {
        group = this._appendHeader(header, style, selectable);
        if (selectable)
          group._track = track;
      }
      const startTime = asyncEvent.startTime;
      let level;
      for (level = 0; level < lastUsedTimeByLevel.length && lastUsedTimeByLevel[level] > startTime; ++level) {
      }
      this._appendAsyncEvent(asyncEvent, this._currentLevel + level);
      lastUsedTimeByLevel[level] = asyncEvent.endTime;
    }
    this._entryTypeByLevel.length = this._currentLevel + lastUsedTimeByLevel.length;
    this._entryTypeByLevel.fill(entryType, this._currentLevel);
    this._currentLevel += lastUsedTimeByLevel.length;
    return group;
  }

  _appendInteractionRecords() {
    const interactionRecords = this._performanceModel.interactionRecords();
    if (!interactionRecords.length)
      return;
    this._appendHeader(ls`Interactions`, this._interactionsHeaderLevel1, false /* selectable */);
    for (const segment of interactionRecords) {
      const index = this._entryData.length;
      this._entryData.push(/** @type {!TimelineModel.TimelineIRModel.Phases} */ (segment.data));
      this._entryIndexToTitle[index] = /** @type {string} */ (segment.data);
      this._timelineData.entryLevels[index] = this._currentLevel;
      this._timelineData.entryTotalTimes[index] = segment.end - segment.begin;
      this._timelineData.entryStartTimes[index] = segment.begin;
    }
    this._entryTypeByLevel[this._currentLevel++] = Timeline.TimelineFlameChartDataProvider.EntryType.InteractionRecord;
  }

  _appendPageMetrics() {
    this._entryTypeByLevel[this._currentLevel] = Timeline.TimelineFlameChartDataProvider.EntryType.Event;

    /** @type {!Array<!SDK.TracingModel.Event>} */
    const metricEvents = [];
    for (const track of this._model.tracks()) {
      for (const event of track.events) {
        if (!this._performanceModel.timelineModel().isMarkerEvent(event))
          continue;
        metricEvents.push(event);
      }
    }

    metricEvents.stableSort(SDK.TracingModel.Event.compareStartTime);
    const totalTimes = this._timelineData.entryTotalTimes;
    for (const event of metricEvents) {
      this._appendEvent(event, this._currentLevel);
      totalTimes[totalTimes.length - 1] = Number.NaN;
    }

    ++this._currentLevel;
  }

  _appendFrames() {
    const screenshots = this._performanceModel.filmStripModel().frames();
    const hasFilmStrip = !!screenshots.length;
    this._framesHeader.collapsible = hasFilmStrip;
    this._appendHeader(Common.UIString('Frames'), this._framesHeader, false /* selectable */);
    this._frameGroup = this._timelineData.groups.peekLast();
    const style = Timeline.TimelineUIUtils.markerStyleForFrame();

    this._entryTypeByLevel[this._currentLevel] = Timeline.TimelineFlameChartDataProvider.EntryType.Frame;
    for (const frame of this._performanceModel.frames()) {
      this._markers.push(new Timeline.TimelineFlameChartMarker(
          frame.startTime, frame.startTime - this._model.minimumRecordTime(), style));
      this._appendFrame(frame);
    }
    ++this._currentLevel;

    if (!hasFilmStrip)
      return;
    this._appendHeader('', this._screenshotsHeader, false /* selectable */);
    this._entryTypeByLevel[this._currentLevel] = Timeline.TimelineFlameChartDataProvider.EntryType.Screenshot;
    let prevTimestamp;
    for (const screenshot of screenshots) {
      this._entryData.push(screenshot);
      this._timelineData.entryLevels.push(this._currentLevel);
      this._timelineData.entryStartTimes.push(screenshot.timestamp);
      if (prevTimestamp)
        this._timelineData.entryTotalTimes.push(screenshot.timestamp - prevTimestamp);
      prevTimestamp = screenshot.timestamp;
    }
    if (screenshots.length)
      this._timelineData.entryTotalTimes.push(this._model.maximumRecordTime() - prevTimestamp);
    ++this._currentLevel;
  }

  /**
   * @param {number} entryIndex
   * @return {!Timeline.TimelineFlameChartDataProvider.EntryType}
   */
  _entryType(entryIndex) {
    return this._entryTypeByLevel[this._timelineData.entryLevels[entryIndex]];
  }

  /**
   * @override
   * @param {number} entryIndex
   * @return {?Element}
   */
  prepareHighlightedEntryInfo(entryIndex) {
    let time = '';
    let title;
    let warning;
    const type = this._entryType(entryIndex);
    if (type === Timeline.TimelineFlameChartDataProvider.EntryType.Event) {
      const event = /** @type {!SDK.TracingModel.Event} */ (this._entryData[entryIndex]);
      const totalTime = event.duration;
      const selfTime = event.selfTime;
      const /** @const */ eps = 1e-6;
      if (typeof totalTime === 'number') {
        time = Math.abs(totalTime - selfTime) > eps && selfTime > eps ?
            Common.UIString(
                '%s (self %s)', Number.millisToString(totalTime, true), Number.millisToString(selfTime, true)) :
            Number.millisToString(totalTime, true);
      }
      if (this._performanceModel.timelineModel().isMarkerEvent(event))
        title = Timeline.TimelineUIUtils.eventTitle(event);
      else
        title = this.entryTitle(entryIndex);
      warning = Timeline.TimelineUIUtils.eventWarning(event);
    } else if (type === Timeline.TimelineFlameChartDataProvider.EntryType.Frame) {
      const frame = /** @type {!TimelineModel.TimelineFrame} */ (this._entryData[entryIndex]);
      time = Common.UIString(
          '%s ~ %.0f\xa0fps', Number.preciseMillisToString(frame.duration, 1), (1000 / frame.duration));
      title = frame.idle ? Common.UIString('Idle Frame') : Common.UIString('Frame');
      if (frame.hasWarnings()) {
        warning = createElement('span');
        warning.textContent = Common.UIString('Long frame');
      }
    } else {
      return null;
    }
    const element = createElement('div');
    const root = UI.createShadowRootWithCoreStyles(element, 'timeline/timelineFlamechartPopover.css');
    const contents = root.createChild('div', 'timeline-flamechart-popover');
    contents.createChild('span', 'timeline-info-time').textContent = time;
    contents.createChild('span', 'timeline-info-title').textContent = title;
    if (warning) {
      warning.classList.add('timeline-info-warning');
      contents.appendChild(warning);
    }
    return element;
  }

  /**
   * @override
   * @param {number} entryIndex
   * @return {string}
   */
  entryColor(entryIndex) {
    // This is not annotated due to closure compiler failure to properly infer cache container's template type.
    function patchColorAndCache(cache, key, lookupColor) {
      let color = cache.get(key);
      if (color)
        return color;
      const parsedColor = Common.Color.parse(lookupColor(key));
      color = parsedColor.setAlpha(0.7).asString(Common.Color.Format.RGBA) || '';
      cache.set(key, color);
      return color;
    }

    const entryTypes = Timeline.TimelineFlameChartDataProvider.EntryType;
    const type = this._entryType(entryIndex);
    if (type === entryTypes.Event) {
      const event = /** @type {!SDK.TracingModel.Event} */ (this._entryData[entryIndex]);
      if (this._model.isGenericTrace())
        return this._genericTraceEventColor(event);
      if (this._performanceModel.timelineModel().isMarkerEvent(event))
        return Timeline.TimelineUIUtils.markerStyleForEvent(event).color;
      if (!SDK.TracingModel.isAsyncPhase(event.phase))
        return this._colorForEvent(event);
      if (event.hasCategory(TimelineModel.TimelineModel.Category.Console) ||
          event.hasCategory(TimelineModel.TimelineModel.Category.UserTiming))
        return this._consoleColorGenerator.colorForID(event.name);
      if (event.hasCategory(TimelineModel.TimelineModel.Category.LatencyInfo)) {
        const phase =
            TimelineModel.TimelineIRModel.phaseForEvent(event) || TimelineModel.TimelineIRModel.Phases.Uncategorized;
        return patchColorAndCache(
            this._asyncColorByInteractionPhase, phase, Timeline.TimelineUIUtils.interactionPhaseColor);
      }
      const category = Timeline.TimelineUIUtils.eventStyle(event).category;
      return patchColorAndCache(this._asyncColorByCategory, category, () => category.color);
    }
    if (type === entryTypes.Frame)
      return 'white';
    if (type === entryTypes.InteractionRecord)
      return 'transparent';
    if (type === entryTypes.ExtensionEvent) {
      const event = /** @type {!SDK.TracingModel.Event} */ (this._entryData[entryIndex]);
      return this._extensionColorGenerator.colorForID(event.name);
    }
    return '';
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {string}
   */
  _genericTraceEventColor(event) {
    const key = event.categoriesString || event.name;
    return key ? `hsl(${String.hashCode(key) % 300 + 30}, 40%, 70%)` : '#ccc';
  }

  /**
   * @param {number} entryIndex
   * @param {!CanvasRenderingContext2D} context
   * @param {?string} text
   * @param {number} barX
   * @param {number} barY
   * @param {number} barWidth
   * @param {number} barHeight
   */
  _drawFrame(entryIndex, context, text, barX, barY, barWidth, barHeight) {
    const /** @const */ hPadding = 1;
    const frame = /** @type {!TimelineModel.TimelineFrame} */ (this._entryData[entryIndex]);
    barX += hPadding;
    barWidth -= 2 * hPadding;
    context.fillStyle = frame.idle ? 'white' : (frame.hasWarnings() ? '#fad1d1' : '#d7f0d1');
    context.fillRect(barX, barY, barWidth, barHeight);

    const frameDurationText = Number.preciseMillisToString(frame.duration, 1);
    const textWidth = context.measureText(frameDurationText).width;
    if (textWidth <= barWidth) {
      context.fillStyle = this.textColor(entryIndex);
      context.fillText(frameDurationText, barX + (barWidth - textWidth) / 2, barY + barHeight - 4);
    }
  }

  /**
   * @param {number} entryIndex
   * @param {!CanvasRenderingContext2D} context
   * @param {number} barX
   * @param {number} barY
   * @param {number} barWidth
   * @param {number} barHeight
   */
  async _drawScreenshot(entryIndex, context, barX, barY, barWidth, barHeight) {
    const screenshot = /** @type {!SDK.FilmStripModel.Frame} */ (this._entryData[entryIndex]);
    if (!this._screenshotImageCache.has(screenshot)) {
      this._screenshotImageCache.set(screenshot, null);
      const data = await screenshot.imageDataPromise();
      const image = await UI.loadImageFromData(data);
      this._screenshotImageCache.set(screenshot, image);
      this.dispatchEventToListeners(Timeline.TimelineFlameChartDataProvider.Events.DataChanged);
      return;
    }

    const image = this._screenshotImageCache.get(screenshot);
    if (!image)
      return;
    const imageX = barX + 1;
    const imageY = barY + 1;
    const imageHeight = barHeight - 2;
    const scale = imageHeight / image.naturalHeight;
    const imageWidth = Math.floor(image.naturalWidth * scale);
    context.save();
    context.beginPath();
    context.rect(barX, barY, barWidth, barHeight);
    context.clip();
    context.drawImage(image, imageX, imageY, imageWidth, imageHeight);
    context.strokeStyle = '#ccc';
    context.strokeRect(imageX - 0.5, imageY - 0.5, Math.min(barWidth - 1, imageWidth + 1), imageHeight);
    context.restore();
  }

  /**
   * @override
   * @param {number} entryIndex
   * @param {!CanvasRenderingContext2D} context
   * @param {?string} text
   * @param {number} barX
   * @param {number} barY
   * @param {number} barWidth
   * @param {number} barHeight
   * @param {number} unclippedBarX
   * @param {number} timeToPixels
   * @return {boolean}
   */
  decorateEntry(entryIndex, context, text, barX, barY, barWidth, barHeight, unclippedBarX, timeToPixels) {
    const data = this._entryData[entryIndex];
    const type = this._entryType(entryIndex);
    const entryTypes = Timeline.TimelineFlameChartDataProvider.EntryType;

    if (type === entryTypes.Frame) {
      this._drawFrame(entryIndex, context, text, barX, barY, barWidth, barHeight);
      return true;
    }

    if (type === entryTypes.Screenshot) {
      this._drawScreenshot(entryIndex, context, barX, barY, barWidth, barHeight);
      return true;
    }

    if (type === entryTypes.InteractionRecord) {
      const color = Timeline.TimelineUIUtils.interactionPhaseColor(
          /** @type {!TimelineModel.TimelineIRModel.Phases} */ (data));
      context.fillStyle = color;
      context.fillRect(barX, barY, barWidth - 1, 2);
      context.fillRect(barX, barY - 3, 2, 3);
      context.fillRect(barX + barWidth - 3, barY - 3, 2, 3);
      return false;
    }

    if (type === entryTypes.Event) {
      const event = /** @type {!SDK.TracingModel.Event} */ (data);
      if (event.hasCategory(TimelineModel.TimelineModel.Category.LatencyInfo)) {
        const timeWaitingForMainThread = TimelineModel.TimelineData.forEvent(event).timeWaitingForMainThread;
        if (timeWaitingForMainThread) {
          context.fillStyle = 'hsla(0, 70%, 60%, 1)';
          const width = Math.floor(unclippedBarX - barX + timeWaitingForMainThread * timeToPixels);
          context.fillRect(barX, barY + barHeight - 3, width, 2);
        }
      }
      if (TimelineModel.TimelineData.forEvent(event).warning)
        paintWarningDecoration(barX, barWidth - 1.5);
    }

    /**
     * @param {number} x
     * @param {number} width
     */
    function paintWarningDecoration(x, width) {
      const /** @const */ triangleSize = 8;
      context.save();
      context.beginPath();
      context.rect(x, barY, width, barHeight);
      context.clip();
      context.beginPath();
      context.fillStyle = 'red';
      context.moveTo(x + width - triangleSize, barY);
      context.lineTo(x + width, barY);
      context.lineTo(x + width, barY + triangleSize);
      context.fill();
      context.restore();
    }

    return false;
  }

  /**
   * @override
   * @param {number} entryIndex
   * @return {boolean}
   */
  forceDecoration(entryIndex) {
    const entryTypes = Timeline.TimelineFlameChartDataProvider.EntryType;
    const type = this._entryType(entryIndex);
    if (type === entryTypes.Frame)
      return true;
    if (type === entryTypes.Screenshot)
      return true;

    if (type === entryTypes.Event) {
      const event = /** @type {!SDK.TracingModel.Event} */ (this._entryData[entryIndex]);
      return !!TimelineModel.TimelineData.forEvent(event).warning;
    }
    return false;
  }

  /**
   * @param {!{title: string, model: !SDK.TracingModel}} entry
   */
  appendExtensionEvents(entry) {
    this._extensionInfo.push(entry);
    if (this._timelineData)
      this._innerAppendExtensionEvents(this._extensionInfo.length - 1);
  }

  /**
   * @param {number} index
   */
  _innerAppendExtensionEvents(index) {
    const entry = this._extensionInfo[index];
    const entryType = Timeline.TimelineFlameChartDataProvider.EntryType.ExtensionEvent;
    const allThreads = [].concat(...entry.model.sortedProcesses().map(process => process.sortedThreads()));
    if (!allThreads.length)
      return;

    const singleTrack =
        allThreads.length === 1 && (!allThreads[0].events().length || !allThreads[0].asyncEvents().length);
    if (!singleTrack)
      this._appendHeader(entry.title, this._headerLevel1, false /* selectable */);
    const style = singleTrack ? this._headerLevel2 : this._headerLevel1;
    let threadIndex = 0;
    for (const thread of allThreads) {
      const title = singleTrack ? entry.title : thread.name() || ls`Thread ${++threadIndex}`;
      this._appendAsyncEventsGroup(null, title, thread.asyncEvents(), style, entryType, false /* selectable */);
      this._appendSyncEvents(null, thread.events(), title, style, entryType, false /* selectable */);
    }
  }

  /**
   * @param {string} title
   * @param {!PerfUI.FlameChart.GroupStyle} style
   * @param {boolean} selectable
   * @return {!PerfUI.FlameChart.Group}
   */
  _appendHeader(title, style, selectable) {
    const group = {startLevel: this._currentLevel, name: title, style: style, selectable: selectable};
    this._timelineData.groups.push(group);
    return group;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {number} level
   * @return {number}
   */
  _appendEvent(event, level) {
    const index = this._entryData.length;
    this._entryData.push(event);
    this._timelineData.entryLevels[index] = level;
    this._timelineData.entryTotalTimes[index] =
        event.duration || Timeline.TimelineFlameChartDataProvider.InstantEventVisibleDurationMs;
    this._timelineData.entryStartTimes[index] = event.startTime;
    event[Timeline.TimelineFlameChartDataProvider._indexSymbol] = index;
    return index;
  }

  /**
   * @param {!SDK.TracingModel.AsyncEvent} asyncEvent
   * @param {number} level
   */
  _appendAsyncEvent(asyncEvent, level) {
    if (SDK.TracingModel.isNestableAsyncPhase(asyncEvent.phase)) {
      // FIXME: also add steps once we support event nesting in the FlameChart.
      this._appendEvent(asyncEvent, level);
      return;
    }
    const steps = asyncEvent.steps;
    // If we have past steps, put the end event for each range rather than start one.
    const eventOffset = steps.length > 1 && steps[1].phase === SDK.TracingModel.Phase.AsyncStepPast ? 1 : 0;
    for (let i = 0; i < steps.length - 1; ++i) {
      const index = this._entryData.length;
      this._entryData.push(steps[i + eventOffset]);
      const startTime = steps[i].startTime;
      this._timelineData.entryLevels[index] = level;
      this._timelineData.entryTotalTimes[index] = steps[i + 1].startTime - startTime;
      this._timelineData.entryStartTimes[index] = startTime;
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {number} level
   */
  _appendFlowEvent(event, level) {
    const timelineData = this._timelineData;
    /**
     * @param {!SDK.TracingModel.Event} event
     * @return {number}
     */
    function pushStartFlow(event) {
      const flowIndex = timelineData.flowStartTimes.length;
      timelineData.flowStartTimes.push(event.startTime);
      timelineData.flowStartLevels.push(level);
      return flowIndex;
    }

    /**
     * @param {!SDK.TracingModel.Event} event
     * @param {number} flowIndex
     */
    function pushEndFlow(event, flowIndex) {
      timelineData.flowEndTimes[flowIndex] = event.startTime;
      timelineData.flowEndLevels[flowIndex] = level;
    }

    switch (event.phase) {
      case SDK.TracingModel.Phase.FlowBegin:
        this._flowEventIndexById.set(event.id, pushStartFlow(event));
        break;
      case SDK.TracingModel.Phase.FlowStep:
        pushEndFlow(event, this._flowEventIndexById.get(event.id));
        this._flowEventIndexById.set(event.id, pushStartFlow(event));
        break;
      case SDK.TracingModel.Phase.FlowEnd:
        pushEndFlow(event, this._flowEventIndexById.get(event.id));
        this._flowEventIndexById.delete(event.id);
        break;
    }
  }

  /**
   * @param {!TimelineModel.TimelineFrame} frame
   */
  _appendFrame(frame) {
    const index = this._entryData.length;
    this._entryData.push(frame);
    this._entryIndexToTitle[index] = Number.millisToString(frame.duration, true);
    this._timelineData.entryLevels[index] = this._currentLevel;
    this._timelineData.entryTotalTimes[index] = frame.duration;
    this._timelineData.entryStartTimes[index] = frame.startTime;
  }

  /**
   * @param {number} entryIndex
   * @return {?Timeline.TimelineSelection}
   */
  createSelection(entryIndex) {
    const type = this._entryType(entryIndex);
    let timelineSelection = null;
    if (type === Timeline.TimelineFlameChartDataProvider.EntryType.Event) {
      timelineSelection = Timeline.TimelineSelection.fromTraceEvent(
          /** @type {!SDK.TracingModel.Event} */ (this._entryData[entryIndex]));
    } else if (type === Timeline.TimelineFlameChartDataProvider.EntryType.Frame) {
      timelineSelection = Timeline.TimelineSelection.fromFrame(
          /** @type {!TimelineModel.TimelineFrame} */ (this._entryData[entryIndex]));
    }
    if (timelineSelection)
      this._lastSelection = new Timeline.TimelineFlameChartView.Selection(timelineSelection, entryIndex);
    return timelineSelection;
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

  /**
   * @param {?Timeline.TimelineSelection} selection
   * @return {number}
   */
  entryIndexForSelection(selection) {
    if (!selection || selection.type() === Timeline.TimelineSelection.Type.Range)
      return -1;

    if (this._lastSelection && this._lastSelection.timelineSelection.object() === selection.object())
      return this._lastSelection.entryIndex;
    const index = this._entryData.indexOf(
        /** @type {!SDK.TracingModel.Event|!TimelineModel.TimelineFrame|!TimelineModel.TimelineIRModel.Phases} */
        (selection.object()));
    if (index !== -1)
      this._lastSelection = new Timeline.TimelineFlameChartView.Selection(selection, index);
    return index;
  }

  /**
   * @param {number} entryIndex
   * @return {boolean}
   */
  buildFlowForInitiator(entryIndex) {
    if (this._lastInitiatorEntry === entryIndex)
      return false;
    this._lastInitiatorEntry = entryIndex;
    let event = this.eventByIndex(entryIndex);
    const td = this._timelineData;
    td.flowStartTimes = [];
    td.flowStartLevels = [];
    td.flowEndTimes = [];
    td.flowEndLevels = [];
    while (event) {
      // Find the closest ancestor with an initiator.
      let initiator;
      for (; event; event = this._eventParent(event)) {
        initiator = TimelineModel.TimelineData.forEvent(event).initiator();
        if (initiator)
          break;
      }
      if (!initiator)
        break;
      const eventIndex = event[Timeline.TimelineFlameChartDataProvider._indexSymbol];
      const initiatorIndex = initiator[Timeline.TimelineFlameChartDataProvider._indexSymbol];
      td.flowStartTimes.push(initiator.endTime || initiator.startTime);
      td.flowStartLevels.push(td.entryLevels[initiatorIndex]);
      td.flowEndTimes.push(event.startTime);
      td.flowEndLevels.push(td.entryLevels[eventIndex]);
      event = initiator;
    }
    return true;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {?SDK.TracingModel.Event}
   */
  _eventParent(event) {
    return this._entryParent[event[Timeline.TimelineFlameChartDataProvider._indexSymbol]] || null;
  }

  /**
   * @param {number} entryIndex
   * @return {?SDK.TracingModel.Event}
   */
  eventByIndex(entryIndex) {
    return entryIndex >= 0 && this._entryType(entryIndex) === Timeline.TimelineFlameChartDataProvider.EntryType.Event ?
        /** @type {!SDK.TracingModel.Event} */ (this._entryData[entryIndex]) :
        null;
  }

  /**
   * @param {function(!SDK.TracingModel.Event):string} colorForEvent
   */
  setEventColorMapping(colorForEvent) {
    this._colorForEvent = colorForEvent;
  }
};

Timeline.TimelineFlameChartDataProvider.InstantEventVisibleDurationMs = 0.001;
Timeline.TimelineFlameChartDataProvider._indexSymbol = Symbol('index');

/** @enum {symbol} */
Timeline.TimelineFlameChartDataProvider.Events = {
  DataChanged: Symbol('DataChanged')
};

/** @enum {symbol} */
Timeline.TimelineFlameChartDataProvider.EntryType = {
  Frame: Symbol('Frame'),
  Event: Symbol('Event'),
  InteractionRecord: Symbol('InteractionRecord'),
  ExtensionEvent: Symbol('ExtensionEvent'),
  Screenshot: Symbol('Screenshot'),
};
