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
Layers.LayerTreeModel = class extends SDK.SDKModel {
  constructor(target) {
    super(target);
    this._layerTreeAgent = target.layerTreeAgent();
    target.registerLayerTreeDispatcher(new Layers.LayerTreeDispatcher(this));
    this._paintProfilerModel = /** @type {!SDK.PaintProfilerModel} */ (target.model(SDK.PaintProfilerModel));
    const resourceTreeModel = target.model(SDK.ResourceTreeModel);
    if (resourceTreeModel) {
      resourceTreeModel.addEventListener(
          SDK.ResourceTreeModel.Events.MainFrameNavigated, this._onMainFrameNavigated, this);
    }
    /** @type {?SDK.LayerTreeBase} */
    this._layerTree = null;
    this._throttler = new Common.Throttler(20);
  }

  disable() {
    if (!this._enabled)
      return;
    this._enabled = false;
    this._layerTreeAgent.disable();
  }

  enable() {
    if (this._enabled)
      return;
    this._enabled = true;
    this._forceEnable();
  }

  _forceEnable() {
    this._lastPaintRectByLayerId = {};
    if (!this._layerTree)
      this._layerTree = new Layers.AgentLayerTree(this);
    this._layerTreeAgent.enable();
  }

  /**
   * @return {?SDK.LayerTreeBase}
   */
  layerTree() {
    return this._layerTree;
  }

  /**
   * @param {?Array.<!Protocol.LayerTree.Layer>} layers
   */
  async _layerTreeChanged(layers) {
    if (!this._enabled)
      return;
    this._throttler.schedule(this._innerSetLayers.bind(this, layers));
  }

  /**
   * @param {?Array.<!Protocol.LayerTree.Layer>} layers
   */
  async _innerSetLayers(layers) {
    const layerTree = /** @type {!Layers.AgentLayerTree} */ (this._layerTree);

    await layerTree.setLayers(layers);

    for (const layerId in this._lastPaintRectByLayerId) {
      const lastPaintRect = this._lastPaintRectByLayerId[layerId];
      const layer = layerTree.layerById(layerId);
      if (layer)
        layer._lastPaintRect = lastPaintRect;
    }
    this._lastPaintRectByLayerId = {};

    this.dispatchEventToListeners(Layers.LayerTreeModel.Events.LayerTreeChanged);
  }

  /**
   * @param {!Protocol.LayerTree.LayerId} layerId
   * @param {!Protocol.DOM.Rect} clipRect
   */
  _layerPainted(layerId, clipRect) {
    if (!this._enabled)
      return;
    const layerTree = /** @type {!Layers.AgentLayerTree} */ (this._layerTree);
    const layer = layerTree.layerById(layerId);
    if (!layer) {
      this._lastPaintRectByLayerId[layerId] = clipRect;
      return;
    }
    layer._didPaint(clipRect);
    this.dispatchEventToListeners(Layers.LayerTreeModel.Events.LayerPainted, layer);
  }

  _onMainFrameNavigated() {
    this._layerTree = null;
    if (this._enabled)
      this._forceEnable();
  }
};

SDK.SDKModel.register(Layers.LayerTreeModel, SDK.Target.Capability.DOM, false);

/** @enum {symbol} */
Layers.LayerTreeModel.Events = {
  LayerTreeChanged: Symbol('LayerTreeChanged'),
  LayerPainted: Symbol('LayerPainted'),
};

/**
 * @unrestricted
 */
Layers.AgentLayerTree = class extends SDK.LayerTreeBase {
  /**
   * @param {!Layers.LayerTreeModel} layerTreeModel
   */
  constructor(layerTreeModel) {
    super(layerTreeModel.target());
    this._layerTreeModel = layerTreeModel;
  }

  /**
   * @param {?Array<!Protocol.LayerTree.Layer>} payload
   * @return {!Promise}
   */
  async setLayers(payload) {
    if (!payload) {
      this._innerSetLayers(payload);
      return;
    }
    const idsToResolve = new Set();
    for (let i = 0; i < payload.length; ++i) {
      const backendNodeId = payload[i].backendNodeId;
      if (!backendNodeId || this.backendNodeIdToNode().has(backendNodeId))
        continue;
      idsToResolve.add(backendNodeId);
    }
    await this.resolveBackendNodeIds(idsToResolve);
    this._innerSetLayers(payload);
  }

  /**
   * @param {?Array.<!Protocol.LayerTree.Layer>} layers
   */
  _innerSetLayers(layers) {
    this.setRoot(null);
    this.setContentRoot(null);
    // Payload will be null when not in the composited mode.
    if (!layers)
      return;
    let root;
    const oldLayersById = this._layersById;
    this._layersById = {};
    for (let i = 0; i < layers.length; ++i) {
      const layerId = layers[i].layerId;
      let layer = oldLayersById[layerId];
      if (layer)
        layer._reset(layers[i]);
      else
        layer = new Layers.AgentLayer(this._layerTreeModel, layers[i]);
      this._layersById[layerId] = layer;
      const backendNodeId = layers[i].backendNodeId;
      if (backendNodeId)
        layer._setNode(this.backendNodeIdToNode().get(backendNodeId));
      if (!this.contentRoot() && layer.drawsContent())
        this.setContentRoot(layer);
      const parentId = layer.parentId();
      if (parentId) {
        const parent = this._layersById[parentId];
        if (!parent)
          console.assert(parent, 'missing parent ' + parentId + ' for layer ' + layerId);
        parent.addChild(layer);
      } else {
        if (root)
          console.assert(false, 'Multiple root layers');
        root = layer;
      }
    }
    if (root) {
      this.setRoot(root);
      root._calculateQuad(new WebKitCSSMatrix());
    }
  }
};

/**
 * @implements {SDK.Layer}
 * @unrestricted
 */
Layers.AgentLayer = class {
  /**
   * @param {!Layers.LayerTreeModel} layerTreeModel
   * @param {!Protocol.LayerTree.Layer} layerPayload
   */
  constructor(layerTreeModel, layerPayload) {
    this._layerTreeModel = layerTreeModel;
    this._reset(layerPayload);
  }

  /**
   * @override
   * @return {string}
   */
  id() {
    return this._layerPayload.layerId;
  }

  /**
   * @override
   * @return {?string}
   */
  parentId() {
    return this._layerPayload.parentLayerId;
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
    return this._layerPayload.offsetX;
  }

  /**
   * @override
   * @return {number}
   */
  offsetY() {
    return this._layerPayload.offsetY;
  }

  /**
   * @override
   * @return {number}
   */
  width() {
    return this._layerPayload.width;
  }

  /**
   * @override
   * @return {number}
   */
  height() {
    return this._layerPayload.height;
  }

  /**
   * @override
   * @return {?Array.<number>}
   */
  transform() {
    return this._layerPayload.transform;
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
    return [
      this._layerPayload.anchorX || 0,
      this._layerPayload.anchorY || 0,
      this._layerPayload.anchorZ || 0,
    ];
  }

  /**
   * @override
   * @return {boolean}
   */
  invisible() {
    return this._layerPayload.invisible;
  }

  /**
   * @override
   * @return {number}
   */
  paintCount() {
    return this._paintCount || this._layerPayload.paintCount;
  }

  /**
   * @override
   * @return {?Protocol.DOM.Rect}
   */
  lastPaintRect() {
    return this._lastPaintRect;
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
    return this._stickyPositionConstraint;
  }

  /**
   * @override
   * @return {!Promise<!Array<string>>}
   */
  async requestCompositingReasons() {
    const reasons = await this._layerTreeModel._layerTreeAgent.compositingReasons(this.id());
    return reasons || [];
  }

  /**
   * @override
   * @return {boolean}
   */
  drawsContent() {
    return this._layerPayload.drawsContent;
  }

  /**
   * @override
   * @return {number}
   */
  gpuMemoryUsage() {
    /**
     * @const
     */
    const bytesPerPixel = 4;
    return this.drawsContent() ? this.width() * this.height() * bytesPerPixel : 0;
  }

  /**
   * @override
   * @return {!Array<!Promise<?SDK.SnapshotWithRect>>}
   */
  snapshots() {
    const promise = this._layerTreeModel._paintProfilerModel.makeSnapshot(this.id()).then(snapshot => {
      if (!snapshot)
        return null;
      return {rect: {x: 0, y: 0, width: this.width(), height: this.height()}, snapshot: snapshot};
    });
    return [promise];
  }

  /**
   * @param {!Protocol.DOM.Rect} rect
   */
  _didPaint(rect) {
    this._lastPaintRect = rect;
    this._paintCount = this.paintCount() + 1;
    this._image = null;
  }

  /**
   * @param {!Protocol.LayerTree.Layer} layerPayload
   */
  _reset(layerPayload) {
    /** @type {?SDK.DOMNode} */
    this._node = null;
    this._children = [];
    this._parent = null;
    this._paintCount = 0;
    this._layerPayload = layerPayload;
    this._image = null;
    this._scrollRects = this._layerPayload.scrollRects || [];
    this._stickyPositionConstraint = this._layerPayload.stickyPositionConstraint ?
        new SDK.Layer.StickyPositionConstraint(
            this._layerTreeModel.layerTree(), this._layerPayload.stickyPositionConstraint) :
        null;
  }

  /**
   * @param {!Array.<number>} a
   * @return {!CSSMatrix}
   */
  _matrixFromArray(a) {
    function toFixed9(x) {
      return x.toFixed(9);
    }
    return new WebKitCSSMatrix('matrix3d(' + a.map(toFixed9).join(',') + ')');
  }

  /**
   * @param {!CSSMatrix} parentTransform
   * @return {!CSSMatrix}
   */
  _calculateTransformToViewport(parentTransform) {
    const offsetMatrix = new WebKitCSSMatrix().translate(this._layerPayload.offsetX, this._layerPayload.offsetY);
    let matrix = offsetMatrix;

    if (this._layerPayload.transform) {
      const transformMatrix = this._matrixFromArray(this._layerPayload.transform);
      const anchorVector = new UI.Geometry.Vector(
          this._layerPayload.width * this.anchorPoint()[0], this._layerPayload.height * this.anchorPoint()[1],
          this.anchorPoint()[2]);
      const anchorPoint = UI.Geometry.multiplyVectorByMatrixAndNormalize(anchorVector, matrix);
      const anchorMatrix = new WebKitCSSMatrix().translate(-anchorPoint.x, -anchorPoint.y, -anchorPoint.z);
      matrix = anchorMatrix.inverse().multiply(transformMatrix.multiply(anchorMatrix.multiply(matrix)));
    }

    matrix = parentTransform.multiply(matrix);
    return matrix;
  }

  /**
   * @param {number} width
   * @param {number} height
   * @return {!Array.<number>}
   */
  _createVertexArrayForRect(width, height) {
    return [0, 0, 0, width, 0, 0, width, height, 0, 0, height, 0];
  }

  /**
   * @param {!CSSMatrix} parentTransform
   */
  _calculateQuad(parentTransform) {
    const matrix = this._calculateTransformToViewport(parentTransform);
    this._quad = [];
    const vertices = this._createVertexArrayForRect(this._layerPayload.width, this._layerPayload.height);
    for (let i = 0; i < 4; ++i) {
      const point = UI.Geometry.multiplyVectorByMatrixAndNormalize(
          new UI.Geometry.Vector(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]), matrix);
      this._quad.push(point.x, point.y);
    }

    function calculateQuadForLayer(layer) {
      layer._calculateQuad(matrix);
    }

    this._children.forEach(calculateQuadForLayer);
  }
};

/**
 * @implements {Protocol.LayerTreeDispatcher}
 * @unrestricted
 */
Layers.LayerTreeDispatcher = class {
  /**
   * @param {!Layers.LayerTreeModel} layerTreeModel
   */
  constructor(layerTreeModel) {
    this._layerTreeModel = layerTreeModel;
  }

  /**
   * @override
   * @param {!Array.<!Protocol.LayerTree.Layer>=} layers
   */
  layerTreeDidChange(layers) {
    this._layerTreeModel._layerTreeChanged(layers || null);
  }

  /**
   * @override
   * @param {!Protocol.LayerTree.LayerId} layerId
   * @param {!Protocol.DOM.Rect} clipRect
   */
  layerPainted(layerId, clipRect) {
    this._layerTreeModel._layerPainted(layerId, clipRect);
  }
};
