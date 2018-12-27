// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/** @typedef {!{
        bounds: {height: number, width: number},
        children: Array.<!TimelineModel.TracingLayerPayload>,
        layer_id: number,
        position: Array.<number>,
        scroll_offset: Array.<number>,
        layer_quad: Array.<number>,
        draws_content: number,
        gpu_memory_usage: number,
        transform: Array.<number>,
        owner_node: number,
        compositing_reasons: Array.<string>
    }}
*/
TimelineModel.TracingLayerPayload;

/** @typedef {!{
        id: string,
        layer_id: string,
        gpu_memory_usage: number,
        content_rect: !Array.<number>
    }}
*/
TimelineModel.TracingLayerTile;

/**
 * @unrestricted
 */
TimelineModel.TracingLayerTree = class extends SDK.LayerTreeBase {
  /**
   * @param {?SDK.Target} target
   */
  constructor(target) {
    super(target);
    /** @type {!Map.<string, !TimelineModel.TracingLayerTile>} */
    this._tileById = new Map();
    this._paintProfilerModel = target && target.model(SDK.PaintProfilerModel);
  }

  /**
   * @param {?TimelineModel.TracingLayerPayload} root
   * @param {?Array<!TimelineModel.TracingLayerPayload>} layers
   * @param {!Array<!TimelineModel.LayerPaintEvent>} paints
   * @return {!Promise}
   */
  async setLayers(root, layers, paints) {
    const idsToResolve = new Set();
    if (root) {
      // This is a legacy code path for compatibility, as cc is removing
      // layer tree hierarchy, this code will eventually be removed.
      this._extractNodeIdsToResolve(idsToResolve, {}, root);
    } else {
      for (let i = 0; i < layers.length; ++i)
        this._extractNodeIdsToResolve(idsToResolve, {}, layers[i]);
    }

    await this.resolveBackendNodeIds(idsToResolve);

    const oldLayersById = this._layersById;
    this._layersById = {};
    this.setContentRoot(null);
    if (root) {
      const convertedLayers = this._innerSetLayers(oldLayersById, root);
      this.setRoot(convertedLayers);
    } else {
      const processedLayers = layers.map(this._innerSetLayers.bind(this, oldLayersById));
      const contentRoot = this.contentRoot();
      this.setRoot(contentRoot);
      for (let i = 0; i < processedLayers.length; ++i) {
        if (processedLayers[i].id() !== contentRoot.id())
          contentRoot.addChild(processedLayers[i]);
      }
    }
    this._setPaints(paints);
  }

  /**
   * @param {!Array.<!TimelineModel.TracingLayerTile>} tiles
   */
  setTiles(tiles) {
    this._tileById = new Map();
    for (const tile of tiles)
      this._tileById.set(tile.id, tile);
  }

  /**
   * @param {string} tileId
   * @return {!Promise<?SDK.SnapshotWithRect>}
   */
  pictureForRasterTile(tileId) {
    const tile = this._tileById.get('cc::Tile/' + tileId);
    if (!tile) {
      Common.console.error(`Tile ${tileId} is missing`);
      return /** @type {!Promise<?SDK.SnapshotWithRect>} */ (Promise.resolve(null));
    }
    const layer = this.layerById(tile.layer_id);
    if (!layer) {
      Common.console.error(`Layer ${tile.layer_id} for tile ${tileId} is not found`);
      return /** @type {!Promise<?SDK.SnapshotWithRect>} */ (Promise.resolve(null));
    }
    return layer._pictureForRect(tile.content_rect);
  }

  /**
   * @param {!Array<!TimelineModel.LayerPaintEvent>} paints
   */
  _setPaints(paints) {
    for (let i = 0; i < paints.length; ++i) {
      const layer = this._layersById[paints[i].layerId()];
      if (layer)
        layer._addPaintEvent(paints[i]);
    }
  }

  /**
   * @param {!Object<(string|number), !SDK.Layer>} oldLayersById
   * @param {!TimelineModel.TracingLayerPayload} payload
   * @return {!TimelineModel.TracingLayer}
   */
  _innerSetLayers(oldLayersById, payload) {
    let layer = /** @type {?TimelineModel.TracingLayer} */ (oldLayersById[payload.layer_id]);
    if (layer)
      layer._reset(payload);
    else
      layer = new TimelineModel.TracingLayer(this._paintProfilerModel, payload);
    this._layersById[payload.layer_id] = layer;
    if (payload.owner_node)
      layer._setNode(this.backendNodeIdToNode().get(payload.owner_node) || null);
    if (!this.contentRoot() && layer.drawsContent())
      this.setContentRoot(layer);
    for (let i = 0; payload.children && i < payload.children.length; ++i)
      layer.addChild(this._innerSetLayers(oldLayersById, payload.children[i]));
    return layer;
  }

  /**
   * @param {!Set<number>} nodeIdsToResolve
   * @param {!Object} seenNodeIds
   * @param {!TimelineModel.TracingLayerPayload} payload
   */
  _extractNodeIdsToResolve(nodeIdsToResolve, seenNodeIds, payload) {
    const backendNodeId = payload.owner_node;
    if (backendNodeId && !this.backendNodeIdToNode().has(backendNodeId))
      nodeIdsToResolve.add(backendNodeId);
    for (let i = 0; payload.children && i < payload.children.length; ++i)
      this._extractNodeIdsToResolve(nodeIdsToResolve, seenNodeIds, payload.children[i]);
  }
};

/**
 * @implements {SDK.Layer}
 * @unrestricted
 */
TimelineModel.TracingLayer = class {
  /**
   * @param {?SDK.PaintProfilerModel} paintProfilerModel
   * @param {!TimelineModel.TracingLayerPayload} payload
   */
  constructor(paintProfilerModel, payload) {
    this._paintProfilerModel = paintProfilerModel;
    this._reset(payload);
  }

  /**
   * @param {!TimelineModel.TracingLayerPayload} payload
   */
  _reset(payload) {
    /** @type {?SDK.DOMNode} */
    this._node = null;
    this._layerId = String(payload.layer_id);
    this._offsetX = payload.position[0];
    this._offsetY = payload.position[1];
    this._width = payload.bounds.width;
    this._height = payload.bounds.height;
    this._children = [];
    this._parentLayerId = null;
    this._parent = null;
    this._quad = payload.layer_quad || [];
    this._createScrollRects(payload);
    this._compositingReasons = payload.compositing_reasons || [];
    this._drawsContent = !!payload.draws_content;
    this._gpuMemoryUsage = payload.gpu_memory_usage;
    this._paints = [];
  }

  /**
   * @override
   * @return {string}
   */
  id() {
    return this._layerId;
  }

  /**
   * @override
   * @return {?string}
   */
  parentId() {
    return this._parentLayerId;
  }

  /**
   * @override
   * @return {?SDK.Layer}
   */
  parent() {
    return this._parent;
  }

  /**
   * @override
   * @return {boolean}
   */
  isRoot() {
    return !this.parentId();
  }

  /**
   * @override
   * @return {!Array.<!SDK.Layer>}
   */
  children() {
    return this._children;
  }

  /**
   * @override
   * @param {!SDK.Layer} child
   */
  addChild(child) {
    if (child._parent)
      console.assert(false, 'Child already has a parent');
    this._children.push(child);
    child._parent = this;
    child._parentLayerId = this._layerId;
  }

  /**
   * @param {?SDK.DOMNode} node
   */
  _setNode(node) {
    this._node = node;
  }

  /**
   * @override
   * @return {?SDK.DOMNode}
   */
  node() {
    return this._node;
  }

  /**
   * @override
   * @return {?SDK.DOMNode}
   */
  nodeForSelfOrAncestor() {
    for (let layer = this; layer; layer = layer._parent) {
      if (layer._node)
        return layer._node;
    }
    return null;
  }

  /**
   * @override
   * @return {number}
   */
  offsetX() {
    return this._offsetX;
  }

  /**
   * @override
   * @return {number}
   */
  offsetY() {
    return this._offsetY;
  }

  /**
   * @override
   * @return {number}
   */
  width() {
    return this._width;
  }

  /**
   * @override
   * @return {number}
   */
  height() {
    return this._height;
  }

  /**
   * @override
   * @return {?Array.<number>}
   */
  transform() {
    return null;
  }

  /**
   * @override
   * @return {!Array.<number>}
   */
  quad() {
    return this._quad;
  }

  /**
   * @override
   * @return {!Array.<number>}
   */
  anchorPoint() {
    return [0.5, 0.5, 0];
  }

  /**
   * @override
   * @return {boolean}
   */
  invisible() {
    return false;
  }

  /**
   * @override
   * @return {number}
   */
  paintCount() {
    return 0;
  }

  /**
   * @override
   * @return {?Protocol.DOM.Rect}
   */
  lastPaintRect() {
    return null;
  }

  /**
   * @override
   * @return {!Array.<!Protocol.LayerTree.ScrollRect>}
   */
  scrollRects() {
    return this._scrollRects;
  }

  /**
   * @override
   * @return {?SDK.Layer.StickyPositionConstraint}
   */
  stickyPositionConstraint() {
    // TODO(smcgruer): Provide sticky layer information in traces.
    return null;
  }

  /**
   * @override
   * @return {number}
   */
  gpuMemoryUsage() {
    return this._gpuMemoryUsage;
  }

  /**
   * @override
   * @return {!Array<!Promise<?SDK.SnapshotWithRect>>}
   */
  snapshots() {
    return this._paints.map(paint => paint.snapshotPromise().then(snapshot => {
      if (!snapshot)
        return null;
      const rect = {x: snapshot.rect[0], y: snapshot.rect[1], width: snapshot.rect[2], height: snapshot.rect[3]};
      return {rect: rect, snapshot: snapshot.snapshot};
    }));
  }

  /**
   * @param {!Array<number>} targetRect
   * @return {!Promise<?SDK.SnapshotWithRect>}
   */
  _pictureForRect(targetRect) {
    return Promise.all(this._paints.map(paint => paint.picturePromise())).then(pictures => {
      const fragments =
          pictures.filter(picture => picture && rectsOverlap(picture.rect, targetRect))
              .map(picture => ({x: picture.rect[0], y: picture.rect[1], picture: picture.serializedPicture}));
      if (!fragments.length || !this._paintProfilerModel)
        return null;
      const x0 = fragments.reduce((min, item) => Math.min(min, item.x), Infinity);
      const y0 = fragments.reduce((min, item) => Math.min(min, item.y), Infinity);
      // Rect is in layer content coordinates, make it relative to picture by offsetting to the top left corner.
      const rect = {x: targetRect[0] - x0, y: targetRect[1] - y0, width: targetRect[2], height: targetRect[3]};
      return this._paintProfilerModel.loadSnapshotFromFragments(fragments).then(
          snapshot => snapshot ? {rect: rect, snapshot: snapshot} : null);
    });

    /**
     * @param {number} a1
     * @param {number} a2
     * @param {number} b1
     * @param {number} b2
     * @return {boolean}
     */
    function segmentsOverlap(a1, a2, b1, b2) {
      console.assert(a1 <= a2 && b1 <= b2, 'segments should be specified as ordered pairs');
      return a2 > b1 && a1 < b2;
    }

    /**
     * @param {!Array.<number>} a
     * @param {!Array.<number>} b
     * @return {boolean}
     */
    function rectsOverlap(a, b) {
      return segmentsOverlap(a[0], a[0] + a[2], b[0], b[0] + b[2]) &&
          segmentsOverlap(a[1], a[1] + a[3], b[1], b[1] + b[3]);
    }
  }

  /**
   * @param {!Array.<number>} params
   * @param {string} type
   * @return {!Object}
   */
  _scrollRectsFromParams(params, type) {
    return {rect: {x: params[0], y: params[1], width: params[2], height: params[3]}, type: type};
  }

  /**
   * @param {!TimelineModel.TracingLayerPayload} payload
   */
  _createScrollRects(payload) {
    this._scrollRects = [];
    if (payload.non_fast_scrollable_region) {
      this._scrollRects.push(this._scrollRectsFromParams(
          payload.non_fast_scrollable_region, SDK.Layer.ScrollRectType.NonFastScrollable.name));
    }
    if (payload.touch_event_handler_region) {
      this._scrollRects.push(this._scrollRectsFromParams(
          payload.touch_event_handler_region, SDK.Layer.ScrollRectType.TouchEventHandler.name));
    }
    if (payload.wheel_event_handler_region) {
      this._scrollRects.push(this._scrollRectsFromParams(
          payload.wheel_event_handler_region, SDK.Layer.ScrollRectType.WheelEventHandler.name));
    }
    if (payload.scroll_event_handler_region) {
      this._scrollRects.push(this._scrollRectsFromParams(
          payload.scroll_event_handler_region, SDK.Layer.ScrollRectType.RepaintsOnScroll.name));
    }
  }

  /**
   * @param {!TimelineModel.LayerPaintEvent} paint
   */
  _addPaintEvent(paint) {
    this._paints.push(paint);
  }

  /**
   * @override
   * @return {!Promise<!Array<string>>}
   */
  requestCompositingReasons() {
    return Promise.resolve(this._compositingReasons);
  }

  /**
   * @override
   * @return {boolean}
   */
  drawsContent() {
    return this._drawsContent;
  }
};
