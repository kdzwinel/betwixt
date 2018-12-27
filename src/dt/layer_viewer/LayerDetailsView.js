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
LayerViewer.LayerDetailsView = class extends UI.Widget {
  /**
   * @param {!LayerViewer.LayerViewHost} layerViewHost
   */
  constructor(layerViewHost) {
    super(true);
    this.registerRequiredCSS('layer_viewer/layerDetailsView.css');
    this._layerViewHost = layerViewHost;
    this._layerViewHost.registerView(this);
    this._emptyWidget = new UI.EmptyWidget(Common.UIString('Select a layer to see its details'));
    this._buildContent();
  }

  /**
   * @param {?LayerViewer.LayerView.Selection} selection
   * @override
   */
  hoverObject(selection) {
  }

  /**
   * @param {?LayerViewer.LayerView.Selection} selection
   * @override
   */
  selectObject(selection) {
    this._selection = selection;
    if (this.isShowing())
      this.update();
  }

  /**
   * @param {?SDK.LayerTreeBase} layerTree
   * @override
   */
  setLayerTree(layerTree) {
  }

  /**
   * @override
   */
  wasShown() {
    super.wasShown();
    this.update();
  }

  /**
   * @param {number} index
   * @param {!Event} event
   */
  _onScrollRectClicked(index, event) {
    if (event.which !== 1)
      return;
    this._layerViewHost.selectObject(new LayerViewer.LayerView.ScrollRectSelection(this._selection.layer(), index));
  }

  _onPaintProfilerButtonClicked() {
    if (this._selection.type() === LayerViewer.LayerView.Selection.Type.Snapshot || this._selection.layer())
      this.dispatchEventToListeners(LayerViewer.LayerDetailsView.Events.PaintProfilerRequested, this._selection);
  }

  /**
   * @param {!Protocol.LayerTree.ScrollRect} scrollRect
   * @param {number} index
   */
  _createScrollRectElement(scrollRect, index) {
    if (index)
      this._scrollRectsCell.createTextChild(', ');
    const element = this._scrollRectsCell.createChild('span', 'scroll-rect');
    if (this._selection.scrollRectIndex === index)
      element.classList.add('active');
    element.textContent = Common.UIString(
        '%s %d × %d (at %d, %d)', LayerViewer.LayerDetailsView._slowScrollRectNames.get(scrollRect.type),
        scrollRect.rect.x, scrollRect.rect.y, scrollRect.rect.width, scrollRect.rect.height);
    element.addEventListener('click', this._onScrollRectClicked.bind(this, index), false);
  }

  /**
   * @param {string} title
   * @param {?SDK.Layer} layer
   * @return {string}
   */
  _formatStickyAncestorLayer(title, layer) {
    if (!layer)
      return '';

    const node = layer.nodeForSelfOrAncestor();
    const name = node ? node.simpleSelector() : Common.UIString('<unnamed>');
    return Common.UIString('%s: %s (%s)', title, name, layer.id());
  }

  /**
   * @param {string} title
   * @param {?SDK.Layer} layer
   */
  _createStickyAncestorChild(title, layer) {
    if (!layer)
      return;

    this._stickyPositionConstraintCell.createTextChild(', ');
    const child = this._stickyPositionConstraintCell.createChild('span');
    child.textContent = this._formatStickyAncestorLayer(title, layer);
  }

  /**
   * @param {?SDK.Layer.StickyPositionConstraint} constraint
   */
  _populateStickyPositionConstraintCell(constraint) {
    this._stickyPositionConstraintCell.removeChildren();
    if (!constraint)
      return;

    const stickyBoxRect = constraint.stickyBoxRect();
    const stickyBoxRectElement = this._stickyPositionConstraintCell.createChild('span');
    stickyBoxRectElement.textContent = Common.UIString(
        'Sticky Box %d × %d (at %d, %d)', stickyBoxRect.width, stickyBoxRect.height, stickyBoxRect.x, stickyBoxRect.y);

    this._stickyPositionConstraintCell.createTextChild(', ');

    const containingBlockRect = constraint.containingBlockRect();
    const containingBlockRectElement = this._stickyPositionConstraintCell.createChild('span');
    containingBlockRectElement.textContent = Common.UIString(
        'Containing Block %d × %d (at %d, %d)', containingBlockRect.width, containingBlockRect.height,
        containingBlockRect.x, containingBlockRect.y);

    this._createStickyAncestorChild(
        Common.UIString('Nearest Layer Shifting Sticky Box'), constraint.nearestLayerShiftingStickyBox());
    this._createStickyAncestorChild(
        Common.UIString('Nearest Layer Shifting Containing Block'), constraint.nearestLayerShiftingContainingBlock());
  }

  update() {
    const layer = this._selection && this._selection.layer();
    if (!layer) {
      this._tableElement.remove();
      this._paintProfilerButton.remove();
      this._emptyWidget.show(this.contentElement);
      return;
    }
    this._emptyWidget.detach();
    this.contentElement.appendChild(this._tableElement);
    this.contentElement.appendChild(this._paintProfilerButton);
    this._sizeCell.textContent =
        Common.UIString('%d × %d (at %d,%d)', layer.width(), layer.height(), layer.offsetX(), layer.offsetY());
    this._paintCountCell.parentElement.classList.toggle('hidden', !layer.paintCount());
    this._paintCountCell.textContent = layer.paintCount();
    this._memoryEstimateCell.textContent = Number.bytesToString(layer.gpuMemoryUsage());
    layer.requestCompositingReasons().then(this._updateCompositingReasons.bind(this));
    this._scrollRectsCell.removeChildren();
    layer.scrollRects().forEach(this._createScrollRectElement.bind(this));
    this._populateStickyPositionConstraintCell(layer.stickyPositionConstraint());
    const snapshot = this._selection.type() === LayerViewer.LayerView.Selection.Type.Snapshot ?
        /** @type {!LayerViewer.LayerView.SnapshotSelection} */ (this._selection).snapshot() :
        null;
    this._paintProfilerButton.classList.toggle('hidden', !snapshot);
  }

  _buildContent() {
    this._tableElement = this.contentElement.createChild('table');
    this._tbodyElement = this._tableElement.createChild('tbody');
    this._sizeCell = this._createRow(Common.UIString('Size'));
    this._compositingReasonsCell = this._createRow(Common.UIString('Compositing Reasons'));
    this._memoryEstimateCell = this._createRow(Common.UIString('Memory estimate'));
    this._paintCountCell = this._createRow(Common.UIString('Paint count'));
    this._scrollRectsCell = this._createRow(Common.UIString('Slow scroll regions'));
    this._stickyPositionConstraintCell = this._createRow(Common.UIString('Sticky position constraint'));
    this._paintProfilerButton = this.contentElement.createChild('a', 'hidden link');
    this._paintProfilerButton.textContent = Common.UIString('Paint Profiler');
    this._paintProfilerButton.addEventListener('click', this._onPaintProfilerButtonClicked.bind(this));
  }

  /**
   * @param {string} title
   */
  _createRow(title) {
    const tr = this._tbodyElement.createChild('tr');
    const titleCell = tr.createChild('td');
    titleCell.textContent = title;
    return tr.createChild('td');
  }

  /**
   * @param {!Array.<string>} compositingReasons
   */
  _updateCompositingReasons(compositingReasons) {
    if (!compositingReasons || !compositingReasons.length) {
      this._compositingReasonsCell.textContent = 'n/a';
      return;
    }
    this._compositingReasonsCell.removeChildren();
    const list = this._compositingReasonsCell.createChild('ul');
    for (let i = 0; i < compositingReasons.length; ++i) {
      let text = LayerViewer.LayerDetailsView.CompositingReasonDetail[compositingReasons[i]] || compositingReasons[i];
      // If the text is more than one word but does not terminate with period, add the period.
      if (/\s.*[^.]$/.test(text))
        text += '.';
      list.createChild('li').textContent = text;
    }
  }
};

/**
 * @enum {string}
 */
/** @enum {symbol} */
LayerViewer.LayerDetailsView.Events = {
  PaintProfilerRequested: Symbol('PaintProfilerRequested')
};

/**
 * @type {!Object.<string, string>}
 */
LayerViewer.LayerDetailsView.CompositingReasonDetail = {
  'transform3D': Common.UIString('Composition due to association with an element with a CSS 3D transform.'),
  'video': Common.UIString('Composition due to association with a <video> element.'),
  'canvas': Common.UIString('Composition due to the element being a <canvas> element.'),
  'plugin': Common.UIString('Composition due to association with a plugin.'),
  'iFrame': Common.UIString('Composition due to association with an <iframe> element.'),
  'backfaceVisibilityHidden':
      Common.UIString('Composition due to association with an element with a "backface-visibility: hidden" style.'),
  'animation': Common.UIString('Composition due to association with an animated element.'),
  'filters': Common.UIString('Composition due to association with an element with CSS filters applied.'),
  'scrollDependentPosition': Common.UIString(
      'Composition due to association with an element with a "position: fixed" or "position: sticky" style.'),
  'overflowScrollingTouch':
      Common.UIString('Composition due to association with an element with a "overflow-scrolling: touch" style.'),
  'blending':
      Common.UIString('Composition due to association with an element that has blend mode other than "normal".'),
  'assumedOverlap':
      Common.UIString('Composition due to association with an element that may overlap other composited elements.'),
  'overlap': Common.UIString('Composition due to association with an element overlapping other composited elements.'),
  'negativeZIndexChildren':
      Common.UIString('Composition due to association with an element with descendants that have a negative z-index.'),
  'transformWithCompositedDescendants':
      Common.UIString('Composition due to association with an element with composited descendants.'),
  'opacityWithCompositedDescendants': Common.UIString(
      'Composition due to association with an element with opacity applied and composited descendants.'),
  'maskWithCompositedDescendants':
      Common.UIString('Composition due to association with a masked element and composited descendants.'),
  'reflectionWithCompositedDescendants':
      Common.UIString('Composition due to association with an element with a reflection and composited descendants.'),
  'filterWithCompositedDescendants': Common.UIString(
      'Composition due to association with an element with CSS filters applied and composited descendants.'),
  'blendingWithCompositedDescendants': Common.UIString(
      'Composition due to association with an element with CSS blending applied and composited descendants.'),
  'clipsCompositingDescendants':
      Common.UIString('Composition due to association with an element clipping compositing descendants.'),
  'perspective': Common.UIString('Composition due to association with an element with perspective applied.'),
  'preserve3D':
      Common.UIString('Composition due to association with an element with a "transform-style: preserve-3d" style.'),
  'root': Common.UIString('Root layer.'),
  'layerForClip': Common.UIString('Layer for clip.'),
  'layerForScrollbar': Common.UIString('Layer for scrollbar.'),
  'layerForScrollingContainer': Common.UIString('Layer for scrolling container.'),
  'layerForForeground': Common.UIString('Layer for foreground.'),
  'layerForBackground': Common.UIString('Layer for background.'),
  'layerForMask': Common.UIString('Layer for mask.'),
  'layerForVideoOverlay': Common.UIString('Layer for video overlay.'),
};

LayerViewer.LayerDetailsView._slowScrollRectNames = new Map([
  [SDK.Layer.ScrollRectType.NonFastScrollable, Common.UIString('Non fast scrollable')],
  [SDK.Layer.ScrollRectType.TouchEventHandler, Common.UIString('Touch event handler')],
  [SDK.Layer.ScrollRectType.WheelEventHandler, Common.UIString('Wheel event handler')],
  [SDK.Layer.ScrollRectType.RepaintsOnScroll, Common.UIString('Repaints on scroll')]
]);
