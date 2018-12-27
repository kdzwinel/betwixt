/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
TimelineModel.TimelineModel = class {
  constructor() {
    this._reset();
  }

  /**
   * @param {!Array<!SDK.TracingModel.Event>} events
   * @param {function(!SDK.TracingModel.Event)} onStartEvent
   * @param {function(!SDK.TracingModel.Event)} onEndEvent
   * @param {function(!SDK.TracingModel.Event,?SDK.TracingModel.Event)|undefined=} onInstantEvent
   * @param {number=} startTime
   * @param {number=} endTime
   * @param {function(!SDK.TracingModel.Event):boolean=} filter
   */
  static forEachEvent(events, onStartEvent, onEndEvent, onInstantEvent, startTime, endTime, filter) {
    startTime = startTime || 0;
    endTime = endTime || Infinity;
    const stack = [];
    const startEvent = TimelineModel.TimelineModel._topLevelEventEndingAfter(events, startTime);
    for (let i = startEvent; i < events.length; ++i) {
      const e = events[i];
      if ((e.endTime || e.startTime) < startTime)
        continue;
      if (e.startTime >= endTime)
        break;
      if (SDK.TracingModel.isAsyncPhase(e.phase) || SDK.TracingModel.isFlowPhase(e.phase))
        continue;
      while (stack.length && stack.peekLast().endTime <= e.startTime)
        onEndEvent(stack.pop());
      if (filter && !filter(e))
        continue;
      if (e.duration) {
        onStartEvent(e);
        stack.push(e);
      } else {
        onInstantEvent && onInstantEvent(e, stack.peekLast() || null);
      }
    }
    while (stack.length)
      onEndEvent(stack.pop());
  }

  /**
   * @param {!Array<!SDK.TracingModel.Event>} events
   * @param {number} time
   */
  static _topLevelEventEndingAfter(events, time) {
    let index = events.upperBound(time, (time, event) => time - event.startTime) - 1;
    while (index > 0 && !SDK.TracingModel.isTopLevelEvent(events[index]))
      index--;
    return Math.max(index, 0);
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {boolean}
   */
  isMarkerEvent(event) {
    const recordTypes = TimelineModel.TimelineModel.RecordType;
    switch (event.name) {
      case recordTypes.TimeStamp:
        return true;
      case recordTypes.MarkFirstPaint:
      case recordTypes.MarkFCP:
      case recordTypes.MarkFMP:
        // TODO(alph): There are duplicate FMP events coming from the backend. Keep the one having 'data' property.
        return this._mainFrame && event.args.frame === this._mainFrame.frameId && !!event.args.data;
      case recordTypes.MarkDOMContent:
      case recordTypes.MarkLoad:
        return !!event.args['data']['isMainFrame'];
      default:
        return false;
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {string} field
   * @return {string}
   */
  static globalEventId(event, field) {
    const data = event.args['data'] || event.args['beginData'];
    const id = data && data[field];
    if (!id)
      return '';
    return `${event.thread.process().id()}.${id}`;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {string}
   */
  static eventFrameId(event) {
    const data = event.args['data'] || event.args['beginData'];
    return data && data['frame'] || '';
  }

  /**
   * @return {!Array<!SDK.CPUProfileDataModel>}
   */
  cpuProfiles() {
    return this._cpuProfiles;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {?SDK.Target}
   */
  targetByEvent(event) {
    // FIXME: Consider returning null for loaded traces.
    const workerId = this._workerIdByThread.get(event.thread);
    const mainTarget = SDK.targetManager.mainTarget();
    return workerId ? SDK.targetManager.targetById(workerId) : mainTarget;
  }

  /**
   * @param {!SDK.TracingModel} tracingModel
   */
  setEvents(tracingModel) {
    this._reset();
    this._resetProcessingState();
    this._tracingModel = tracingModel;

    this._minimumRecordTime = tracingModel.minimumRecordTime();
    this._maximumRecordTime = tracingModel.maximumRecordTime();

    this._processSyncBrowserEvents(tracingModel);
    if (this._browserFrameTracking) {
      this._processThreadsForBrowserFrames(tracingModel);
    } else {
      // The next line is for loading legacy traces recorded before M67.
      // TODO(alph): Drop the support at some point.
      const metadataEvents = this._processMetadataEvents(tracingModel);
      this._isGenericTrace = !metadataEvents;
      if (metadataEvents)
        this._processMetadataAndThreads(tracingModel, metadataEvents);
      else
        this._processGenericTrace(tracingModel);
    }
    this._inspectedTargetEvents.stableSort(SDK.TracingModel.Event.compareStartTime);
    this._processAsyncBrowserEvents(tracingModel);
    this._buildGPUEvents(tracingModel);
    this._resetProcessingState();
  }

  /**
   * @param {!SDK.TracingModel} tracingModel
   */
  _processGenericTrace(tracingModel) {
    let browserMainThread = SDK.TracingModel.browserMainThread(tracingModel);
    if (!browserMainThread && tracingModel.sortedProcesses().length)
      browserMainThread = tracingModel.sortedProcesses()[0].sortedThreads()[0];
    for (const process of tracingModel.sortedProcesses()) {
      for (const thread of process.sortedThreads()) {
        this._processThreadEvents(
            tracingModel, [{from: 0, to: Infinity}], thread, thread === browserMainThread, false, true, null);
      }
    }
  }

  /**
   * @param {!SDK.TracingModel} tracingModel
   * @param {!TimelineModel.TimelineModel.MetadataEvents} metadataEvents
   */
  _processMetadataAndThreads(tracingModel, metadataEvents) {
    let startTime = 0;
    for (let i = 0, length = metadataEvents.page.length; i < length; i++) {
      const metaEvent = metadataEvents.page[i];
      const process = metaEvent.thread.process();
      const endTime = i + 1 < length ? metadataEvents.page[i + 1].startTime : Infinity;
      if (startTime === endTime)
        continue;
      this._legacyCurrentPage = metaEvent.args['data'] && metaEvent.args['data']['page'];
      for (const thread of process.sortedThreads()) {
        let workerUrl = null;
        if (thread.name() === TimelineModel.TimelineModel.WorkerThreadName ||
            thread.name() === TimelineModel.TimelineModel.WorkerThreadNameLegacy) {
          const workerMetaEvent = metadataEvents.workers.find(e => {
            if (e.args['data']['workerThreadId'] !== thread.id())
              return false;
            // This is to support old traces.
            if (e.args['data']['sessionId'] === this._sessionId)
              return true;
            return !!this._pageFrames.get(TimelineModel.TimelineModel.eventFrameId(e));
          });
          if (!workerMetaEvent)
            continue;
          const workerId = workerMetaEvent.args['data']['workerId'];
          if (workerId)
            this._workerIdByThread.set(thread, workerId);
          workerUrl = workerMetaEvent.args['data']['url'] || '';
        }
        this._processThreadEvents(
            tracingModel, [{from: startTime, to: endTime}], thread, thread === metaEvent.thread, !!workerUrl, true,
            workerUrl);
      }
      startTime = endTime;
    }
  }

  /**
   * @param {!SDK.TracingModel} tracingModel
   */
  _processThreadsForBrowserFrames(tracingModel) {
    const processData = new Map();
    for (const frame of this._pageFrames.values()) {
      for (let i = 0; i < frame.processes.length; i++) {
        const pid = frame.processes[i].processId;
        let data = processData.get(pid);
        if (!data) {
          data = [];
          processData.set(pid, data);
        }
        const to = i === frame.processes.length - 1 ? (frame.deletedTime || this._maximumRecordTime) :
                                                      frame.processes[i + 1].time;
        data.push({from: frame.processes[i].time, to: to, main: !frame.parent, url: frame.processes[i].url});
      }
    }
    const allMetadataEvents = tracingModel.devToolsMetadataEvents();
    for (const process of tracingModel.sortedProcesses()) {
      const data = processData.get(process.id());
      if (!data)
        continue;
      data.sort((a, b) => a.from - b.from || a.to - b.to);
      const ranges = [];
      let lastUrl = null;
      let lastMainUrl = null;
      let hasMain = false;
      for (const item of data) {
        if (!ranges.length || item.from > ranges.peekLast().to)
          ranges.push({from: item.from, to: item.to});
        else
          ranges.peekLast().to = item.to;
        if (item.main)
          hasMain = true;
        if (item.url) {
          if (item.main)
            lastMainUrl = item.url;
          lastUrl = item.url;
        }
      }

      for (const thread of process.sortedThreads()) {
        if (thread.name() === TimelineModel.TimelineModel.RendererMainThreadName) {
          this._processThreadEvents(
              tracingModel, ranges, thread, true /* isMainThread */, false /* isWorker */, hasMain,
              hasMain ? lastMainUrl : lastUrl);
        } else if (
            thread.name() === TimelineModel.TimelineModel.WorkerThreadName ||
            thread.name() === TimelineModel.TimelineModel.WorkerThreadNameLegacy) {
          const workerMetaEvent = allMetadataEvents.find(e => {
            if (e.name !== TimelineModel.TimelineModel.DevToolsMetadataEvent.TracingSessionIdForWorker)
              return false;
            if (e.thread.process() !== process)
              return false;
            if (e.args['data']['workerThreadId'] !== thread.id())
              return false;
            return !!this._pageFrames.get(TimelineModel.TimelineModel.eventFrameId(e));
          });
          if (!workerMetaEvent)
            continue;
          this._workerIdByThread.set(thread, workerMetaEvent.args['data']['workerId'] || '');
          this._processThreadEvents(
              tracingModel, ranges, thread, false /* isMainThread */, true /* isWorker */, false /* forMainFrame */,
              workerMetaEvent.args['data']['url'] || '');
        } else {
          this._processThreadEvents(
              tracingModel, ranges, thread, false /* isMainThread */, false /* isWorker */, false /* forMainFrame */,
              null);
        }
      }
    }
  }

  /**
   * @param {!SDK.TracingModel} tracingModel
   * @return {?TimelineModel.TimelineModel.MetadataEvents}
   */
  _processMetadataEvents(tracingModel) {
    const metadataEvents = tracingModel.devToolsMetadataEvents();

    const pageDevToolsMetadataEvents = [];
    const workersDevToolsMetadataEvents = [];
    for (const event of metadataEvents) {
      if (event.name === TimelineModel.TimelineModel.DevToolsMetadataEvent.TracingStartedInPage) {
        pageDevToolsMetadataEvents.push(event);
        if (event.args['data'] && event.args['data']['persistentIds'])
          this._persistentIds = true;
        const frames = ((event.args['data'] && event.args['data']['frames']) || []);
        frames.forEach(payload => this._addPageFrame(event, payload));
        this._mainFrame = this.rootFrames()[0];
      } else if (event.name === TimelineModel.TimelineModel.DevToolsMetadataEvent.TracingSessionIdForWorker) {
        workersDevToolsMetadataEvents.push(event);
      } else if (event.name === TimelineModel.TimelineModel.DevToolsMetadataEvent.TracingStartedInBrowser) {
        console.assert(!this._mainFrameNodeId, 'Multiple sessions in trace');
        this._mainFrameNodeId = event.args['frameTreeNodeId'];
      }
    }
    if (!pageDevToolsMetadataEvents.length)
      return null;

    const sessionId =
        pageDevToolsMetadataEvents[0].args['sessionId'] || pageDevToolsMetadataEvents[0].args['data']['sessionId'];
    this._sessionId = sessionId;

    const mismatchingIds = new Set();
    /**
     * @param {!SDK.TracingModel.Event} event
     * @return {boolean}
     */
    function checkSessionId(event) {
      let args = event.args;
      // FIXME: put sessionId into args["data"] for TracingStartedInPage event.
      if (args['data'])
        args = args['data'];
      const id = args['sessionId'];
      if (id === sessionId)
        return true;
      mismatchingIds.add(id);
      return false;
    }
    const result = {
      page: pageDevToolsMetadataEvents.filter(checkSessionId).sort(SDK.TracingModel.Event.compareStartTime),
      workers: workersDevToolsMetadataEvents.sort(SDK.TracingModel.Event.compareStartTime)
    };
    if (mismatchingIds.size) {
      Common.console.error(
          'Timeline recording was started in more than one page simultaneously. Session id mismatch: ' +
          this._sessionId + ' and ' + mismatchingIds.valuesArray() + '.');
    }
    return result;
  }

  /**
   * @param {!SDK.TracingModel} tracingModel
   */
  _processSyncBrowserEvents(tracingModel) {
    const browserMain = SDK.TracingModel.browserMainThread(tracingModel);
    if (browserMain)
      browserMain.events().forEach(this._processBrowserEvent, this);
  }

  /**
   * @param {!SDK.TracingModel} tracingModel
   */
  _processAsyncBrowserEvents(tracingModel) {
    const browserMain = SDK.TracingModel.browserMainThread(tracingModel);
    if (browserMain)
      this._processAsyncEvents(browserMain, [{from: 0, to: Infinity}]);
  }

  /**
   * @param {!SDK.TracingModel} tracingModel
   */
  _buildGPUEvents(tracingModel) {
    const thread = tracingModel.threadByName('GPU Process', 'CrGpuMain');
    if (!thread)
      return;
    const gpuEventName = TimelineModel.TimelineModel.RecordType.GPUTask;
    const track = this._ensureNamedTrack(TimelineModel.TimelineModel.TrackType.GPU);
    track.thread = thread;
    track.events = thread.events().filter(event => event.name === gpuEventName);
  }

  _resetProcessingState() {
    this._asyncEventTracker = new TimelineModel.TimelineAsyncEventTracker();
    this._invalidationTracker = new TimelineModel.InvalidationTracker();
    this._layoutInvalidate = {};
    this._lastScheduleStyleRecalculation = {};
    this._paintImageEventByPixelRefId = {};
    this._lastPaintForLayer = {};
    this._lastRecalculateStylesEvent = null;
    this._currentScriptEvent = null;
    this._eventStack = [];
    /** @type {!Set<string>} */
    this._knownInputEvents = new Set();
    this._browserFrameTracking = false;
    this._persistentIds = false;
    this._legacyCurrentPage = null;
  }

  /**
   * @param {!SDK.TracingModel} tracingModel
   * @param {!SDK.TracingModel.Thread} thread
   * @return {?SDK.CPUProfileDataModel}
   */
  _extractCpuProfile(tracingModel, thread) {
    const events = thread.events();
    let cpuProfile;

    // Check for legacy CpuProfile event format first.
    let cpuProfileEvent = events.peekLast();
    if (cpuProfileEvent && cpuProfileEvent.name === TimelineModel.TimelineModel.RecordType.CpuProfile) {
      const eventData = cpuProfileEvent.args['data'];
      cpuProfile = /** @type {?Protocol.Profiler.Profile} */ (eventData && eventData['cpuProfile']);
    }

    if (!cpuProfile) {
      cpuProfileEvent = events.find(e => e.name === TimelineModel.TimelineModel.RecordType.Profile);
      if (!cpuProfileEvent)
        return null;
      const profileGroup = tracingModel.profileGroup(cpuProfileEvent);
      if (!profileGroup) {
        Common.console.error('Invalid CPU profile format.');
        return null;
      }
      cpuProfile = /** @type {!Protocol.Profiler.Profile} */ (
          {startTime: cpuProfileEvent.args['data']['startTime'], endTime: 0, nodes: [], samples: [], timeDeltas: []});
      for (const profileEvent of profileGroup.children) {
        const eventData = profileEvent.args['data'];
        if ('startTime' in eventData)
          cpuProfile.startTime = eventData['startTime'];
        if ('endTime' in eventData)
          cpuProfile.endTime = eventData['endTime'];
        const nodesAndSamples = eventData['cpuProfile'] || {};
        cpuProfile.nodes.pushAll(nodesAndSamples['nodes'] || []);
        cpuProfile.samples.pushAll(nodesAndSamples['samples'] || []);
        cpuProfile.timeDeltas.pushAll(eventData['timeDeltas'] || []);
        if (cpuProfile.samples.length !== cpuProfile.timeDeltas.length) {
          Common.console.error('Failed to parse CPU profile.');
          return null;
        }
      }
      if (!cpuProfile.endTime)
        cpuProfile.endTime = cpuProfile.timeDeltas.reduce((x, y) => x + y, cpuProfile.startTime);
    }

    try {
      const jsProfileModel = new SDK.CPUProfileDataModel(cpuProfile);
      this._cpuProfiles.push(jsProfileModel);
      return jsProfileModel;
    } catch (e) {
      Common.console.error('Failed to parse CPU profile.');
    }
    return null;
  }

  /**
   * @param {!SDK.TracingModel} tracingModel
   * @param {!SDK.TracingModel.Thread} thread
   * @return {!Array<!SDK.TracingModel.Event>}
   */
  _injectJSFrameEvents(tracingModel, thread) {
    const jsProfileModel = this._extractCpuProfile(tracingModel, thread);
    let events = thread.events();
    const jsSamples = jsProfileModel ?
        TimelineModel.TimelineJSProfileProcessor.generateTracingEventsFromCpuProfile(jsProfileModel, thread) :
        null;
    if (jsSamples && jsSamples.length)
      events = events.mergeOrdered(jsSamples, SDK.TracingModel.Event.orderedCompareStartTime);
    if (jsSamples || events.some(e => e.name === TimelineModel.TimelineModel.RecordType.JSSample)) {
      const jsFrameEvents = TimelineModel.TimelineJSProfileProcessor.generateJSFrameEvents(events);
      if (jsFrameEvents && jsFrameEvents.length)
        events = jsFrameEvents.mergeOrdered(events, SDK.TracingModel.Event.orderedCompareStartTime);
    }
    return events;
  }

  /**
   * @param {!SDK.TracingModel} tracingModel
   * @param {!Array<!{from: number, to: number}>} ranges
   * @param {!SDK.TracingModel.Thread} thread
   * @param {boolean} isMainThread
   * @param {boolean} isWorker
   * @param {boolean} forMainFrame
   * @param {?string} url
   */
  _processThreadEvents(tracingModel, ranges, thread, isMainThread, isWorker, forMainFrame, url) {
    const track = new TimelineModel.TimelineModel.Track();
    track.name = thread.name() || ls`Thread ${thread.id()}`;
    track.type = TimelineModel.TimelineModel.TrackType.Other;
    track.thread = thread;
    if (isMainThread) {
      track.type = TimelineModel.TimelineModel.TrackType.MainThread;
      track.url = url || null;
      track.forMainFrame = forMainFrame;
    } else if (isWorker) {
      track.type = TimelineModel.TimelineModel.TrackType.Worker;
      track.url = url;
    } else if (thread.name().startsWith('CompositorTileWorker')) {
      track.type = TimelineModel.TimelineModel.TrackType.Raster;
    }
    this._tracks.push(track);

    const events = this._injectJSFrameEvents(tracingModel, thread);
    this._eventStack = [];
    const eventStack = this._eventStack;

    for (const range of ranges) {
      let i = events.lowerBound(range.from, (time, event) => time - event.startTime);
      for (; i < events.length; i++) {
        const event = events[i];
        if (event.startTime >= range.to)
          break;
        while (eventStack.length && eventStack.peekLast().endTime <= event.startTime)
          eventStack.pop();
        if (!this._processEvent(event))
          continue;
        if (!SDK.TracingModel.isAsyncPhase(event.phase) && event.duration) {
          if (eventStack.length) {
            const parent = eventStack.peekLast();
            parent.selfTime -= event.duration;
            if (parent.selfTime < 0)
              this._fixNegativeDuration(parent, event);
          }
          event.selfTime = event.duration;
          if (!eventStack.length)
            track.tasks.push(event);
          eventStack.push(event);
        }
        if (this.isMarkerEvent(event))
          this._timeMarkerEvents.push(event);

        track.events.push(event);
        this._inspectedTargetEvents.push(event);
      }
    }
    this._processAsyncEvents(thread, ranges);
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {!SDK.TracingModel.Event} child
   */
  _fixNegativeDuration(event, child) {
    const epsilon = 1e-3;
    if (event.selfTime < -epsilon) {
      console.error(
          `Children are longer than parent at ${event.startTime} ` +
          `(${(child.startTime - this.minimumRecordTime()).toFixed(3)} by ${(-event.selfTime).toFixed(3)}`);
    }
    event.selfTime = 0;
  }

  /**
   * @param {!SDK.TracingModel.Thread} thread
   * @param {!Array<!{from: number, to: number}>} ranges
   */
  _processAsyncEvents(thread, ranges) {
    const asyncEvents = thread.asyncEvents();
    const groups = new Map();

    /**
     * @param {!TimelineModel.TimelineModel.TrackType} type
     * @return {!Array<!SDK.TracingModel.AsyncEvent>}
     */
    function group(type) {
      if (!groups.has(type))
        groups.set(type, []);
      return groups.get(type);
    }

    for (const range of ranges) {
      let i = asyncEvents.lowerBound(range.from, function(time, asyncEvent) {
        return time - asyncEvent.startTime;
      });

      for (; i < asyncEvents.length; ++i) {
        const asyncEvent = asyncEvents[i];
        if (asyncEvent.startTime >= range.to)
          break;

        if (asyncEvent.hasCategory(TimelineModel.TimelineModel.Category.Console)) {
          group(TimelineModel.TimelineModel.TrackType.Console).push(asyncEvent);
          continue;
        }

        if (asyncEvent.hasCategory(TimelineModel.TimelineModel.Category.UserTiming)) {
          group(TimelineModel.TimelineModel.TrackType.Timings).push(asyncEvent);
          continue;
        }

        if (asyncEvent.name === TimelineModel.TimelineModel.RecordType.Animation) {
          group(TimelineModel.TimelineModel.TrackType.Animation).push(asyncEvent);
          continue;
        }

        if (asyncEvent.hasCategory(TimelineModel.TimelineModel.Category.LatencyInfo) ||
            asyncEvent.name === TimelineModel.TimelineModel.RecordType.ImplSideFling) {
          const lastStep = asyncEvent.steps.peekLast();
          // FIXME: fix event termination on the back-end instead.
          if (lastStep.phase !== SDK.TracingModel.Phase.AsyncEnd)
            continue;
          const data = lastStep.args['data'];
          asyncEvent.causedFrame = !!(data && data['INPUT_EVENT_LATENCY_RENDERER_SWAP_COMPONENT']);
          if (asyncEvent.hasCategory(TimelineModel.TimelineModel.Category.LatencyInfo)) {
            if (!this._knownInputEvents.has(lastStep.id))
              continue;
            if (asyncEvent.name === TimelineModel.TimelineModel.RecordType.InputLatencyMouseMove &&
                !asyncEvent.causedFrame)
              continue;
            const rendererMain = data['INPUT_EVENT_LATENCY_RENDERER_MAIN_COMPONENT'];
            if (rendererMain) {
              const time = rendererMain['time'] / 1000;
              TimelineModel.TimelineData.forEvent(asyncEvent.steps[0]).timeWaitingForMainThread =
                  time - asyncEvent.steps[0].startTime;
            }
          }
          group(TimelineModel.TimelineModel.TrackType.Input).push(asyncEvent);
          continue;
        }
      }
    }

    for (const [type, events] of groups) {
      const track = this._ensureNamedTrack(type);
      track.thread = thread;
      track.asyncEvents = track.asyncEvents.mergeOrdered(events, SDK.TracingModel.Event.compareStartTime);
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {boolean}
   */
  _processEvent(event) {
    const recordTypes = TimelineModel.TimelineModel.RecordType;
    const eventStack = this._eventStack;

    if (!eventStack.length) {
      if (this._currentTaskLayoutAndRecalcEvents && this._currentTaskLayoutAndRecalcEvents.length) {
        const totalTime = this._currentTaskLayoutAndRecalcEvents.reduce((time, event) => time + event.duration, 0);
        if (totalTime > TimelineModel.TimelineModel.Thresholds.ForcedLayout) {
          for (const e of this._currentTaskLayoutAndRecalcEvents) {
            const timelineData = TimelineModel.TimelineData.forEvent(e);
            timelineData.warning = e.name === recordTypes.Layout ?
                TimelineModel.TimelineModel.WarningType.ForcedLayout :
                TimelineModel.TimelineModel.WarningType.ForcedStyle;
          }
        }
      }
      this._currentTaskLayoutAndRecalcEvents = [];
    }

    if (this._currentScriptEvent && event.startTime > this._currentScriptEvent.endTime)
      this._currentScriptEvent = null;

    const eventData = event.args['data'] || event.args['beginData'] || {};
    const timelineData = TimelineModel.TimelineData.forEvent(event);
    if (eventData['stackTrace'])
      timelineData.stackTrace = eventData['stackTrace'];
    if (timelineData.stackTrace && event.name !== recordTypes.JSSample) {
      // TraceEvents come with 1-based line & column numbers. The frontend code
      // requires 0-based ones. Adjust the values.
      for (let i = 0; i < timelineData.stackTrace.length; ++i) {
        --timelineData.stackTrace[i].lineNumber;
        --timelineData.stackTrace[i].columnNumber;
      }
    }
    let pageFrameId = TimelineModel.TimelineModel.eventFrameId(event);
    if (!pageFrameId && eventStack.length)
      pageFrameId = TimelineModel.TimelineData.forEvent(eventStack.peekLast()).frameId;
    timelineData.frameId = pageFrameId || (this._mainFrame && this._mainFrame.frameId) || '';
    this._asyncEventTracker.processEvent(event);

    if (this.isMarkerEvent(event))
      this._ensureNamedTrack(TimelineModel.TimelineModel.TrackType.Timings);

    switch (event.name) {
      case recordTypes.ResourceSendRequest:
      case recordTypes.WebSocketCreate:
        timelineData.setInitiator(eventStack.peekLast() || null);
        timelineData.url = eventData['url'];
        break;

      case recordTypes.ScheduleStyleRecalculation:
        this._lastScheduleStyleRecalculation[eventData['frame']] = event;
        break;

      case recordTypes.UpdateLayoutTree:
      case recordTypes.RecalculateStyles:
        this._invalidationTracker.didRecalcStyle(event);
        if (event.args['beginData'])
          timelineData.setInitiator(this._lastScheduleStyleRecalculation[event.args['beginData']['frame']]);
        this._lastRecalculateStylesEvent = event;
        if (this._currentScriptEvent)
          this._currentTaskLayoutAndRecalcEvents.push(event);
        break;

      case recordTypes.ScheduleStyleInvalidationTracking:
      case recordTypes.StyleRecalcInvalidationTracking:
      case recordTypes.StyleInvalidatorInvalidationTracking:
      case recordTypes.LayoutInvalidationTracking:
      case recordTypes.LayerInvalidationTracking:
      case recordTypes.PaintInvalidationTracking:
      case recordTypes.ScrollInvalidationTracking:
        this._invalidationTracker.addInvalidation(new TimelineModel.InvalidationTrackingEvent(event));
        break;

      case recordTypes.InvalidateLayout: {
        // Consider style recalculation as a reason for layout invalidation,
        // but only if we had no earlier layout invalidation records.
        let layoutInitator = event;
        const frameId = eventData['frame'];
        if (!this._layoutInvalidate[frameId] && this._lastRecalculateStylesEvent &&
            this._lastRecalculateStylesEvent.endTime > event.startTime)
          layoutInitator = TimelineModel.TimelineData.forEvent(this._lastRecalculateStylesEvent).initiator();
        this._layoutInvalidate[frameId] = layoutInitator;
        break;
      }

      case recordTypes.Layout: {
        this._invalidationTracker.didLayout(event);
        const frameId = event.args['beginData']['frame'];
        timelineData.setInitiator(this._layoutInvalidate[frameId]);
        // In case we have no closing Layout event, endData is not available.
        if (event.args['endData'])
          timelineData.backendNodeId = event.args['endData']['rootNode'];
        this._layoutInvalidate[frameId] = null;
        if (this._currentScriptEvent)
          this._currentTaskLayoutAndRecalcEvents.push(event);
        break;
      }

      case recordTypes.EventDispatch:
        if (event.duration > TimelineModel.TimelineModel.Thresholds.RecurringHandler)
          timelineData.warning = TimelineModel.TimelineModel.WarningType.LongHandler;
        break;

      case recordTypes.TimerFire:
      case recordTypes.FireAnimationFrame:
        if (event.duration > TimelineModel.TimelineModel.Thresholds.RecurringHandler)
          timelineData.warning = TimelineModel.TimelineModel.WarningType.LongRecurringHandler;
        break;

      case recordTypes.FunctionCall:
        // Compatibility with old format.
        if (typeof eventData['scriptName'] === 'string')
          eventData['url'] = eventData['scriptName'];
        if (typeof eventData['scriptLine'] === 'number')
          eventData['lineNumber'] = eventData['scriptLine'];

      // Fallthrough.

      case recordTypes.EvaluateScript:
      case recordTypes.CompileScript:
        if (typeof eventData['lineNumber'] === 'number')
          --eventData['lineNumber'];
        if (typeof eventData['columnNumber'] === 'number')
          --eventData['columnNumber'];

      // Fallthrough intended.

      case recordTypes.RunMicrotasks:
        // Microtasks technically are not necessarily scripts, but for purpose of
        // forced sync style recalc or layout detection they are.
        if (!this._currentScriptEvent)
          this._currentScriptEvent = event;
        break;

      case recordTypes.SetLayerTreeId:
        // This is to support old traces.
        if (this._sessionId && eventData['sessionId'] && this._sessionId === eventData['sessionId']) {
          this._mainFrameLayerTreeId = eventData['layerTreeId'];
          break;
        }

        // We currently only show layer tree for the main frame.
        const frameId = TimelineModel.TimelineModel.eventFrameId(event);
        const pageFrame = this._pageFrames.get(frameId);
        if (!pageFrame || pageFrame.parent)
          return false;
        this._mainFrameLayerTreeId = eventData['layerTreeId'];
        break;

      case recordTypes.Paint: {
        this._invalidationTracker.didPaint(event);
        timelineData.backendNodeId = eventData['nodeId'];
        // Only keep layer paint events, skip paints for subframes that get painted to the same layer as parent.
        if (!eventData['layerId'])
          break;
        const layerId = eventData['layerId'];
        this._lastPaintForLayer[layerId] = event;
        break;
      }

      case recordTypes.DisplayItemListSnapshot:
      case recordTypes.PictureSnapshot: {
        const layerUpdateEvent = this._findAncestorEvent(recordTypes.UpdateLayer);
        if (!layerUpdateEvent || layerUpdateEvent.args['layerTreeId'] !== this._mainFrameLayerTreeId)
          break;
        const paintEvent = this._lastPaintForLayer[layerUpdateEvent.args['layerId']];
        if (paintEvent) {
          TimelineModel.TimelineData.forEvent(paintEvent).picture =
              /** @type {!SDK.TracingModel.ObjectSnapshot} */ (event);
        }
        break;
      }

      case recordTypes.ScrollLayer:
        timelineData.backendNodeId = eventData['nodeId'];
        break;

      case recordTypes.PaintImage:
        timelineData.backendNodeId = eventData['nodeId'];
        timelineData.url = eventData['url'];
        break;

      case recordTypes.DecodeImage:
      case recordTypes.ResizeImage: {
        let paintImageEvent = this._findAncestorEvent(recordTypes.PaintImage);
        if (!paintImageEvent) {
          const decodeLazyPixelRefEvent = this._findAncestorEvent(recordTypes.DecodeLazyPixelRef);
          paintImageEvent = decodeLazyPixelRefEvent &&
              this._paintImageEventByPixelRefId[decodeLazyPixelRefEvent.args['LazyPixelRef']];
        }
        if (!paintImageEvent)
          break;
        const paintImageData = TimelineModel.TimelineData.forEvent(paintImageEvent);
        timelineData.backendNodeId = paintImageData.backendNodeId;
        timelineData.url = paintImageData.url;
        break;
      }

      case recordTypes.DrawLazyPixelRef: {
        const paintImageEvent = this._findAncestorEvent(recordTypes.PaintImage);
        if (!paintImageEvent)
          break;
        this._paintImageEventByPixelRefId[event.args['LazyPixelRef']] = paintImageEvent;
        const paintImageData = TimelineModel.TimelineData.forEvent(paintImageEvent);
        timelineData.backendNodeId = paintImageData.backendNodeId;
        timelineData.url = paintImageData.url;
        break;
      }

      case recordTypes.FrameStartedLoading:
        if (timelineData.frameId !== event.args['frame'])
          return false;
        break;

      case recordTypes.MarkDOMContent:
      case recordTypes.MarkLoad: {
        const frameId = TimelineModel.TimelineModel.eventFrameId(event);
        if (!this._pageFrames.has(frameId))
          return false;
        break;
      }

      case recordTypes.CommitLoad: {
        if (this._browserFrameTracking)
          break;
        const frameId = TimelineModel.TimelineModel.eventFrameId(event);
        const isMainFrame = !!eventData['isMainFrame'];
        const pageFrame = this._pageFrames.get(frameId);
        if (pageFrame) {
          pageFrame.update(event.startTime, eventData);
        } else {
          // We should only have one main frame which has persistent id,
          // unless it's an old trace without 'persistentIds' flag.
          if (!this._persistentIds) {
            if (eventData['page'] && eventData['page'] !== this._legacyCurrentPage)
              return false;
          } else if (isMainFrame) {
            return false;
          } else if (!this._addPageFrame(event, eventData)) {
            return false;
          }
        }
        if (isMainFrame)
          this._mainFrame = this._pageFrames.get(frameId);
        break;
      }

      case recordTypes.FireIdleCallback:
        if (event.duration >
            eventData['allottedMilliseconds'] + TimelineModel.TimelineModel.Thresholds.IdleCallbackAddon)
          timelineData.warning = TimelineModel.TimelineModel.WarningType.IdleDeadlineExceeded;
        break;
    }
    return true;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   */
  _processBrowserEvent(event) {
    if (event.name === TimelineModel.TimelineModel.RecordType.LatencyInfoFlow) {
      const frameId = event.args['frameTreeNodeId'];
      if (typeof frameId === 'number' && frameId === this._mainFrameNodeId)
        this._knownInputEvents.add(event.bind_id);
      return;
    }

    if (event.hasCategory(SDK.TracingModel.DevToolsMetadataEventCategory) && event.args['data']) {
      const data = event.args['data'];
      if (event.name === TimelineModel.TimelineModel.DevToolsMetadataEvent.TracingStartedInBrowser) {
        if (!data['persistentIds'])
          return;
        this._browserFrameTracking = true;
        this._mainFrameNodeId = data['frameTreeNodeId'];
        const frames = data['frames'] || [];
        frames.forEach(payload => {
          const parent = payload['parent'] && this._pageFrames.get(payload['parent']);
          if (payload['parent'] && !parent)
            return;
          let frame = this._pageFrames.get(payload['frame']);
          if (!frame) {
            frame = new TimelineModel.TimelineModel.PageFrame(payload);
            this._pageFrames.set(frame.frameId, frame);
            if (parent)
              parent.addChild(frame);
            else
              this._mainFrame = frame;
          }
          // TODO(dgozman): this should use event.startTime, but due to races between tracing start
          // in different processes we cannot do this yet.
          frame.update(this._minimumRecordTime, payload);
        });
        return;
      }
      if (event.name === TimelineModel.TimelineModel.DevToolsMetadataEvent.FrameCommittedInBrowser &&
          this._browserFrameTracking) {
        let frame = this._pageFrames.get(data['frame']);
        if (!frame) {
          const parent = data['parent'] && this._pageFrames.get(data['parent']);
          if (!parent)
            return;
          frame = new TimelineModel.TimelineModel.PageFrame(data);
          this._pageFrames.set(frame.frameId, frame);
          parent.addChild(frame);
        }
        frame.update(event.startTime, data);
        return;
      }
      if (event.name === TimelineModel.TimelineModel.DevToolsMetadataEvent.ProcessReadyInBrowser &&
          this._browserFrameTracking) {
        const frame = this._pageFrames.get(data['frame']);
        if (frame)
          frame.processReady(data['processPseudoId'], data['processId']);
        return;
      }
      if (event.name === TimelineModel.TimelineModel.DevToolsMetadataEvent.FrameDeletedInBrowser &&
          this._browserFrameTracking) {
        const frame = this._pageFrames.get(data['frame']);
        if (frame)
          frame.deletedTime = event.startTime;
        return;
      }
    }
  }

  /**
   * @param {!TimelineModel.TimelineModel.TrackType} type
   * @return {!TimelineModel.TimelineModel.Track}
   */
  _ensureNamedTrack(type) {
    if (!this._namedTracks.has(type)) {
      const track = new TimelineModel.TimelineModel.Track();
      track.type = type;
      this._tracks.push(track);
      this._namedTracks.set(type, track);
    }
    return this._namedTracks.get(type);
  }

  /**
   * @param {string} name
   * @return {?SDK.TracingModel.Event}
   */
  _findAncestorEvent(name) {
    for (let i = this._eventStack.length - 1; i >= 0; --i) {
      const event = this._eventStack[i];
      if (event.name === name)
        return event;
    }
    return null;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {!Object} payload
   * @return {boolean}
   */
  _addPageFrame(event, payload) {
    const parent = payload['parent'] && this._pageFrames.get(payload['parent']);
    if (payload['parent'] && !parent)
      return false;
    const pageFrame = new TimelineModel.TimelineModel.PageFrame(payload);
    this._pageFrames.set(pageFrame.frameId, pageFrame);
    pageFrame.update(event.startTime, payload);
    if (parent)
      parent.addChild(pageFrame);
    return true;
  }

  _reset() {
    this._isGenericTrace = false;
    /** @type {!Array<!TimelineModel.TimelineModel.Track>} */
    this._tracks = [];
    /** @type {!Map<!TimelineModel.TimelineModel.TrackType, !TimelineModel.TimelineModel.Track>} */
    this._namedTracks = new Map();
    /** @type {!Array<!SDK.TracingModel.Event>} */
    this._inspectedTargetEvents = [];
    /** @type {!Array<!SDK.TracingModel.Event>} */
    this._timeMarkerEvents = [];
    /** @type {?string} */
    this._sessionId = null;
    /** @type {?number} */
    this._mainFrameNodeId = null;
    /** @type {!Array<!SDK.CPUProfileDataModel>} */
    this._cpuProfiles = [];
    /** @type {!WeakMap<!SDK.TracingModel.Thread, string>} */
    this._workerIdByThread = new WeakMap();
    /** @type {!Map<string, !TimelineModel.TimelineModel.PageFrame>} */
    this._pageFrames = new Map();
    this._mainFrame = null;

    this._minimumRecordTime = 0;
    this._maximumRecordTime = 0;
  }

  /**
   * @return {boolean}
   */
  isGenericTrace() {
    return this._isGenericTrace;
  }

  /**
   * @return {!SDK.TracingModel}
   */
  tracingModel() {
    return this._tracingModel;
  }

  /**
   * @return {number}
   */
  minimumRecordTime() {
    return this._minimumRecordTime;
  }

  /**
   * @return {number}
   */
  maximumRecordTime() {
    return this._maximumRecordTime;
  }

  /**
   * @return {!Array<!SDK.TracingModel.Event>}
   */
  inspectedTargetEvents() {
    return this._inspectedTargetEvents;
  }

  /**
   * @return {!Array<!TimelineModel.TimelineModel.Track>}
   */
  tracks() {
    return this._tracks;
  }

  /**
   * @return {boolean}
   */
  isEmpty() {
    return this.minimumRecordTime() === 0 && this.maximumRecordTime() === 0;
  }

  /**
   * @return {!Array<!SDK.TracingModel.Event>}
   */
  timeMarkerEvents() {
    return this._timeMarkerEvents;
  }

  /**
   * @return {!Array<!TimelineModel.TimelineModel.PageFrame>}
   */
  rootFrames() {
    return Array.from(this._pageFrames.values()).filter(frame => !frame.parent);
  }

  /**
   * @return {string}
   */
  pageURL() {
    return this._mainFrame && this._mainFrame.url || '';
  }

  /**
   * @param {string} frameId
   * @return {?TimelineModel.TimelineModel.PageFrame}
   */
  pageFrameById(frameId) {
    return frameId ? this._pageFrames.get(frameId) || null : null;
  }

  /**
   * @return {!Array<!TimelineModel.TimelineModel.NetworkRequest>}
   */
  networkRequests() {
    if (this.isGenericTrace())
      return [];
    /** @type {!Map<string,!TimelineModel.TimelineModel.NetworkRequest>} */
    const requests = new Map();
    /** @type {!Array<!TimelineModel.TimelineModel.NetworkRequest>} */
    const requestsList = [];
    /** @type {!Array<!TimelineModel.TimelineModel.NetworkRequest>} */
    const zeroStartRequestsList = [];
    const types = TimelineModel.TimelineModel.RecordType;
    const resourceTypes = new Set(
        [types.ResourceSendRequest, types.ResourceReceiveResponse, types.ResourceReceivedData, types.ResourceFinish]);
    const events = this.inspectedTargetEvents();
    for (let i = 0; i < events.length; ++i) {
      const e = events[i];
      if (!resourceTypes.has(e.name))
        continue;
      const id = TimelineModel.TimelineModel.globalEventId(e, 'requestId');
      let request = requests.get(id);
      if (request) {
        request.addEvent(e);
      } else {
        request = new TimelineModel.TimelineModel.NetworkRequest(e);
        requests.set(id, request);
        if (request.startTime)
          requestsList.push(request);
        else
          zeroStartRequestsList.push(request);
      }
    }
    return zeroStartRequestsList.concat(requestsList);
  }
};

/**
 * @enum {string}
 */
TimelineModel.TimelineModel.RecordType = {
  Task: 'Task',
  Program: 'Program',
  EventDispatch: 'EventDispatch',

  GPUTask: 'GPUTask',

  Animation: 'Animation',
  RequestMainThreadFrame: 'RequestMainThreadFrame',
  BeginFrame: 'BeginFrame',
  NeedsBeginFrameChanged: 'NeedsBeginFrameChanged',
  BeginMainThreadFrame: 'BeginMainThreadFrame',
  ActivateLayerTree: 'ActivateLayerTree',
  DrawFrame: 'DrawFrame',
  HitTest: 'HitTest',
  ScheduleStyleRecalculation: 'ScheduleStyleRecalculation',
  RecalculateStyles: 'RecalculateStyles',  // For backwards compatibility only, now replaced by UpdateLayoutTree.
  UpdateLayoutTree: 'UpdateLayoutTree',
  InvalidateLayout: 'InvalidateLayout',
  Layout: 'Layout',
  UpdateLayer: 'UpdateLayer',
  UpdateLayerTree: 'UpdateLayerTree',
  PaintSetup: 'PaintSetup',
  Paint: 'Paint',
  PaintImage: 'PaintImage',
  Rasterize: 'Rasterize',
  RasterTask: 'RasterTask',
  ScrollLayer: 'ScrollLayer',
  CompositeLayers: 'CompositeLayers',

  ScheduleStyleInvalidationTracking: 'ScheduleStyleInvalidationTracking',
  StyleRecalcInvalidationTracking: 'StyleRecalcInvalidationTracking',
  StyleInvalidatorInvalidationTracking: 'StyleInvalidatorInvalidationTracking',
  LayoutInvalidationTracking: 'LayoutInvalidationTracking',
  LayerInvalidationTracking: 'LayerInvalidationTracking',
  PaintInvalidationTracking: 'PaintInvalidationTracking',
  ScrollInvalidationTracking: 'ScrollInvalidationTracking',

  ParseHTML: 'ParseHTML',
  ParseAuthorStyleSheet: 'ParseAuthorStyleSheet',

  TimerInstall: 'TimerInstall',
  TimerRemove: 'TimerRemove',
  TimerFire: 'TimerFire',

  XHRReadyStateChange: 'XHRReadyStateChange',
  XHRLoad: 'XHRLoad',
  CompileScript: 'v8.compile',
  EvaluateScript: 'EvaluateScript',
  CompileModule: 'v8.compileModule',
  EvaluateModule: 'v8.evaluateModule',

  FrameStartedLoading: 'FrameStartedLoading',
  CommitLoad: 'CommitLoad',
  MarkLoad: 'MarkLoad',
  MarkDOMContent: 'MarkDOMContent',
  MarkFirstPaint: 'MarkFirstPaint',
  MarkFCP: 'firstContentfulPaint',
  MarkFMP: 'firstMeaningfulPaint',

  TimeStamp: 'TimeStamp',
  ConsoleTime: 'ConsoleTime',
  UserTiming: 'UserTiming',

  ResourceSendRequest: 'ResourceSendRequest',
  ResourceReceiveResponse: 'ResourceReceiveResponse',
  ResourceReceivedData: 'ResourceReceivedData',
  ResourceFinish: 'ResourceFinish',

  RunMicrotasks: 'RunMicrotasks',
  FunctionCall: 'FunctionCall',
  GCEvent: 'GCEvent',  // For backwards compatibility only, now replaced by MinorGC/MajorGC.
  MajorGC: 'MajorGC',
  MinorGC: 'MinorGC',
  JSFrame: 'JSFrame',
  JSSample: 'JSSample',
  // V8Sample events are coming from tracing and contain raw stacks with function addresses.
  // After being processed with help of JitCodeAdded and JitCodeMoved events they
  // get translated into function infos and stored as stacks in JSSample events.
  V8Sample: 'V8Sample',
  JitCodeAdded: 'JitCodeAdded',
  JitCodeMoved: 'JitCodeMoved',
  ParseScriptOnBackground: 'v8.parseOnBackground',
  V8Execute: 'V8.Execute',

  UpdateCounters: 'UpdateCounters',

  RequestAnimationFrame: 'RequestAnimationFrame',
  CancelAnimationFrame: 'CancelAnimationFrame',
  FireAnimationFrame: 'FireAnimationFrame',

  RequestIdleCallback: 'RequestIdleCallback',
  CancelIdleCallback: 'CancelIdleCallback',
  FireIdleCallback: 'FireIdleCallback',

  WebSocketCreate: 'WebSocketCreate',
  WebSocketSendHandshakeRequest: 'WebSocketSendHandshakeRequest',
  WebSocketReceiveHandshakeResponse: 'WebSocketReceiveHandshakeResponse',
  WebSocketDestroy: 'WebSocketDestroy',

  EmbedderCallback: 'EmbedderCallback',

  SetLayerTreeId: 'SetLayerTreeId',
  TracingStartedInPage: 'TracingStartedInPage',
  TracingSessionIdForWorker: 'TracingSessionIdForWorker',

  DecodeImage: 'Decode Image',
  ResizeImage: 'Resize Image',
  DrawLazyPixelRef: 'Draw LazyPixelRef',
  DecodeLazyPixelRef: 'Decode LazyPixelRef',

  LazyPixelRef: 'LazyPixelRef',
  LayerTreeHostImplSnapshot: 'cc::LayerTreeHostImpl',
  PictureSnapshot: 'cc::Picture',
  DisplayItemListSnapshot: 'cc::DisplayItemList',
  LatencyInfo: 'LatencyInfo',
  LatencyInfoFlow: 'LatencyInfo.Flow',
  InputLatencyMouseMove: 'InputLatency::MouseMove',
  InputLatencyMouseWheel: 'InputLatency::MouseWheel',
  ImplSideFling: 'InputHandlerProxy::HandleGestureFling::started',
  GCCollectGarbage: 'BlinkGC.AtomicPhase',

  CryptoDoEncrypt: 'DoEncrypt',
  CryptoDoEncryptReply: 'DoEncryptReply',
  CryptoDoDecrypt: 'DoDecrypt',
  CryptoDoDecryptReply: 'DoDecryptReply',
  CryptoDoDigest: 'DoDigest',
  CryptoDoDigestReply: 'DoDigestReply',
  CryptoDoSign: 'DoSign',
  CryptoDoSignReply: 'DoSignReply',
  CryptoDoVerify: 'DoVerify',
  CryptoDoVerifyReply: 'DoVerifyReply',

  // CpuProfile is a virtual event created on frontend to support
  // serialization of CPU Profiles within tracing timeline data.
  CpuProfile: 'CpuProfile',
  Profile: 'Profile',

  AsyncTask: 'AsyncTask',
};

TimelineModel.TimelineModel.Category = {
  Console: 'blink.console',
  UserTiming: 'blink.user_timing',
  LatencyInfo: 'latencyInfo'
};

/**
 * @enum {string}
 */
TimelineModel.TimelineModel.WarningType = {
  ForcedStyle: 'ForcedStyle',
  ForcedLayout: 'ForcedLayout',
  IdleDeadlineExceeded: 'IdleDeadlineExceeded',
  LongHandler: 'LongHandler',
  LongRecurringHandler: 'LongRecurringHandler',
  V8Deopt: 'V8Deopt'
};

TimelineModel.TimelineModel.WorkerThreadName = 'DedicatedWorker thread';
TimelineModel.TimelineModel.WorkerThreadNameLegacy = 'DedicatedWorker Thread';
TimelineModel.TimelineModel.RendererMainThreadName = 'CrRendererMain';
TimelineModel.TimelineModel.BrowserMainThreadName = 'CrBrowserMain';

TimelineModel.TimelineModel.DevToolsMetadataEvent = {
  TracingStartedInBrowser: 'TracingStartedInBrowser',
  TracingStartedInPage: 'TracingStartedInPage',
  TracingSessionIdForWorker: 'TracingSessionIdForWorker',
  FrameCommittedInBrowser: 'FrameCommittedInBrowser',
  ProcessReadyInBrowser: 'ProcessReadyInBrowser',
  FrameDeletedInBrowser: 'FrameDeletedInBrowser',
};

TimelineModel.TimelineModel.Thresholds = {
  Handler: 150,
  RecurringHandler: 50,
  ForcedLayout: 30,
  IdleCallbackAddon: 5
};

TimelineModel.TimelineModel.Track = class {
  constructor() {
    this.name = '';
    this.type = TimelineModel.TimelineModel.TrackType.Other;
    // TODO(dgozman): replace forMainFrame with a list of frames, urls and time ranges.
    this.forMainFrame = false;
    this.url = '';
    // TODO(dgozman): do not distinguish between sync and async events.
    /** @type {!Array<!SDK.TracingModel.Event>} */
    this.events = [];
    /** @type {!Array<!SDK.TracingModel.AsyncEvent>} */
    this.asyncEvents = [];
    /** @type {!Array<!SDK.TracingModel.Event>} */
    this.tasks = [];
    this._syncEvents = null;
    /** @type {?SDK.TracingModel.Thread} */
    this.thread = null;
  }

  /**
   * @return {!Array<!SDK.TracingModel.Event>}
   */
  syncEvents() {
    if (this.events.length)
      return this.events;

    if (this._syncEvents)
      return this._syncEvents;

    const stack = [];
    this._syncEvents = [];
    for (const event of this.asyncEvents) {
      const startTime = event.startTime;
      const endTime = event.endTime;
      while (stack.length && startTime >= stack.peekLast().endTime)
        stack.pop();
      if (stack.length && endTime > stack.peekLast().endTime) {
        this._syncEvents = [];
        break;
      }
      const syncEvent = new SDK.TracingModel.Event(
          event.categoriesString, event.name, SDK.TracingModel.Phase.Complete, startTime, event.thread);
      syncEvent.setEndTime(endTime);
      syncEvent.addArgs(event.args);
      this._syncEvents.push(syncEvent);
      stack.push(syncEvent);
    }
    return this._syncEvents;
  }
};

/**
 * @enum {symbol}
 */
TimelineModel.TimelineModel.TrackType = {
  MainThread: Symbol('MainThread'),
  Worker: Symbol('Worker'),
  Input: Symbol('Input'),
  Animation: Symbol('Animation'),
  Timings: Symbol('Timings'),
  Console: Symbol('Console'),
  Raster: Symbol('Raster'),
  GPU: Symbol('GPU'),
  Other: Symbol('Other'),
};

TimelineModel.TimelineModel.PageFrame = class {
  /**
   * @param {!Object} payload
   */
  constructor(payload) {
    this.frameId = payload['frame'];
    this.url = payload['url'] || '';
    this.name = payload['name'];
    /** @type {!Array<!TimelineModel.TimelineModel.PageFrame>} */
    this.children = [];
    /** @type {?TimelineModel.TimelineModel.PageFrame} */
    this.parent = null;
    /** @type {!Array<!{time: number, processId: number, processPseudoId: ?string, url: string}>} */
    this.processes = [];
    /** @type {?number} */
    this.deletedTime = null;
    // TODO(dgozman): figure this out.
    // this.ownerNode = target && payload['nodeId'] ? new SDK.DeferredDOMNode(target, payload['nodeId']) : null;
    this.ownerNode = null;
  }

  /**
   * @param {number} time
   * @param {!Object} payload
   */
  update(time, payload) {
    this.url = payload['url'] || '';
    this.name = payload['name'];
    if (payload['processId']) {
      this.processes.push(
          {time: time, processId: payload['processId'], processPseudoId: '', url: payload['url'] || ''});
    } else {
      this.processes.push(
          {time: time, processId: -1, processPseudoId: payload['processPseudoId'], url: payload['url'] || ''});
    }
  }

  /**
   * @param {string} processPseudoId
   * @param {number} processId
   */
  processReady(processPseudoId, processId) {
    for (const process of this.processes) {
      if (process.processPseudoId === processPseudoId) {
        process.processPseudoId = '';
        process.processId = processId;
      }
    }
  }

  /**
   * @param {!TimelineModel.TimelineModel.PageFrame} child
   */
  addChild(child) {
    this.children.push(child);
    child.parent = this;
  }
};

/** @typedef {!{page: !Array<!SDK.TracingModel.Event>, workers: !Array<!SDK.TracingModel.Event>}} */
TimelineModel.TimelineModel.MetadataEvents;

/**
 * @unrestricted
 */
TimelineModel.TimelineModel.NetworkRequest = class {
  /**
   * @param {!SDK.TracingModel.Event} event
   */
  constructor(event) {
    this.startTime = event.name === TimelineModel.TimelineModel.RecordType.ResourceSendRequest ? event.startTime : 0;
    this.endTime = Infinity;
    this.encodedDataLength = 0;
    this.decodedBodyLength = 0;
    /** @type {!Array<!SDK.TracingModel.Event>} */
    this.children = [];
    /** @type {?Object} */
    this.timing;
    /** @type {string} */
    this.mimeType;
    /** @type {string} */
    this.url;
    /** @type {string} */
    this.requestMethod;
    this.addEvent(event);
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   */
  addEvent(event) {
    this.children.push(event);
    const recordType = TimelineModel.TimelineModel.RecordType;
    this.startTime = Math.min(this.startTime, event.startTime);
    const eventData = event.args['data'];
    if (eventData['mimeType'])
      this.mimeType = eventData['mimeType'];
    if ('priority' in eventData)
      this.priority = eventData['priority'];
    if (event.name === recordType.ResourceFinish)
      this.endTime = event.startTime;
    if (eventData['finishTime'])
      this.finishTime = eventData['finishTime'] * 1000;
    if (!this.responseTime &&
        (event.name === recordType.ResourceReceiveResponse || event.name === recordType.ResourceReceivedData))
      this.responseTime = event.startTime;
    const encodedDataLength = eventData['encodedDataLength'] || 0;
    if (event.name === recordType.ResourceReceiveResponse) {
      if (eventData['fromCache'])
        this.fromCache = true;
      if (eventData['fromServiceWorker'])
        this.fromServiceWorker = true;
      this.encodedDataLength = encodedDataLength;
    }
    if (event.name === recordType.ResourceReceivedData)
      this.encodedDataLength += encodedDataLength;
    if (event.name === recordType.ResourceFinish && encodedDataLength)
      this.encodedDataLength = encodedDataLength;
    const decodedBodyLength = eventData['decodedBodyLength'];
    if (event.name === recordType.ResourceFinish && decodedBodyLength)
      this.decodedBodyLength = decodedBodyLength;
    if (!this.url)
      this.url = eventData['url'];
    if (!this.requestMethod)
      this.requestMethod = eventData['requestMethod'];
    if (!this.timing)
      this.timing = eventData['timing'];
    if (eventData['fromServiceWorker'])
      this.fromServiceWorker = true;
  }

  /**
   * @return {number}
   */
  beginTime() {
    return Math.min(this.startTime, this.timing && this.timing.pushStart * 1000 || Infinity);
  }
};

/**
 * @unrestricted
 */
TimelineModel.InvalidationTrackingEvent = class {
  /**
   * @param {!SDK.TracingModel.Event} event
   */
  constructor(event) {
    /** @type {string} */
    this.type = event.name;
    /** @type {number} */
    this.startTime = event.startTime;
    /** @type {!SDK.TracingModel.Event} */
    this._tracingEvent = event;

    const eventData = event.args['data'];

    /** @type {number} */
    this.frame = eventData['frame'];
    /** @type {?number} */
    this.nodeId = eventData['nodeId'];
    /** @type {?string} */
    this.nodeName = eventData['nodeName'];
    /** @type {?number} */
    this.paintId = eventData['paintId'];
    /** @type {?number} */
    this.invalidationSet = eventData['invalidationSet'];
    /** @type {?string} */
    this.invalidatedSelectorId = eventData['invalidatedSelectorId'];
    /** @type {?string} */
    this.changedId = eventData['changedId'];
    /** @type {?string} */
    this.changedClass = eventData['changedClass'];
    /** @type {?string} */
    this.changedAttribute = eventData['changedAttribute'];
    /** @type {?string} */
    this.changedPseudo = eventData['changedPseudo'];
    /** @type {?string} */
    this.selectorPart = eventData['selectorPart'];
    /** @type {?string} */
    this.extraData = eventData['extraData'];
    /** @type {?Array.<!Object.<string, number>>} */
    this.invalidationList = eventData['invalidationList'];
    /** @type {!TimelineModel.InvalidationCause} */
    this.cause = {reason: eventData['reason'], stackTrace: eventData['stackTrace']};

    // FIXME: Move this to TimelineUIUtils.js.
    if (!this.cause.reason && this.cause.stackTrace &&
        this.type === TimelineModel.TimelineModel.RecordType.LayoutInvalidationTracking)
      this.cause.reason = 'Layout forced';
  }
};

/** @typedef {{reason: string, stackTrace: ?Array<!Protocol.Runtime.CallFrame>}} */
TimelineModel.InvalidationCause;

TimelineModel.InvalidationTracker = class {
  constructor() {
    /** @type {?SDK.TracingModel.Event} */
    this._lastRecalcStyle = null;
    /** @type {?SDK.TracingModel.Event} */
    this._lastPaintWithLayer = null;
    this._didPaint = false;
    this._initializePerFrameState();
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {?Array<!TimelineModel.InvalidationTrackingEvent>}
   */
  static invalidationEventsFor(event) {
    return event[TimelineModel.InvalidationTracker._invalidationTrackingEventsSymbol] || null;
  }

  /**
   * @param {!TimelineModel.InvalidationTrackingEvent} invalidation
   */
  addInvalidation(invalidation) {
    this._startNewFrameIfNeeded();

    if (!invalidation.nodeId && !invalidation.paintId) {
      console.error('Invalidation lacks node information.');
      console.error(invalidation);
      return;
    }

    // PaintInvalidationTracking events provide a paintId and a nodeId which
    // we can use to update the paintId for all other invalidation tracking
    // events.
    const recordTypes = TimelineModel.TimelineModel.RecordType;
    if (invalidation.type === recordTypes.PaintInvalidationTracking && invalidation.nodeId) {
      const invalidations = this._invalidationsByNodeId[invalidation.nodeId] || [];
      for (let i = 0; i < invalidations.length; ++i)
        invalidations[i].paintId = invalidation.paintId;

      // PaintInvalidationTracking is only used for updating paintIds.
      return;
    }

    // Suppress StyleInvalidator StyleRecalcInvalidationTracking invalidations because they
    // will be handled by StyleInvalidatorInvalidationTracking.
    // FIXME: Investigate if we can remove StyleInvalidator invalidations entirely.
    if (invalidation.type === recordTypes.StyleRecalcInvalidationTracking &&
        invalidation.cause.reason === 'StyleInvalidator')
      return;

    // Style invalidation events can occur before and during recalc style. didRecalcStyle
    // handles style invalidations that occur before the recalc style event but we need to
    // handle style recalc invalidations during recalc style here.
    const styleRecalcInvalidation =
        (invalidation.type === recordTypes.ScheduleStyleInvalidationTracking ||
         invalidation.type === recordTypes.StyleInvalidatorInvalidationTracking ||
         invalidation.type === recordTypes.StyleRecalcInvalidationTracking);
    if (styleRecalcInvalidation) {
      const duringRecalcStyle = invalidation.startTime && this._lastRecalcStyle &&
          invalidation.startTime >= this._lastRecalcStyle.startTime &&
          invalidation.startTime <= this._lastRecalcStyle.endTime;
      if (duringRecalcStyle)
        this._associateWithLastRecalcStyleEvent(invalidation);
    }

    // Record the invalidation so later events can look it up.
    if (this._invalidations[invalidation.type])
      this._invalidations[invalidation.type].push(invalidation);
    else
      this._invalidations[invalidation.type] = [invalidation];
    if (invalidation.nodeId) {
      if (this._invalidationsByNodeId[invalidation.nodeId])
        this._invalidationsByNodeId[invalidation.nodeId].push(invalidation);
      else
        this._invalidationsByNodeId[invalidation.nodeId] = [invalidation];
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} recalcStyleEvent
   */
  didRecalcStyle(recalcStyleEvent) {
    this._lastRecalcStyle = recalcStyleEvent;
    const types = [
      TimelineModel.TimelineModel.RecordType.ScheduleStyleInvalidationTracking,
      TimelineModel.TimelineModel.RecordType.StyleInvalidatorInvalidationTracking,
      TimelineModel.TimelineModel.RecordType.StyleRecalcInvalidationTracking
    ];
    for (const invalidation of this._invalidationsOfTypes(types))
      this._associateWithLastRecalcStyleEvent(invalidation);
  }

  /**
   * @param {!TimelineModel.InvalidationTrackingEvent} invalidation
   */
  _associateWithLastRecalcStyleEvent(invalidation) {
    if (invalidation.linkedRecalcStyleEvent)
      return;

    const recordTypes = TimelineModel.TimelineModel.RecordType;
    const recalcStyleFrameId = this._lastRecalcStyle.args['beginData']['frame'];
    if (invalidation.type === recordTypes.StyleInvalidatorInvalidationTracking) {
      // Instead of calling _addInvalidationToEvent directly, we create synthetic
      // StyleRecalcInvalidationTracking events which will be added in _addInvalidationToEvent.
      this._addSyntheticStyleRecalcInvalidations(this._lastRecalcStyle, recalcStyleFrameId, invalidation);
    } else if (invalidation.type === recordTypes.ScheduleStyleInvalidationTracking) {
      // ScheduleStyleInvalidationTracking events are only used for adding information to
      // StyleInvalidatorInvalidationTracking events. See: _addSyntheticStyleRecalcInvalidations.
    } else {
      this._addInvalidationToEvent(this._lastRecalcStyle, recalcStyleFrameId, invalidation);
    }

    invalidation.linkedRecalcStyleEvent = true;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {number} frameId
   * @param {!TimelineModel.InvalidationTrackingEvent} styleInvalidatorInvalidation
   */
  _addSyntheticStyleRecalcInvalidations(event, frameId, styleInvalidatorInvalidation) {
    if (!styleInvalidatorInvalidation.invalidationList) {
      this._addSyntheticStyleRecalcInvalidation(
          styleInvalidatorInvalidation._tracingEvent, styleInvalidatorInvalidation);
      return;
    }
    if (!styleInvalidatorInvalidation.nodeId) {
      console.error('Invalidation lacks node information.');
      console.error(styleInvalidatorInvalidation);
      return;
    }
    for (let i = 0; i < styleInvalidatorInvalidation.invalidationList.length; i++) {
      const setId = styleInvalidatorInvalidation.invalidationList[i]['id'];
      let lastScheduleStyleRecalculation;
      const nodeInvalidations = this._invalidationsByNodeId[styleInvalidatorInvalidation.nodeId] || [];
      for (let j = 0; j < nodeInvalidations.length; j++) {
        const invalidation = nodeInvalidations[j];
        if (invalidation.frame !== frameId || invalidation.invalidationSet !== setId ||
            invalidation.type !== TimelineModel.TimelineModel.RecordType.ScheduleStyleInvalidationTracking)
          continue;
        lastScheduleStyleRecalculation = invalidation;
      }
      if (!lastScheduleStyleRecalculation) {
        console.error('Failed to lookup the event that scheduled a style invalidator invalidation.');
        continue;
      }
      this._addSyntheticStyleRecalcInvalidation(
          lastScheduleStyleRecalculation._tracingEvent, styleInvalidatorInvalidation);
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} baseEvent
   * @param {!TimelineModel.InvalidationTrackingEvent} styleInvalidatorInvalidation
   */
  _addSyntheticStyleRecalcInvalidation(baseEvent, styleInvalidatorInvalidation) {
    const invalidation = new TimelineModel.InvalidationTrackingEvent(baseEvent);
    invalidation.type = TimelineModel.TimelineModel.RecordType.StyleRecalcInvalidationTracking;
    if (styleInvalidatorInvalidation.cause.reason)
      invalidation.cause.reason = styleInvalidatorInvalidation.cause.reason;
    if (styleInvalidatorInvalidation.selectorPart)
      invalidation.selectorPart = styleInvalidatorInvalidation.selectorPart;

    this.addInvalidation(invalidation);
    if (!invalidation.linkedRecalcStyleEvent)
      this._associateWithLastRecalcStyleEvent(invalidation);
  }

  /**
   * @param {!SDK.TracingModel.Event} layoutEvent
   */
  didLayout(layoutEvent) {
    const layoutFrameId = layoutEvent.args['beginData']['frame'];
    for (const invalidation of this._invalidationsOfTypes(
             [TimelineModel.TimelineModel.RecordType.LayoutInvalidationTracking])) {
      if (invalidation.linkedLayoutEvent)
        continue;
      this._addInvalidationToEvent(layoutEvent, layoutFrameId, invalidation);
      invalidation.linkedLayoutEvent = true;
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} paintEvent
   */
  didPaint(paintEvent) {
    this._didPaint = true;

    // If a paint doesn't have a corresponding graphics layer id, it paints
    // into its parent so add an effectivePaintId to these events.
    const layerId = paintEvent.args['data']['layerId'];
    if (layerId)
      this._lastPaintWithLayer = paintEvent;
    // Quietly discard top-level paints without layerId, as these are likely
    // to come from overlay.
    if (!this._lastPaintWithLayer)
      return;

    const effectivePaintId = this._lastPaintWithLayer.args['data']['nodeId'];
    const paintFrameId = paintEvent.args['data']['frame'];
    const types = [
      TimelineModel.TimelineModel.RecordType.StyleRecalcInvalidationTracking,
      TimelineModel.TimelineModel.RecordType.LayoutInvalidationTracking,
      TimelineModel.TimelineModel.RecordType.PaintInvalidationTracking,
      TimelineModel.TimelineModel.RecordType.ScrollInvalidationTracking
    ];
    for (const invalidation of this._invalidationsOfTypes(types)) {
      if (invalidation.paintId === effectivePaintId)
        this._addInvalidationToEvent(paintEvent, paintFrameId, invalidation);
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {number} eventFrameId
   * @param {!TimelineModel.InvalidationTrackingEvent} invalidation
   */
  _addInvalidationToEvent(event, eventFrameId, invalidation) {
    if (eventFrameId !== invalidation.frame)
      return;
    if (!event[TimelineModel.InvalidationTracker._invalidationTrackingEventsSymbol])
      event[TimelineModel.InvalidationTracker._invalidationTrackingEventsSymbol] = [invalidation];
    else
      event[TimelineModel.InvalidationTracker._invalidationTrackingEventsSymbol].push(invalidation);
  }

  /**
   * @param {!Array.<string>=} types
   * @return {!Iterator.<!TimelineModel.InvalidationTrackingEvent>}
   */
  _invalidationsOfTypes(types) {
    const invalidations = this._invalidations;
    if (!types)
      types = Object.keys(invalidations);
    function* generator() {
      for (let i = 0; i < types.length; ++i) {
        const invalidationList = invalidations[types[i]] || [];
        for (let j = 0; j < invalidationList.length; ++j)
          yield invalidationList[j];
      }
    }
    return generator();
  }

  _startNewFrameIfNeeded() {
    if (!this._didPaint)
      return;

    this._initializePerFrameState();
  }

  _initializePerFrameState() {
    /** @type {!Object.<string, !Array.<!TimelineModel.InvalidationTrackingEvent>>} */
    this._invalidations = {};
    /** @type {!Object.<number, !Array.<!TimelineModel.InvalidationTrackingEvent>>} */
    this._invalidationsByNodeId = {};

    this._lastRecalcStyle = null;
    this._lastPaintWithLayer = null;
    this._didPaint = false;
  }
};

TimelineModel.InvalidationTracker._invalidationTrackingEventsSymbol = Symbol('invalidationTrackingEvents');

/**
 * @unrestricted
 */
TimelineModel.TimelineAsyncEventTracker = class {
  constructor() {
    TimelineModel.TimelineAsyncEventTracker._initialize();
    /** @type {!Map<!TimelineModel.TimelineModel.RecordType, !Map<string, !SDK.TracingModel.Event>>} */
    this._initiatorByType = new Map();
    for (const initiator of TimelineModel.TimelineAsyncEventTracker._asyncEvents.keys())
      this._initiatorByType.set(initiator, new Map());
  }

  static _initialize() {
    if (TimelineModel.TimelineAsyncEventTracker._asyncEvents)
      return;
    const events = new Map();
    let type = TimelineModel.TimelineModel.RecordType;

    events.set(type.TimerInstall, {causes: [type.TimerFire], joinBy: 'timerId'});
    events.set(
        type.ResourceSendRequest,
        {causes: [type.ResourceReceiveResponse, type.ResourceReceivedData, type.ResourceFinish], joinBy: 'requestId'});
    events.set(type.RequestAnimationFrame, {causes: [type.FireAnimationFrame], joinBy: 'id'});
    events.set(type.RequestIdleCallback, {causes: [type.FireIdleCallback], joinBy: 'id'});
    events.set(type.WebSocketCreate, {
      causes: [type.WebSocketSendHandshakeRequest, type.WebSocketReceiveHandshakeResponse, type.WebSocketDestroy],
      joinBy: 'identifier'
    });

    TimelineModel.TimelineAsyncEventTracker._asyncEvents = events;
    /** @type {!Map<!TimelineModel.TimelineModel.RecordType, !TimelineModel.TimelineModel.RecordType>} */
    TimelineModel.TimelineAsyncEventTracker._typeToInitiator = new Map();
    for (const entry of events) {
      const types = entry[1].causes;
      for (type of types)
        TimelineModel.TimelineAsyncEventTracker._typeToInitiator.set(type, entry[0]);
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   */
  processEvent(event) {
    let initiatorType = TimelineModel.TimelineAsyncEventTracker._typeToInitiator.get(
        /** @type {!TimelineModel.TimelineModel.RecordType} */ (event.name));
    const isInitiator = !initiatorType;
    if (!initiatorType)
      initiatorType = /** @type {!TimelineModel.TimelineModel.RecordType} */ (event.name);
    const initiatorInfo = TimelineModel.TimelineAsyncEventTracker._asyncEvents.get(initiatorType);
    if (!initiatorInfo)
      return;
    const id = TimelineModel.TimelineModel.globalEventId(event, initiatorInfo.joinBy);
    if (!id)
      return;
    /** @type {!Map<string, !SDK.TracingModel.Event>|undefined} */
    const initiatorMap = this._initiatorByType.get(initiatorType);
    if (isInitiator) {
      initiatorMap.set(id, event);
      return;
    }
    const initiator = initiatorMap.get(id) || null;
    const timelineData = TimelineModel.TimelineData.forEvent(event);
    timelineData.setInitiator(initiator);
    if (!timelineData.frameId && initiator)
      timelineData.frameId = TimelineModel.TimelineModel.eventFrameId(initiator);
  }
};


TimelineModel.TimelineData = class {
  constructor() {
    /** @type {?string} */
    this.warning = null;
    /** @type {?Element} */
    this.previewElement = null;
    /** @type {?string} */
    this.url = null;
    /** @type {number} */
    this.backendNodeId = 0;
    /** @type {?Array<!Protocol.Runtime.CallFrame>} */
    this.stackTrace = null;
    /** @type {?SDK.TracingModel.ObjectSnapshot} */
    this.picture = null;
    /** @type {?SDK.TracingModel.Event} */
    this._initiator = null;
    this.frameId = '';
    /** @type {number|undefined} */
    this.timeWaitingForMainThread;
  }

  /**
   * @param {!SDK.TracingModel.Event} initiator
   */
  setInitiator(initiator) {
    this._initiator = initiator;
    if (!initiator || this.url)
      return;
    const initiatorURL = TimelineModel.TimelineData.forEvent(initiator).url;
    if (initiatorURL)
      this.url = initiatorURL;
  }

  /**
   * @return {?SDK.TracingModel.Event}
   */
  initiator() {
    return this._initiator;
  }

  /**
   * @return {?Protocol.Runtime.CallFrame}
   */
  topFrame() {
    const stackTrace = this.stackTraceForSelfOrInitiator();
    return stackTrace && stackTrace[0] || null;
  }

  /**
   * @return {?Array<!Protocol.Runtime.CallFrame>}
   */
  stackTraceForSelfOrInitiator() {
    return this.stackTrace || (this._initiator && TimelineModel.TimelineData.forEvent(this._initiator).stackTrace);
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   * @return {!TimelineModel.TimelineData}
   */
  static forEvent(event) {
    let data = event[TimelineModel.TimelineData._symbol];
    if (!data) {
      data = new TimelineModel.TimelineData();
      event[TimelineModel.TimelineData._symbol] = data;
    }
    return data;
  }
};

TimelineModel.TimelineData._symbol = Symbol('timelineData');
