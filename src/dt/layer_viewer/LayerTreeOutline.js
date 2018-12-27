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
 * @implements {LayerViewer.LayerView}
 * @unrestricted
 */
LayerViewer.LayerTreeOutline = class extends Common.Object {
  /**
   * @param {!LayerViewer.LayerViewHost} layerViewHost
   */
  constructor(layerViewHost) {
    super();
    this._layerViewHost = layerViewHost;
    this._layerViewHost.registerView(this);

    this._treeOutline = new UI.TreeOutlineInShadow();
    this._treeOutline.element.classList.add('layer-tree', 'overflow-auto');
    this._treeOutline.element.addEventListener('mousemove', this._onMouseMove.bind(this), false);
    this._treeOutline.element.addEventListener('mouseout', this._onMouseMove.bind(this), false);
    this._treeOutline.element.addEventListener('contextmenu', this._onContextMenu.bind(this), true);

    this._lastHoveredNode = null;
    this.element = this._treeOutline.element;
    this._layerViewHost.showInternalLayersSetting().addChangeListener(this._update, this);
  }

  focus() {
    this._treeOutline.focus();
  }

  /**
   * @param {?LayerViewer.LayerView.Selection} selection
   * @override
   */
  selectObject(selection) {
    this.hoverObject(null);
    const layer = selection && selection.layer();
    const node = layer && layer[LayerViewer.LayerTreeElement._symbol];
    if (node)
      node.revealAndSelect(true);
    else if (this._treeOutline.selectedTreeElement)
      this._treeOutline.selectedTreeElement.deselect();
  }

  /**
   * @param {?LayerViewer.LayerView.Selection} selection
   * @override
   */
  hoverObject(selection) {
    const layer = selection && selection.layer();
    const node = layer && layer[LayerViewer.LayerTreeElement._symbol];
    if (node === this._lastHoveredNode)
      return;
    if (this._lastHoveredNode)
      this._lastHoveredNode.setHovered(false);
    if (node)
      node.setHovered(true);
    this._lastHoveredNode = node;
  }

  /**
   * @param {?SDK.LayerTreeBase} layerTree
   * @override
   */
  setLayerTree(layerTree) {
    this._layerTree = layerTree;
    this._update();
  }

  _update() {
    const showInternalLayers = this._layerViewHost.showInternalLayersSetting().get();
    const seenLayers = new Map();
    let root = null;
    if (this._layerTree) {
      if (!showInternalLayers)
        root = this._layerTree.contentRoot();
      if (!root)
        root = this._layerTree.root();
    }

    /**
     * @param {!SDK.Layer} layer
     * @this {LayerViewer.LayerTreeOutline}
     */
    function updateLayer(layer) {
      if (!layer.drawsContent() && !showInternalLayers)
        return;
      if (seenLayers.get(layer))
        console.assert(false, 'Duplicate layer: ' + layer.id());
      seenLayers.set(layer, true);
      let node = layer[LayerViewer.LayerTreeElement._symbol];
      let parentLayer = layer.parent();
      // Skip till nearest visible ancestor.
      while (parentLayer && parentLayer !== root && !parentLayer.drawsContent() && !showInternalLayers)
        parentLayer = parentLayer.parent();
      const parent =
          layer === root ? this._treeOutline.rootElement() : parentLayer[LayerViewer.LayerTreeElement._symbol];
      if (!parent) {
        console.assert(false, 'Parent is not in the tree');
        return;
      }
      if (!node) {
        node = new LayerViewer.LayerTreeElement(this, layer);
        parent.appendChild(node);
        // Expand all new non-content layers to expose content layers better.
        if (!layer.drawsContent())
          node.expand();
      } else {
        if (node.parent !== parent) {
          const oldSelection = this._treeOutline.selectedTreeElement;
          if (node.parent)
            node.parent.removeChild(node);
          parent.appendChild(node);
          if (oldSelection !== this._treeOutline.selectedTreeElement)
            oldSelection.select();
        }
        node._update();
      }
    }
    if (root)
      this._layerTree.forEachLayer(updateLayer.bind(this), root);
    // Cleanup layers that don't exist anymore from tree.
    const rootElement = this._treeOutline.rootElement();
    for (let node = rootElement.firstChild(); node && !node.root;) {
      if (seenLayers.get(node._layer)) {
        node = node.traverseNextTreeElement(false);
      } else {
        const nextNode = node.nextSibling || node.parent;
        node.parent.removeChild(node);
        if (node === this._lastHoveredNode)
          this._lastHoveredNode = null;
        node = nextNode;
      }
    }
    if (!this._treeOutline.selectedTreeElement) {
      const elementToSelect = this._layerTree.contentRoot() || this._layerTree.root();
      if (elementToSelect)
        elementToSelect[LayerViewer.LayerTreeElement._symbol].revealAndSelect(true);
    }
  }

  /**
   * @param {!Event} event
   */
  _onMouseMove(event) {
    const node = this._treeOutline.treeElementFromEvent(event);
    if (node === this._lastHoveredNode)
      return;
    this._layerViewHost.hoverObject(this._selectionForNode(node));
  }

  /**
   * @param {!LayerViewer.LayerTreeElement} node
   */
  _selectedNodeChanged(node) {
    this._layerViewHost.selectObject(this._selectionForNode(node));
  }

  /**
   * @param {!Event} event
   */
  _onContextMenu(event) {
    const selection = this._selectionForNode(this._treeOutline.treeElementFromEvent(event));
    const contextMenu = new UI.ContextMenu(event);
    this._layerViewHost.showContextMenu(contextMenu, selection);
  }

  /**
   * @param {?UI.TreeElement} node
   * @return {?LayerViewer.LayerView.Selection}
   */
  _selectionForNode(node) {
    return node && node._layer ? new LayerViewer.LayerView.LayerSelection(node._layer) : null;
  }
};

/**
 * @unrestricted
 */
LayerViewer.LayerTreeElement = class extends UI.TreeElement {
  /**
   * @param {!LayerViewer.LayerTreeOutline} tree
   * @param {!SDK.Layer} layer
   */
  constructor(tree, layer) {
    super();
    this._treeOutline = tree;
    this._layer = layer;
    this._layer[LayerViewer.LayerTreeElement._symbol] = this;
    this._update();
  }

  _update() {
    const node = this._layer.nodeForSelfOrAncestor();
    const title = createDocumentFragment();
    title.createTextChild(node ? node.simpleSelector() : '#' + this._layer.id());
    const details = title.createChild('span', 'dimmed');
    details.textContent = Common.UIString(' (%d × %d)', this._layer.width(), this._layer.height());
    this.title = title;
  }

  /**
   * @override
   * @return {boolean}
   */
  onselect() {
    this._treeOutline._selectedNodeChanged(this);
    return false;
  }

  /**
   * @param {boolean} hovered
   */
  setHovered(hovered) {
    this.listItemElement.classList.toggle('hovered', hovered);
  }
};

LayerViewer.LayerTreeElement._symbol = Symbol('layer');
