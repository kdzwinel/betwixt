/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
TimelineModel.TimelineFrameModel = class {
  /**
   * @param {function(!SDK.TracingModel.Event):string} categoryMapper
   */
  constructor(categoryMapper) {
    this._categoryMapper = categoryMapper;
    this.reset();
  }

  /**
   * @param {number=} startTime
   * @param {number=} endTime
   * @return {!Array<!TimelineModel.TimelineFrame>}
   */
  frames(startTime, endTime) {
    if (!startTime && !endTime)
      return this._frames;
    const firstFrame = this._frames.lowerBound(startTime || 0, (time, frame) => time - frame.endTime);
    const lastFrame = this._frames.lowerBound(endTime || Infinity, (time, frame) => time - frame.startTime);
    return this._frames.slice(firstFrame, lastFrame);
  }

  /**
   * @param {!SDK.TracingModel.Event} rasterTask
   * @return {boolean}
   */
  hasRasterTile(rasterTask) {
    const data = rasterTask.args['tileData'];
    if (!data)
      return false;
    const frameId = data['sourceFrameNumber'];
    const frame = frameId && this._frameById[frameId];
    if (!frame || !frame.layerTree)
      return false;
    return true;
  }

  /**
   * @param {!SDK.TracingModel.Event} rasterTask
   * @return Promise<?{rect: !Protocol.DOM.Rect, snapshot: !SDK.PaintProfilerSnapshot}>}
   */
  rasterTilePromise(rasterTask) {
    if (!this._target)
      return Promise.resolve(null);
    const data = rasterTask.args['tileData'];
    const frameId = data['sourceFrameNumber'];
    const tileId = data['tileId'] && data['tileId']['id_ref'];
    const frame = frameId && this._frameById[frameId];
    if (!frame || !frame.layerTree || !tileId)
      return Promise.resolve(null);

    return frame.layerTree.layerTreePromise().then(layerTree => layerTree && layerTree.pictureForRasterTile(tileId));
  }

  reset() {
    this._minimumRecordTime = Infinity;
    this._frames = [];
    this._frameById = {};
    this._lastFrame = null;
    this._lastLayerTree = null;
    this._mainFrameCommitted = false;
    this._mainFrameRequested = false;
    this._framePendingCommit = null;
    this._lastBeginFrame = null;
    this._lastNeedsBeginFrame = null;
    this._framePendingActivation = null;
    this._lastTaskBeginTime = null;
    this._target = null;
    this._layerTreeId = null;
    this._currentTaskTimeByCategory = {};
  }

  /**
   * @param {number} startTime
   */
  handleBeginFrame(startTime) {
    if (!this._lastFrame)
      this._startFrame(startTime);
    this._lastBeginFrame = startTime;
  }

  /**
   * @param {number} startTime
   */
  handleDrawFrame(startTime) {
    if (!this._lastFrame) {
      this._startFrame(startTime);
      return;
    }

    // - if it wasn't drawn, it didn't happen!
    // - only show frames that either did not wait for the main thread frame or had one committed.
    if (this._mainFrameCommitted || !this._mainFrameRequested) {
      if (this._lastNeedsBeginFrame) {
        const idleTimeEnd = this._framePendingActivation ? this._framePendingActivation.triggerTime :
                                                           (this._lastBeginFrame || this._lastNeedsBeginFrame);
        if (idleTimeEnd > this._lastFrame.startTime) {
          this._lastFrame.idle = true;
          this._startFrame(idleTimeEnd);
          if (this._framePendingActivation)
            this._commitPendingFrame();
          this._lastBeginFrame = null;
        }
        this._lastNeedsBeginFrame = null;
      }
      this._startFrame(startTime);
    }
    this._mainFrameCommitted = false;
  }

  handleActivateLayerTree() {
    if (!this._lastFrame)
      return;
    if (this._framePendingActivation && !this._lastNeedsBeginFrame)
      this._commitPendingFrame();
  }

  handleRequestMainThreadFrame() {
    if (!this._lastFrame)
      return;
    this._mainFrameRequested = true;
  }

  handleCompositeLayers() {
    if (!this._framePendingCommit)
      return;
    this._framePendingActivation = this._framePendingCommit;
    this._framePendingCommit = null;
    this._mainFrameRequested = false;
    this._mainFrameCommitted = true;
  }

  /**
   * @param {!TimelineModel.TracingFrameLayerTree} layerTree
   */
  handleLayerTreeSnapshot(layerTree) {
    this._lastLayerTree = layerTree;
  }

  /**
   * @param {number} startTime
   * @param {boolean} needsBeginFrame
   */
  handleNeedFrameChanged(startTime, needsBeginFrame) {
    if (needsBeginFrame)
      this._lastNeedsBeginFrame = startTime;
  }

  /**
   * @param {number} startTime
   */
  _startFrame(startTime) {
    if (this._lastFrame)
      this._flushFrame(this._lastFrame, startTime);
    this._lastFrame = new TimelineModel.TimelineFrame(startTime, startTime - this._minimumRecordTime);
  }

  /**
   * @param {!TimelineModel.TimelineFrame} frame
   * @param {number} endTime
   */
  _flushFrame(frame, endTime) {
    frame._setLayerTree(this._lastLayerTree);
    frame._setEndTime(endTime);
    if (this._lastLayerTree)
      this._lastLayerTree._setPaints(frame._paints);
    if (this._frames.length &&
        (frame.startTime !== this._frames.peekLast().endTime || frame.startTime > frame.endTime)) {
      console.assert(
          false, `Inconsistent frame time for frame ${this._frames.length} (${frame.startTime} - ${frame.endTime})`);
    }
    this._frames.push(frame);
    if (typeof frame._mainFrameId === 'number')
      this._frameById[frame._mainFrameId] = frame;
  }

  _commitPendingFrame() {
    this._lastFrame._addTimeForCategories(this._framePendingActivation.timeByCategory);
    this._lastFrame._paints = this._framePendingActivation.paints;
    this._lastFrame._mainFrameId = this._framePendingActivation.mainFrameId;
    this._framePendingActivation = null;
  }

  /**
   * @param {?SDK.Target} target
   * @param {!Array.<!SDK.TracingModel.Event>} events
   * @param {!Array<!{thread: !SDK.TracingModel.Thread, time: number}>} threadData
   */
  addTraceEvents(target, events, threadData) {
    this._target = target;
    let j = 0;
    this._currentProcessMainThread = threadData.length && threadData[0].thread || null;
    for (let i = 0; i < events.length; ++i) {
      while (j + 1 < threadData.length && threadData[j + 1].time <= events[i].startTime)
        this._currentProcessMainThread = threadData[++j].thread;
      this._addTraceEvent(events[i]);
    }
    this._currentProcessMainThread = null;
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   */
  _addTraceEvent(event) {
    const eventNames = TimelineModel.TimelineModel.RecordType;
    if (event.startTime && event.startTime < this._minimumRecordTime)
      this._minimumRecordTime = event.startTime;

    if (event.name === eventNames.SetLayerTreeId) {
      this._layerTreeId = event.args['layerTreeId'] || event.args['data']['layerTreeId'];
    } else if (
        event.phase === SDK.TracingModel.Phase.SnapshotObject && event.name === eventNames.LayerTreeHostImplSnapshot &&
        parseInt(event.id, 0) === this._layerTreeId) {
      const snapshot = /** @type {!SDK.TracingModel.ObjectSnapshot} */ (event);
      this.handleLayerTreeSnapshot(new TimelineModel.TracingFrameLayerTree(this._target, snapshot));
    } else {
      this._processCompositorEvents(event);
      if (event.thread === this._currentProcessMainThread)
        this._addMainThreadTraceEvent(event);
      else if (this._lastFrame && event.selfTime && !SDK.TracingModel.isTopLevelEvent(event))
        this._lastFrame._addTimeForCategory(this._categoryMapper(event), event.selfTime);
    }
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   */
  _processCompositorEvents(event) {
    const eventNames = TimelineModel.TimelineModel.RecordType;

    if (event.args['layerTreeId'] !== this._layerTreeId)
      return;

    const timestamp = event.startTime;
    if (event.name === eventNames.BeginFrame)
      this.handleBeginFrame(timestamp);
    else if (event.name === eventNames.DrawFrame)
      this.handleDrawFrame(timestamp);
    else if (event.name === eventNames.ActivateLayerTree)
      this.handleActivateLayerTree();
    else if (event.name === eventNames.RequestMainThreadFrame)
      this.handleRequestMainThreadFrame();
    else if (event.name === eventNames.NeedsBeginFrameChanged)
      this.handleNeedFrameChanged(timestamp, event.args['data'] && event.args['data']['needsBeginFrame']);
  }

  /**
   * @param {!SDK.TracingModel.Event} event
   */
  _addMainThreadTraceEvent(event) {
    const eventNames = TimelineModel.TimelineModel.RecordType;

    if (SDK.TracingModel.isTopLevelEvent(event)) {
      this._currentTaskTimeByCategory = {};
      this._lastTaskBeginTime = event.startTime;
    }
    if (!this._framePendingCommit && TimelineModel.TimelineFrameModel._mainFrameMarkers.indexOf(event.name) >= 0) {
      this._framePendingCommit =
          new TimelineModel.PendingFrame(this._lastTaskBeginTime || event.startTime, this._currentTaskTimeByCategory);
    }
    if (!this._framePendingCommit) {
      this._addTimeForCategory(this._currentTaskTimeByCategory, event);
      return;
    }
    this._addTimeForCategory(this._framePendingCommit.timeByCategory, event);

    if (event.name === eventNames.BeginMainThreadFrame && event.args['data'] && event.args['data']['frameId'])
      this._framePendingCommit.mainFrameId = event.args['data']['frameId'];
    if (event.name === eventNames.Paint && event.args['data']['layerId'] &&
        TimelineModel.TimelineData.forEvent(event).picture && this._target)
      this._framePendingCommit.paints.push(new TimelineModel.LayerPaintEvent(event, this._target));
    if (event.name === eventNames.CompositeLayers && event.args['layerTreeId'] === this._layerTreeId)
      this.handleCompositeLayers();
  }

  /**
   * @param {!Object.<string, number>} timeByCategory
   * @param {!SDK.TracingModel.Event} event
   */
  _addTimeForCategory(timeByCategory, event) {
    if (!event.selfTime)
      return;
    const categoryName = this._categoryMapper(event);
    timeByCategory[categoryName] = (timeByCategory[categoryName] || 0) + event.selfTime;
  }
};

TimelineModel.TimelineFrameModel._mainFrameMarkers = [
  TimelineModel.TimelineModel.RecordType.ScheduleStyleRecalculation,
  TimelineModel.TimelineModel.RecordType.InvalidateLayout, TimelineModel.TimelineModel.RecordType.BeginMainThreadFrame,
  TimelineModel.TimelineModel.RecordType.ScrollLayer
];

/**
 * @unrestricted
 */
TimelineModel.TracingFrameLayerTree = class {
  /**
   * @param {!SDK.Target} target
   * @param {!SDK.TracingModel.ObjectSnapshot} snapshot
   */
  constructor(target, snapshot) {
    this._target = target;
    this._snapshot = snapshot;
    /** @type {!Array<!TimelineModel.LayerPaintEvent>|undefined} */
    this._paints;
  }

  /**
   * @return {!Promise<?TimelineModel.TracingLayerTree>}
   */
  async layerTreePromise() {
    const result = await this._snapshot.objectPromise();
    if (!result)
      return null;
    const viewport = result['device_viewport_size'];
    const tiles = result['active_tiles'];
    const rootLayer = result['active_tree']['root_layer'];
    const layers = result['active_tree']['layers'];
    const layerTree = new TimelineModel.TracingLayerTree(this._target);
    layerTree.setViewportSize(viewport);
    layerTree.setTiles(tiles);

    await layerTree.setLayers(rootLayer, layers, this._paints || []);
    return layerTree;
  }

  /**
   * @return {!Array<!TimelineModel.LayerPaintEvent>}
   */
  paints() {
    return this._paints || [];
  }

  /**
   * @param {!Array<!TimelineModel.LayerPaintEvent>} paints
   */
  _setPaints(paints) {
    this._paints = paints;
  }
};

/**
 * @unrestricted
 */
TimelineModel.TimelineFrame = class {
  /**
   * @param {number} startTime
   * @param {number} startTimeOffset
   */
  constructor(startTime, startTimeOffset) {
    this.startTime = startTime;
    this.startTimeOffset = startTimeOffset;
    this.endTime = this.startTime;
    this.duration = 0;
    this.timeByCategory = {};
    this.cpuTime = 0;
    this.idle = false;
    /** @type {?TimelineModel.TracingFrameLayerTree} */
    this.layerTree = null;
    /** @type {!Array.<!TimelineModel.LayerPaintEvent>} */
    this._paints = [];
    /** @type {number|undefined} */
    this._mainFrameId = undefined;
  }

  /**
   * @return {boolean}
   */
  hasWarnings() {
    return false;
  }

  /**
   * @param {number} endTime
   */
  _setEndTime(endTime) {
    this.endTime = endTime;
    this.duration = this.endTime - this.startTime;
  }

  /**
   * @param {?TimelineModel.TracingFrameLayerTree} layerTree
   */
  _setLayerTree(layerTree) {
    this.layerTree = layerTree;
  }

  /**
   * @param {!Object} timeByCategory
   */
  _addTimeForCategories(timeByCategory) {
    for (const category in timeByCategory)
      this._addTimeForCategory(category, timeByCategory[category]);
  }

  /**
   * @param {string} category
   * @param {number} time
   */
  _addTimeForCategory(category, time) {
    this.timeByCategory[category] = (this.timeByCategory[category] || 0) + time;
    this.cpuTime += time;
  }
};

/**
 * @unrestricted
 */
TimelineModel.LayerPaintEvent = class {
  /**
   * @param {!SDK.TracingModel.Event} event
   * @param {?SDK.Target} target
   */
  constructor(event, target) {
    this._event = event;
    this._target = target;
  }

  /**
   * @return {string}
   */
  layerId() {
    return this._event.args['data']['layerId'];
  }

  /**
   * @return {!SDK.TracingModel.Event}
   */
  event() {
    return this._event;
  }

  /**
   * @return {!Promise<?{rect: !Array<number>, serializedPicture: string}>}
   */
  picturePromise() {
    const picture = TimelineModel.TimelineData.forEvent(this._event).picture;
    return picture.objectPromise().then(result => {
      if (!result)
        return null;
      const rect = result['params'] && result['params']['layer_rect'];
      const picture = result['skp64'];
      return rect && picture ? {rect: rect, serializedPicture: picture} : null;
    });
  }

  /**
   * @return !Promise<?{rect: !Array<number>, snapshot: !SDK.PaintProfilerSnapshot}>}
   */
  snapshotPromise() {
    const paintProfilerModel = this._target && this._target.model(SDK.PaintProfilerModel);
    return this.picturePromise().then(picture => {
      if (!picture || !paintProfilerModel)
        return null;
      return paintProfilerModel.loadSnapshot(picture.serializedPicture)
          .then(snapshot => snapshot ? {rect: picture.rect, snapshot: snapshot} : null);
    });
  }
};

/**
 * @unrestricted
 */
TimelineModel.PendingFrame = class {
  /**
   * @param {number} triggerTime
   * @param {!Object.<string, number>} timeByCategory
   */
  constructor(triggerTime, timeByCategory) {
    /** @type {!Object.<string, number>} */
    this.timeByCategory = timeByCategory;
    /** @type {!Array.<!TimelineModel.LayerPaintEvent>} */
    this.paints = [];
    /** @type {number|undefined} */
    this.mainFrameId = undefined;
    this.triggerTime = triggerTime;
  }
};
