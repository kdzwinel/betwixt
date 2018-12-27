/*
 * Copyright 2015 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */
/**
 * @interface
 */
LayerViewer.LayerView = function() {};

LayerViewer.LayerView.prototype = {
  /**
   * @param {?LayerViewer.LayerView.Selection} selection
   */
  hoverObject(selection) {},

  /**
   * @param {?LayerViewer.LayerView.Selection} selection
   */
  selectObject(selection) {},

  /**
   * @param {?SDK.LayerTreeBase} layerTree
   */
  setLayerTree(layerTree) {}
};

/**
 * @unrestricted
 */
LayerViewer.LayerView.Selection = class {
  /**
   * @param {!LayerViewer.LayerView.Selection.Type} type
   * @param {!SDK.Layer} layer
   */
  constructor(type, layer) {
    this._type = type;
    this._layer = layer;
  }

  /**
   * @param {?LayerViewer.LayerView.Selection} a
   * @param {?LayerViewer.LayerView.Selection} b
   * @return {boolean}
   */
  static isEqual(a, b) {
    return a && b ? a._isEqual(b) : a === b;
  }

  /**
   * @return {!LayerViewer.LayerView.Selection.Type}
   */
  type() {
    return this._type;
  }

  /**
   * @return {!SDK.Layer}
   */
  layer() {
    return this._layer;
  }

  /**
   * @param {!LayerViewer.LayerView.Selection} other
   * @return {boolean}
   */
  _isEqual(other) {
    return false;
  }
};

/**
 * @enum {symbol}
 */
LayerViewer.LayerView.Selection.Type = {
  Layer: Symbol('Layer'),
  ScrollRect: Symbol('ScrollRect'),
  Snapshot: Symbol('Snapshot')
};


/**
 * @unrestricted
 */
LayerViewer.LayerView.LayerSelection = class extends LayerViewer.LayerView.Selection {
  /**
   * @param {!SDK.Layer} layer
   */
  constructor(layer) {
    console.assert(layer, 'LayerSelection with empty layer');
    super(LayerViewer.LayerView.Selection.Type.Layer, layer);
  }

  /**
   * @override
   * @param {!LayerViewer.LayerView.Selection} other
   * @return {boolean}
   */
  _isEqual(other) {
    return other._type === LayerViewer.LayerView.Selection.Type.Layer && other.layer().id() === this.layer().id();
  }
};

/**
 * @unrestricted
 */
LayerViewer.LayerView.ScrollRectSelection = class extends LayerViewer.LayerView.Selection {
  /**
   * @param {!SDK.Layer} layer
   * @param {number} scrollRectIndex
   */
  constructor(layer, scrollRectIndex) {
    super(LayerViewer.LayerView.Selection.Type.ScrollRect, layer);
    this.scrollRectIndex = scrollRectIndex;
  }

  /**
   * @override
   * @param {!LayerViewer.LayerView.Selection} other
   * @return {boolean}
   */
  _isEqual(other) {
    return other._type === LayerViewer.LayerView.Selection.Type.ScrollRect &&
        this.layer().id() === other.layer().id() && this.scrollRectIndex === other.scrollRectIndex;
  }
};

/**
 * @unrestricted
 */
LayerViewer.LayerView.SnapshotSelection = class extends LayerViewer.LayerView.Selection {
  /**
   * @param {!SDK.Layer} layer
   * @param {!SDK.SnapshotWithRect} snapshot
   */
  constructor(layer, snapshot) {
    super(LayerViewer.LayerView.Selection.Type.Snapshot, layer);
    this._snapshot = snapshot;
  }

  /**
   * @override
   * @param {!LayerViewer.LayerView.Selection} other
   * @return {boolean}
   */
  _isEqual(other) {
    return other._type === LayerViewer.LayerView.Selection.Type.Snapshot && this.layer().id() === other.layer().id() &&
        this._snapshot === other._snapshot;
  }

  /**
   * @return {!SDK.SnapshotWithRect}
   */
  snapshot() {
    return this._snapshot;
  }
};

/**
 * @unrestricted
 */
LayerViewer.LayerViewHost = class {
  constructor() {
    /** @type {!Array.<!LayerViewer.LayerView>} */
    this._views = [];
    this._selectedObject = null;
    this._hoveredObject = null;
    this._showInternalLayersSetting = Common.settings.createSetting('layersShowInternalLayers', false);
  }

  /**
   * @param {!LayerViewer.LayerView} layerView
   */
  registerView(layerView) {
    this._views.push(layerView);
  }

  /**
   * @param {?SDK.LayerTreeBase} layerTree
   */
  setLayerTree(layerTree) {
    this._target = layerTree.target();
    const selectedLayer = this._selectedObject && this._selectedObject.layer();
    if (selectedLayer && (!layerTree || !layerTree.layerById(selectedLayer.id())))
      this.selectObject(null);
    const hoveredLayer = this._hoveredObject && this._hoveredObject.layer();
    if (hoveredLayer && (!layerTree || !layerTree.layerById(hoveredLayer.id())))
      this.hoverObject(null);
    for (const view of this._views)
      view.setLayerTree(layerTree);
  }

  /**
   * @param {?LayerViewer.LayerView.Selection} selection
   */
  hoverObject(selection) {
    if (LayerViewer.LayerView.Selection.isEqual(this._hoveredObject, selection))
      return;
    this._hoveredObject = selection;
    const layer = selection && selection.layer();
    this._toggleNodeHighlight(layer ? layer.nodeForSelfOrAncestor() : null);
    for (const view of this._views)
      view.hoverObject(selection);
  }

  /**
   * @param {?LayerViewer.LayerView.Selection} selection
   */
  selectObject(selection) {
    if (LayerViewer.LayerView.Selection.isEqual(this._selectedObject, selection))
      return;
    this._selectedObject = selection;
    for (const view of this._views)
      view.selectObject(selection);
  }

  /**
   * @return {?LayerViewer.LayerView.Selection}
   */
  selection() {
    return this._selectedObject;
  }

  /**
   * @param {!UI.ContextMenu} contextMenu
   * @param {?LayerViewer.LayerView.Selection} selection
   */
  showContextMenu(contextMenu, selection) {
    contextMenu.defaultSection().appendCheckboxItem(
        Common.UIString('Show internal layers'), this._toggleShowInternalLayers.bind(this),
        this._showInternalLayersSetting.get());
    const node = selection && selection.layer() && selection.layer().nodeForSelfOrAncestor();
    if (node)
      contextMenu.appendApplicableItems(node);
    contextMenu.show();
  }

  /**
   * @return {!Common.Setting}
   */
  showInternalLayersSetting() {
    return this._showInternalLayersSetting;
  }

  _toggleShowInternalLayers() {
    this._showInternalLayersSetting.set(!this._showInternalLayersSetting.get());
  }

  /**
   * @param {?SDK.DOMNode} node
   */
  _toggleNodeHighlight(node) {
    if (node) {
      node.highlightForTwoSeconds();
      return;
    }
    SDK.OverlayModel.hideDOMNodeHighlight();
  }
};
