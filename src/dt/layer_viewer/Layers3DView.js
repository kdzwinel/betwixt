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
 * @implements {LayerViewer.LayerView}
 * @unrestricted
 */
LayerViewer.Layers3DView = class extends UI.VBox {
  /**
   * @param {!LayerViewer.LayerViewHost} layerViewHost
   */
  constructor(layerViewHost) {
    super(true);
    this.registerRequiredCSS('layer_viewer/layers3DView.css');
    this.contentElement.classList.add('layers-3d-view');
    this._failBanner = new UI.VBox();
    this._failBanner.element.classList.add('full-widget-dimmed-banner');
    this._failBanner.element.createTextChild(Common.UIString('Layer information is not yet available.'));

    this._layerViewHost = layerViewHost;
    this._layerViewHost.registerView(this);

    this._transformController = new LayerViewer.TransformController(this.contentElement);
    this._transformController.addEventListener(
        LayerViewer.TransformController.Events.TransformChanged, this._update, this);
    this._initToolbar();

    this._canvasElement = this.contentElement.createChild('canvas');
    this._canvasElement.tabIndex = 0;
    this._canvasElement.addEventListener('dblclick', this._onDoubleClick.bind(this), false);
    this._canvasElement.addEventListener('mousedown', this._onMouseDown.bind(this), false);
    this._canvasElement.addEventListener('mouseup', this._onMouseUp.bind(this), false);
    this._canvasElement.addEventListener('mouseleave', this._onMouseMove.bind(this), false);
    this._canvasElement.addEventListener('mousemove', this._onMouseMove.bind(this), false);
    this._canvasElement.addEventListener('contextmenu', this._onContextMenu.bind(this), false);

    this._lastSelection = {};
    this._layerTree = null;

    this._textureManager = new LayerViewer.LayerTextureManager(this._update.bind(this));

    /** @type Array.<!WebGLTexture|undefined> */
    this._chromeTextures = [];
    this._rects = [];

    this._layerViewHost.showInternalLayersSetting().addChangeListener(this._update, this);
  }

  /**
   * @param {?SDK.LayerTreeBase} layerTree
   * @override
   */
  setLayerTree(layerTree) {
    this._layerTree = layerTree;
    this._layerTexture = null;
    delete this._oldTextureScale;
    if (this._showPaints())
      this._textureManager.setLayerTree(layerTree);
    this._update();
  }

  /**
   * @param {!SDK.Layer} layer
   * @param {string=} imageURL
   */
  showImageForLayer(layer, imageURL) {
    if (!imageURL) {
      this._layerTexture = null;
      this._update();
      return;
    }
    UI.loadImage(imageURL).then(image => {
      const texture = image && LayerViewer.LayerTextureManager._createTextureForImage(this._gl, image);
      this._layerTexture = texture ? {layer: layer, texture: texture} : null;
      this._update();
    });
  }

  /**
   * @override
   */
  onResize() {
    this._resizeCanvas();
    this._update();
  }

  /**
   * @override
   */
  willHide() {
    this._textureManager.suspend();
  }

  /**
   * @override
   */
  wasShown() {
    this._textureManager.resume();
    if (!this._needsUpdate)
      return;
    this._resizeCanvas();
    this._update();
  }

  /**
   * @param {!SDK.Layer} layer
   */
  updateLayerSnapshot(layer) {
    this._textureManager.layerNeedsUpdate(layer);
  }

  /**
   * @param {!LayerViewer.Layers3DView.OutlineType} type
   * @param {?LayerViewer.LayerView.Selection} selection
   */
  _setOutline(type, selection) {
    this._lastSelection[type] = selection;
    this._update();
  }

  /**
   * @param {?LayerViewer.LayerView.Selection} selection
   * @override
   */
  hoverObject(selection) {
    this._setOutline(LayerViewer.Layers3DView.OutlineType.Hovered, selection);
  }

  /**
   * @param {?LayerViewer.LayerView.Selection} selection
   * @override
   */
  selectObject(selection) {
    this._setOutline(LayerViewer.Layers3DView.OutlineType.Hovered, null);
    this._setOutline(LayerViewer.Layers3DView.OutlineType.Selected, selection);
  }

  /**
   * @param {!LayerViewer.LayerView.Selection} selection
   * @return {!Promise<?SDK.SnapshotWithRect>}
   */
  snapshotForSelection(selection) {
    if (selection.type() === LayerViewer.LayerView.Selection.Type.Snapshot) {
      const snapshotWithRect = /** @type {!LayerViewer.LayerView.SnapshotSelection} */ (selection).snapshot();
      snapshotWithRect.snapshot.addReference();
      return /** @type {!Promise<?SDK.SnapshotWithRect>} */ (Promise.resolve(snapshotWithRect));
    }
    if (selection.layer()) {
      const promise = selection.layer().snapshots()[0];
      if (promise)
        return promise;
    }
    return /** @type {!Promise<?SDK.SnapshotWithRect>} */ (Promise.resolve(null));
  }

  /**
   * @param {!Element} canvas
   * @return {?WebGLRenderingContext}
   */
  _initGL(canvas) {
    const gl = canvas.getContext('webgl');
    if (!gl)
      return null;
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.enable(gl.DEPTH_TEST);
    return gl;
  }

  /**
   * @param {!Object} type
   * @param {string} script
   */
  _createShader(type, script) {
    const shader = this._gl.createShader(type);
    this._gl.shaderSource(shader, script);
    this._gl.compileShader(shader);
    this._gl.attachShader(this._shaderProgram, shader);
  }

  _initShaders() {
    this._shaderProgram = this._gl.createProgram();
    this._createShader(this._gl.FRAGMENT_SHADER, LayerViewer.Layers3DView.FragmentShader);
    this._createShader(this._gl.VERTEX_SHADER, LayerViewer.Layers3DView.VertexShader);
    this._gl.linkProgram(this._shaderProgram);
    this._gl.useProgram(this._shaderProgram);

    this._shaderProgram.vertexPositionAttribute = this._gl.getAttribLocation(this._shaderProgram, 'aVertexPosition');
    this._gl.enableVertexAttribArray(this._shaderProgram.vertexPositionAttribute);
    this._shaderProgram.vertexColorAttribute = this._gl.getAttribLocation(this._shaderProgram, 'aVertexColor');
    this._gl.enableVertexAttribArray(this._shaderProgram.vertexColorAttribute);
    this._shaderProgram.textureCoordAttribute = this._gl.getAttribLocation(this._shaderProgram, 'aTextureCoord');
    this._gl.enableVertexAttribArray(this._shaderProgram.textureCoordAttribute);

    this._shaderProgram.pMatrixUniform = this._gl.getUniformLocation(this._shaderProgram, 'uPMatrix');
    this._shaderProgram.samplerUniform = this._gl.getUniformLocation(this._shaderProgram, 'uSampler');
  }

  _resizeCanvas() {
    this._canvasElement.width = this._canvasElement.offsetWidth * window.devicePixelRatio;
    this._canvasElement.height = this._canvasElement.offsetHeight * window.devicePixelRatio;
  }

  _updateTransformAndConstraints() {
    const paddingFraction = 0.1;
    const viewport = this._layerTree.viewportSize();
    const baseWidth = viewport ? viewport.width : this._dimensionsForAutoscale.width;
    const baseHeight = viewport ? viewport.height : this._dimensionsForAutoscale.height;
    const canvasWidth = this._canvasElement.width;
    const canvasHeight = this._canvasElement.height;
    const paddingX = canvasWidth * paddingFraction;
    const paddingY = canvasHeight * paddingFraction;
    const scaleX = (canvasWidth - 2 * paddingX) / baseWidth;
    const scaleY = (canvasHeight - 2 * paddingY) / baseHeight;
    const viewScale = Math.min(scaleX, scaleY);
    const minScaleConstraint =
        Math.min(baseWidth / this._dimensionsForAutoscale.width, baseHeight / this._dimensionsForAutoscale.width) / 2;
    this._transformController.setScaleConstraints(
        minScaleConstraint,
        10 / viewScale);  // 1/viewScale is 1:1 in terms of pixels, so allow zooming to 10x of native size
    const scale = this._transformController.scale();
    const rotateX = this._transformController.rotateX();
    const rotateY = this._transformController.rotateY();

    this._scale = scale * viewScale;
    const textureScale = Number.constrain(this._scale, 0.1, 1);
    if (textureScale !== this._oldTextureScale) {
      this._oldTextureScale = textureScale;
      this._textureManager.setScale(textureScale);
      this.dispatchEventToListeners(LayerViewer.Layers3DView.Events.ScaleChanged, textureScale);
    }
    const scaleAndRotationMatrix = new WebKitCSSMatrix()
                                       .scale(scale, scale, scale)
                                       .translate(canvasWidth / 2, canvasHeight / 2, 0)
                                       .rotate(rotateX, rotateY, 0)
                                       .scale(viewScale, viewScale, viewScale)
                                       .translate(-baseWidth / 2, -baseHeight / 2, 0);

    let bounds;
    for (let i = 0; i < this._rects.length; ++i)
      bounds = UI.Geometry.boundsForTransformedPoints(scaleAndRotationMatrix, this._rects[i].vertices, bounds);

    this._transformController.clampOffsets(
        (paddingX - bounds.maxX) / window.devicePixelRatio,
        (canvasWidth - paddingX - bounds.minX) / window.devicePixelRatio,
        (paddingY - bounds.maxY) / window.devicePixelRatio,
        (canvasHeight - paddingY - bounds.minY) / window.devicePixelRatio);
    const offsetX = this._transformController.offsetX() * window.devicePixelRatio;
    const offsetY = this._transformController.offsetY() * window.devicePixelRatio;
    // Multiply to translation matrix on the right rather than translate (which would implicitly multiply on the left).
    this._projectionMatrix = new WebKitCSSMatrix().translate(offsetX, offsetY, 0).multiply(scaleAndRotationMatrix);

    const glProjectionMatrix = new WebKitCSSMatrix()
                                   .scale(1, -1, -1)
                                   .translate(-1, -1, 0)
                                   .scale(2 / this._canvasElement.width, 2 / this._canvasElement.height, 1 / 1000000)
                                   .multiply(this._projectionMatrix);
    this._gl.uniformMatrix4fv(this._shaderProgram.pMatrixUniform, false, this._arrayFromMatrix(glProjectionMatrix));
  }

  /**
   * @param {!CSSMatrix} m
   * @return {!Float32Array}
   */
  _arrayFromMatrix(m) {
    return new Float32Array([
      m.m11, m.m12, m.m13, m.m14, m.m21, m.m22, m.m23, m.m24, m.m31, m.m32, m.m33, m.m34, m.m41, m.m42, m.m43, m.m44
    ]);
  }

  _initWhiteTexture() {
    this._whiteTexture = this._gl.createTexture();
    this._gl.bindTexture(this._gl.TEXTURE_2D, this._whiteTexture);
    const whitePixel = new Uint8Array([255, 255, 255, 255]);
    this._gl.texImage2D(
        this._gl.TEXTURE_2D, 0, this._gl.RGBA, 1, 1, 0, this._gl.RGBA, this._gl.UNSIGNED_BYTE, whitePixel);
  }

  _initChromeTextures() {
    /**
     * @this {LayerViewer.Layers3DView}
     * @param {!LayerViewer.Layers3DView.ChromeTexture} index
     * @param {string} url
     */
    function loadChromeTexture(index, url) {
      UI.loadImage(url).then(image => {
        this._chromeTextures[index] =
            image && LayerViewer.LayerTextureManager._createTextureForImage(this._gl, image) || undefined;
      });
    }
    loadChromeTexture.call(this, LayerViewer.Layers3DView.ChromeTexture.Left, 'Images/chromeLeft.png');
    loadChromeTexture.call(this, LayerViewer.Layers3DView.ChromeTexture.Middle, 'Images/chromeMiddle.png');
    loadChromeTexture.call(this, LayerViewer.Layers3DView.ChromeTexture.Right, 'Images/chromeRight.png');
  }

  /**
   * @return {?WebGLRenderingContext}
   */
  _initGLIfNecessary() {
    if (this._gl)
      return this._gl;
    this._gl = this._initGL(this._canvasElement);
    if (!this._gl)
      return null;
    this._initShaders();
    this._initWhiteTexture();
    this._initChromeTextures();
    this._textureManager.setContext(this._gl);
    return this._gl;
  }

  _calculateDepthsAndVisibility() {
    this._depthByLayerId = {};
    let depth = 0;
    const showInternalLayers = this._layerViewHost.showInternalLayersSetting().get();
    const root =
        showInternalLayers ? this._layerTree.root() : (this._layerTree.contentRoot() || this._layerTree.root());
    const queue = [root];
    this._depthByLayerId[root.id()] = 0;
    /** @type {!Set<!SDK.Layer>} */
    this._visibleLayers = new Set();
    while (queue.length > 0) {
      const layer = queue.shift();
      if (showInternalLayers || layer.drawsContent())
        this._visibleLayers.add(layer);
      const children = layer.children();
      for (let i = 0; i < children.length; ++i) {
        this._depthByLayerId[children[i].id()] = ++depth;
        queue.push(children[i]);
      }
    }
    this._maxDepth = depth;
  }

  /**
   * @param {!SDK.Layer} layer
   * @return {number}
   */
  _depthForLayer(layer) {
    return this._depthByLayerId[layer.id()] * LayerViewer.Layers3DView.LayerSpacing;
  }

  /**
   * @param {!SDK.Layer} layer
   * @param {number} index
   * @return {number}
   */
  _calculateScrollRectDepth(layer, index) {
    return this._depthForLayer(layer) + index * LayerViewer.Layers3DView.ScrollRectSpacing + 1;
  }

  /**
   * @param {!SDK.Layer} layer
   */
  _updateDimensionsForAutoscale(layer) {
    // We don't want to be precise, but rather pick something least affected by
    // animationtransforms, so that we don't change scale too often. So let's
    // disregard transforms, scrolling and relative layer positioning and choose
    // the largest dimensions of all layers.
    this._dimensionsForAutoscale.width = Math.max(layer.width(), this._dimensionsForAutoscale.width);
    this._dimensionsForAutoscale.height = Math.max(layer.height(), this._dimensionsForAutoscale.height);
  }

  /**
   * @param {!SDK.Layer} layer
   */
  _calculateLayerRect(layer) {
    if (!this._visibleLayers.has(layer))
      return;
    const selection = new LayerViewer.LayerView.LayerSelection(layer);
    const rect = new LayerViewer.Layers3DView.Rectangle(selection);
    rect.setVertices(layer.quad(), this._depthForLayer(layer));
    this._appendRect(rect);
    this._updateDimensionsForAutoscale(layer);
  }

  /**
   * @param {!LayerViewer.Layers3DView.Rectangle} rect
   */
  _appendRect(rect) {
    const selection = rect.relatedObject;
    const isSelected = LayerViewer.LayerView.Selection.isEqual(
        this._lastSelection[LayerViewer.Layers3DView.OutlineType.Selected], selection);
    const isHovered = LayerViewer.LayerView.Selection.isEqual(
        this._lastSelection[LayerViewer.Layers3DView.OutlineType.Hovered], selection);
    if (isSelected) {
      rect.borderColor = LayerViewer.Layers3DView.SelectedBorderColor;
    } else if (isHovered) {
      rect.borderColor = LayerViewer.Layers3DView.HoveredBorderColor;
      const fillColor = rect.fillColor || [255, 255, 255, 1];
      const maskColor = LayerViewer.Layers3DView.HoveredImageMaskColor;
      rect.fillColor = [
        fillColor[0] * maskColor[0] / 255, fillColor[1] * maskColor[1] / 255, fillColor[2] * maskColor[2] / 255,
        fillColor[3] * maskColor[3]
      ];
    } else {
      rect.borderColor = LayerViewer.Layers3DView.BorderColor;
    }
    rect.lineWidth = isSelected ? LayerViewer.Layers3DView.SelectedBorderWidth : LayerViewer.Layers3DView.BorderWidth;
    this._rects.push(rect);
  }

  /**
   * @param {!SDK.Layer} layer
   */
  _calculateLayerScrollRects(layer) {
    const scrollRects = layer.scrollRects();
    for (let i = 0; i < scrollRects.length; ++i) {
      const selection = new LayerViewer.LayerView.ScrollRectSelection(layer, i);
      const rect = new LayerViewer.Layers3DView.Rectangle(selection);
      rect.calculateVerticesFromRect(layer, scrollRects[i].rect, this._calculateScrollRectDepth(layer, i));
      rect.fillColor = LayerViewer.Layers3DView.ScrollRectBackgroundColor;
      this._appendRect(rect);
    }
  }

  /**
   * @param {!SDK.Layer} layer
   */
  _calculateLayerTileRects(layer) {
    const tiles = this._textureManager.tilesForLayer(layer);
    for (let i = 0; i < tiles.length; ++i) {
      const tile = tiles[i];
      if (!tile.texture)
        continue;
      const selection = new LayerViewer.LayerView.SnapshotSelection(layer, {rect: tile.rect, snapshot: tile.snapshot});
      const rect = new LayerViewer.Layers3DView.Rectangle(selection);
      rect.calculateVerticesFromRect(layer, tile.rect, this._depthForLayer(layer) + 1);
      rect.texture = tile.texture;
      this._appendRect(rect);
    }
  }

  _calculateRects() {
    this._rects = [];
    this._dimensionsForAutoscale = {width: 0, height: 0};
    this._layerTree.forEachLayer(this._calculateLayerRect.bind(this));

    if (this._showSlowScrollRectsSetting.get())
      this._layerTree.forEachLayer(this._calculateLayerScrollRects.bind(this));

    if (this._layerTexture && this._visibleLayers.has(this._layerTexture.layer)) {
      const layer = this._layerTexture.layer;
      const selection = new LayerViewer.LayerView.LayerSelection(layer);
      const rect = new LayerViewer.Layers3DView.Rectangle(selection);
      rect.setVertices(layer.quad(), this._depthForLayer(layer));
      rect.texture = this._layerTexture.texture;
      this._appendRect(rect);
    } else if (this._showPaints()) {
      this._layerTree.forEachLayer(this._calculateLayerTileRects.bind(this));
    }
  }

  /**
   * @param {!Array.<number>} color
   * @return {!Array.<number>}
   */
  _makeColorsArray(color) {
    let colors = [];
    const normalizedColor = [color[0] / 255, color[1] / 255, color[2] / 255, color[3]];
    for (let i = 0; i < 4; i++)
      colors = colors.concat(normalizedColor);
    return colors;
  }

  /**
   * @param {!Object} attribute
   * @param {!Array.<number>} array
   * @param {number} length
   */
  _setVertexAttribute(attribute, array, length) {
    const gl = this._gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(array), gl.STATIC_DRAW);
    gl.vertexAttribPointer(attribute, length, gl.FLOAT, false, 0, 0);
  }

  /**
   * @param {!Array.<number>} vertices
   * @param {number} mode
   * @param {!Array.<number>=} color
   * @param {!Object=} texture
   */
  _drawRectangle(vertices, mode, color, texture) {
    const gl = this._gl;
    const white = [255, 255, 255, 1];
    color = color || white;
    this._setVertexAttribute(this._shaderProgram.vertexPositionAttribute, vertices, 3);
    this._setVertexAttribute(this._shaderProgram.textureCoordAttribute, [0, 1, 1, 1, 1, 0, 0, 0], 2);
    this._setVertexAttribute(this._shaderProgram.vertexColorAttribute, this._makeColorsArray(color), color.length);

    if (texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(this._shaderProgram.samplerUniform, 0);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this._whiteTexture);
    }

    const numberOfVertices = vertices.length / 3;
    gl.drawArrays(mode, 0, numberOfVertices);
  }

  /**
   * @param {!Array.<number>} vertices
   * @param {!WebGLTexture} texture
   * @param {!Array.<number>=} color
   */
  _drawTexture(vertices, texture, color) {
    this._drawRectangle(vertices, this._gl.TRIANGLE_FAN, color, texture);
  }

  _drawViewportAndChrome() {
    const viewport = this._layerTree.viewportSize();
    if (!viewport)
      return;

    const drawChrome = !Common.moduleSetting('frameViewerHideChromeWindow').get() && this._chromeTextures.length >= 3 &&
        this._chromeTextures.indexOf(undefined) < 0;
    const z = (this._maxDepth + 1) * LayerViewer.Layers3DView.LayerSpacing;
    const borderWidth = Math.ceil(LayerViewer.Layers3DView.ViewportBorderWidth * this._scale);
    let vertices = [viewport.width, 0, z, viewport.width, viewport.height, z, 0, viewport.height, z, 0, 0, z];
    this._gl.lineWidth(borderWidth);
    this._drawRectangle(
        vertices, drawChrome ? this._gl.LINE_STRIP : this._gl.LINE_LOOP, LayerViewer.Layers3DView.ViewportBorderColor);

    if (!drawChrome)
      return;

    const borderAdjustment = LayerViewer.Layers3DView.ViewportBorderWidth / 2;
    const viewportWidth = this._layerTree.viewportSize().width + 2 * borderAdjustment;
    const chromeHeight = this._chromeTextures[0].image.naturalHeight;
    const middleFragmentWidth =
        viewportWidth - this._chromeTextures[0].image.naturalWidth - this._chromeTextures[2].image.naturalWidth;
    let x = -borderAdjustment;
    const y = -chromeHeight;
    for (let i = 0; i < this._chromeTextures.length; ++i) {
      const width = i === LayerViewer.Layers3DView.ChromeTexture.Middle ? middleFragmentWidth :
                                                                          this._chromeTextures[i].image.naturalWidth;
      if (width < 0 || x + width > viewportWidth)
        break;
      vertices = [x, y, z, x + width, y, z, x + width, y + chromeHeight, z, x, y + chromeHeight, z];
      this._drawTexture(vertices, /** @type {!WebGLTexture} */ (this._chromeTextures[i]));
      x += width;
    }
  }

  /**
   * @param {!LayerViewer.Layers3DView.Rectangle} rect
   */
  _drawViewRect(rect) {
    const vertices = rect.vertices;
    if (rect.texture)
      this._drawTexture(vertices, rect.texture, rect.fillColor || undefined);
    else if (rect.fillColor)
      this._drawRectangle(vertices, this._gl.TRIANGLE_FAN, rect.fillColor);
    this._gl.lineWidth(rect.lineWidth);
    if (rect.borderColor)
      this._drawRectangle(vertices, this._gl.LINE_LOOP, rect.borderColor);
  }

  _update() {
    if (!this.isShowing()) {
      this._needsUpdate = true;
      return;
    }
    if (!this._layerTree || !this._layerTree.root()) {
      this._failBanner.show(this.contentElement);
      return;
    }
    const gl = this._initGLIfNecessary();
    if (!gl) {
      this._failBanner.element.removeChildren();
      this._failBanner.element.appendChild(this._webglDisabledBanner());
      this._failBanner.show(this.contentElement);
      return;
    }
    this._failBanner.detach();
    this._gl.viewportWidth = this._canvasElement.width;
    this._gl.viewportHeight = this._canvasElement.height;

    this._calculateDepthsAndVisibility();
    this._calculateRects();
    this._updateTransformAndConstraints();

    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this._rects.forEach(this._drawViewRect.bind(this));
    this._drawViewportAndChrome();
  }

  /**
   * @return {!Node}
   */
  _webglDisabledBanner() {
    const fragment = this.contentElement.ownerDocument.createDocumentFragment();
    fragment.createChild('div').textContent = Common.UIString('Can\'t display layers,');
    fragment.createChild('div').textContent = Common.UIString('WebGL support is disabled in your browser.');
    fragment.appendChild(UI.formatLocalized('Check %s for possible reasons.', [UI.XLink.create('about:gpu')]));
    return fragment;
  }

  /**
   * @param {!Event} event
   * @return {?LayerViewer.LayerView.Selection}
   */
  _selectionFromEventPoint(event) {
    if (!this._layerTree)
      return null;
    let closestIntersectionPoint = Infinity;
    let closestObject = null;
    const projectionMatrix =
        new WebKitCSSMatrix().scale(1, -1, -1).translate(-1, -1, 0).multiply(this._projectionMatrix);
    const x0 = (event.clientX - this._canvasElement.totalOffsetLeft()) * window.devicePixelRatio;
    const y0 = -(event.clientY - this._canvasElement.totalOffsetTop()) * window.devicePixelRatio;

    /**
     * @param {!LayerViewer.Layers3DView.Rectangle} rect
     */
    function checkIntersection(rect) {
      if (!rect.relatedObject)
        return;
      const t = rect.intersectWithLine(projectionMatrix, x0, y0);
      if (t < closestIntersectionPoint) {
        closestIntersectionPoint = t;
        closestObject = rect.relatedObject;
      }
    }

    this._rects.forEach(checkIntersection);
    return closestObject;
  }

  /**
   * @param {string} caption
   * @param {string} name
   * @param {boolean} value
   * @param {!UI.Toolbar} toolbar
   * @return {!Common.Setting}
   */
  _createVisibilitySetting(caption, name, value, toolbar) {
    const setting = Common.settings.createSetting(name, value);
    setting.setTitle(Common.UIString(caption));
    setting.addChangeListener(this._update, this);
    toolbar.appendToolbarItem(new UI.ToolbarSettingCheckbox(setting));
    return setting;
  }

  _initToolbar() {
    this._panelToolbar = this._transformController.toolbar();
    this.contentElement.appendChild(this._panelToolbar.element);
    this._showSlowScrollRectsSetting =
        this._createVisibilitySetting('Slow scroll rects', 'frameViewerShowSlowScrollRects', true, this._panelToolbar);
    this._showPaintsSetting =
        this._createVisibilitySetting('Paints', 'frameViewerShowPaints', true, this._panelToolbar);
    this._showPaintsSetting.addChangeListener(this._updatePaints, this);
    Common.moduleSetting('frameViewerHideChromeWindow').addChangeListener(this._update, this);
  }

  /**
   * @param {!Event} event
   */
  _onContextMenu(event) {
    const contextMenu = new UI.ContextMenu(event);
    contextMenu.defaultSection().appendItem(
        Common.UIString('Reset View'), this._transformController.resetAndNotify.bind(this._transformController), false);
    const selection = this._selectionFromEventPoint(event);
    if (selection && selection.type() === LayerViewer.LayerView.Selection.Type.Snapshot) {
      contextMenu.defaultSection().appendItem(
          Common.UIString('Show Paint Profiler'),
          this.dispatchEventToListeners.bind(this, LayerViewer.Layers3DView.Events.PaintProfilerRequested, selection),
          false);
    }
    this._layerViewHost.showContextMenu(contextMenu, selection);
  }

  /**
   * @param {!Event} event
   */
  _onMouseMove(event) {
    if (event.which)
      return;
    this._layerViewHost.hoverObject(this._selectionFromEventPoint(event));
  }

  /**
   * @param {!Event} event
   */
  _onMouseDown(event) {
    this._mouseDownX = event.clientX;
    this._mouseDownY = event.clientY;
  }

  /**
   * @param {!Event} event
   */
  _onMouseUp(event) {
    const maxDistanceInPixels = 6;
    if (this._mouseDownX && Math.abs(event.clientX - this._mouseDownX) < maxDistanceInPixels &&
        Math.abs(event.clientY - this._mouseDownY) < maxDistanceInPixels)
      this._layerViewHost.selectObject(this._selectionFromEventPoint(event));
    delete this._mouseDownX;
    delete this._mouseDownY;
  }

  /**
   * @param {!Event} event
   */
  _onDoubleClick(event) {
    const selection = this._selectionFromEventPoint(event);
    if (selection && (selection.type() === LayerViewer.LayerView.Selection.Type.Snapshot || selection.layer()))
      this.dispatchEventToListeners(LayerViewer.Layers3DView.Events.PaintProfilerRequested, selection);
    event.stopPropagation();
  }

  _updatePaints() {
    if (this._showPaints()) {
      this._textureManager.setLayerTree(this._layerTree);
      this._textureManager.forceUpdate();
    } else {
      this._textureManager.reset();
    }
    this._update();
  }

  /**
   * @return {boolean}
   */
  _showPaints() {
    return this._showPaintsSetting.get();
  }
};

/** @typedef {{borderColor: !Array<number>, borderWidth: number}} */
LayerViewer.Layers3DView.LayerStyle;

/**
 * @enum {string}
 */
LayerViewer.Layers3DView.OutlineType = {
  Hovered: 'hovered',
  Selected: 'selected'
};

/**
 * @enum {string}
 */
/** @enum {symbol} */
LayerViewer.Layers3DView.Events = {
  PaintProfilerRequested: Symbol('PaintProfilerRequested'),
  ScaleChanged: Symbol('ScaleChanged')
};

/**
 * @enum {number}
 */
LayerViewer.Layers3DView.ChromeTexture = {
  Left: 0,
  Middle: 1,
  Right: 2
};

/**
 * @enum {string}
 */
LayerViewer.Layers3DView.ScrollRectTitles = {
  RepaintsOnScroll: Common.UIString('repaints on scroll'),
  TouchEventHandler: Common.UIString('touch event listener'),
  WheelEventHandler: Common.UIString('mousewheel event listener')
};

LayerViewer.Layers3DView.FragmentShader = '' +
    'precision mediump float;\n' +
    'varying vec4 vColor;\n' +
    'varying vec2 vTextureCoord;\n' +
    'uniform sampler2D uSampler;\n' +
    'void main(void)\n' +
    '{\n' +
    '    gl_FragColor = texture2D(uSampler, vec2(vTextureCoord.s, vTextureCoord.t)) * vColor;\n' +
    '}';

LayerViewer.Layers3DView.VertexShader = '' +
    'attribute vec3 aVertexPosition;\n' +
    'attribute vec2 aTextureCoord;\n' +
    'attribute vec4 aVertexColor;\n' +
    'uniform mat4 uPMatrix;\n' +
    'varying vec2 vTextureCoord;\n' +
    'varying vec4 vColor;\n' +
    'void main(void)\n' +
    '{\n' +
    'gl_Position = uPMatrix * vec4(aVertexPosition, 1.0);\n' +
    'vColor = aVertexColor;\n' +
    'vTextureCoord = aTextureCoord;\n' +
    '}';

LayerViewer.Layers3DView.HoveredBorderColor = [0, 0, 255, 1];
LayerViewer.Layers3DView.SelectedBorderColor = [0, 255, 0, 1];
LayerViewer.Layers3DView.BorderColor = [0, 0, 0, 1];
LayerViewer.Layers3DView.ViewportBorderColor = [160, 160, 160, 1];
LayerViewer.Layers3DView.ScrollRectBackgroundColor = [178, 100, 100, 0.6];
LayerViewer.Layers3DView.HoveredImageMaskColor = [200, 200, 255, 1];
LayerViewer.Layers3DView.BorderWidth = 1;
LayerViewer.Layers3DView.SelectedBorderWidth = 2;
LayerViewer.Layers3DView.ViewportBorderWidth = 3;

LayerViewer.Layers3DView.LayerSpacing = 20;
LayerViewer.Layers3DView.ScrollRectSpacing = 4;

/**
 * @unrestricted
 */
LayerViewer.LayerTextureManager = class {
  /**
   * @param {function()} textureUpdatedCallback
   */
  constructor(textureUpdatedCallback) {
    this._textureUpdatedCallback = textureUpdatedCallback;
    this._throttler = new Common.Throttler(0);
    this._scale = 0;
    this._active = false;
    this.reset();
  }

  /**
   * @param {!Image} image
   * @param {!WebGLRenderingContext} gl
   * @return {!WebGLTexture} texture
   */
  static _createTextureForImage(gl, image) {
    const texture = gl.createTexture();
    texture.image = image;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  reset() {
    if (this._tilesByLayer)
      this.setLayerTree(null);

    /** @type {!Map<!SDK.Layer, !Array<!LayerViewer.LayerTextureManager.Tile>>} */
    this._tilesByLayer = new Map();
    /** @type {!Array<!SDK.Layer>} */
    this._queue = [];
  }

  /**
   * @param {!WebGLRenderingContext} glContext
   */
  setContext(glContext) {
    this._gl = glContext;
    if (this._scale)
      this._updateTextures();
  }

  suspend() {
    this._active = false;
  }

  resume() {
    this._active = true;
    if (this._queue.length)
      this._update();
  }

  /**
   * @param {?SDK.LayerTreeBase} layerTree
   */
  setLayerTree(layerTree) {
    const newLayers = new Set();
    const oldLayers = Array.from(this._tilesByLayer.keys());
    if (layerTree) {
      layerTree.forEachLayer(layer => {
        if (!layer.drawsContent())
          return;
        newLayers.add(layer);
        if (!this._tilesByLayer.has(layer)) {
          this._tilesByLayer.set(layer, []);
          this.layerNeedsUpdate(layer);
        }
      });
    }
    if (!oldLayers.length)
      this.forceUpdate();
    for (const layer of oldLayers) {
      if (newLayers.has(layer))
        continue;
      this._tilesByLayer.get(layer).forEach(tile => tile.dispose());
      this._tilesByLayer.delete(layer);
    }
  }

  /**
   * @param {!SDK.Layer} layer
   * @param {!Array<!SDK.SnapshotWithRect>} snapshots
   * @return {!Promise}
   */
  _setSnapshotsForLayer(layer, snapshots) {
    const oldSnapshotsToTiles = new Map((this._tilesByLayer.get(layer) || []).map(tile => [tile.snapshot, tile]));
    const newTiles = [];
    const reusedTiles = [];
    for (const snapshot of snapshots) {
      const oldTile = oldSnapshotsToTiles.get(snapshot);
      if (oldTile) {
        reusedTiles.push(oldTile);
        oldSnapshotsToTiles.delete(oldTile);
      } else {
        newTiles.push(new LayerViewer.LayerTextureManager.Tile(snapshot));
      }
    }
    this._tilesByLayer.set(layer, reusedTiles.concat(newTiles));
    for (const tile of oldSnapshotsToTiles.values())
      tile.dispose();
    if (!this._gl || !this._scale)
      return Promise.resolve();
    return Promise.all(newTiles.map(tile => tile.update(this._gl, this._scale))).then(this._textureUpdatedCallback);
  }

  /**
   * @param {number} scale
   */
  setScale(scale) {
    if (this._scale && this._scale >= scale)
      return;
    this._scale = scale;
    this._updateTextures();
  }

  /**
   * @param {!SDK.Layer} layer
   * @return {!Array<!LayerViewer.LayerTextureManager.Tile>}
   */
  tilesForLayer(layer) {
    return this._tilesByLayer.get(layer) || [];
  }

  /**
   * @param {!SDK.Layer} layer
   */
  layerNeedsUpdate(layer) {
    if (this._queue.indexOf(layer) < 0)
      this._queue.push(layer);
    if (this._active)
      this._throttler.schedule(this._update.bind(this));
  }

  forceUpdate() {
    this._queue.forEach(layer => this._updateLayer(layer));
    this._queue = [];
    this._update();
  }

  /**
   * @return {!Promise}
   */
  _update() {
    const layer = this._queue.shift();
    if (!layer)
      return Promise.resolve();
    if (this._queue.length)
      this._throttler.schedule(this._update.bind(this));
    return this._updateLayer(layer);
  }

  /**
   * @param {!SDK.Layer} layer
   * @return {!Promise}
   */
  _updateLayer(layer) {
    return Promise.all(layer.snapshots())
        .then(snapshots => this._setSnapshotsForLayer(layer, snapshots.filter(snapshot => !!snapshot)));
  }

  _updateTextures() {
    if (!this._gl)
      return;
    if (!this._scale)
      return;

    for (const tiles of this._tilesByLayer.values()) {
      for (const tile of tiles) {
        const promise = tile.updateScale(this._gl, this._scale);
        if (promise)
          promise.then(this._textureUpdatedCallback);
      }
    }
  }
};

/**
 * @unrestricted
 */
LayerViewer.Layers3DView.Rectangle = class {
  /**
   * @param {?LayerViewer.LayerView.Selection} relatedObject
   */
  constructor(relatedObject) {
    this.relatedObject = relatedObject;
    /** @type {number} */
    this.lineWidth = 1;
    /** @type {?Array.<number>} */
    this.borderColor = null;
    /** @type {?Array.<number>} */
    this.fillColor = null;
    /** @type {?WebGLTexture} */
    this.texture = null;
  }

  /**
   * @param {!Array.<number>} quad
   * @param {number} z
   */
  setVertices(quad, z) {
    this.vertices = [quad[0], quad[1], z, quad[2], quad[3], z, quad[4], quad[5], z, quad[6], quad[7], z];
  }

  /**
   * Finds coordinates of point on layer quad, having offsets (ratioX * width) and (ratioY * height)
   * from the left corner of the initial layer rect, where width and heigth are layer bounds.
   * @param {!Array.<number>} quad
   * @param {number} ratioX
   * @param {number} ratioY
   * @return {!Array.<number>}
   */
  _calculatePointOnQuad(quad, ratioX, ratioY) {
    const x0 = quad[0];
    const y0 = quad[1];
    const x1 = quad[2];
    const y1 = quad[3];
    const x2 = quad[4];
    const y2 = quad[5];
    const x3 = quad[6];
    const y3 = quad[7];
    // Point on the first quad side clockwise
    const firstSidePointX = x0 + ratioX * (x1 - x0);
    const firstSidePointY = y0 + ratioX * (y1 - y0);
    // Point on the third quad side clockwise
    const thirdSidePointX = x3 + ratioX * (x2 - x3);
    const thirdSidePointY = y3 + ratioX * (y2 - y3);
    const x = firstSidePointX + ratioY * (thirdSidePointX - firstSidePointX);
    const y = firstSidePointY + ratioY * (thirdSidePointY - firstSidePointY);
    return [x, y];
  }

  /**
   * @param {!SDK.Layer} layer
   * @param {!Protocol.DOM.Rect} rect
   * @param {number} z
   */
  calculateVerticesFromRect(layer, rect, z) {
    const quad = layer.quad();
    const rx1 = rect.x / layer.width();
    const rx2 = (rect.x + rect.width) / layer.width();
    const ry1 = rect.y / layer.height();
    const ry2 = (rect.y + rect.height) / layer.height();
    const rectQuad = this._calculatePointOnQuad(quad, rx1, ry1)
                         .concat(this._calculatePointOnQuad(quad, rx2, ry1))
                         .concat(this._calculatePointOnQuad(quad, rx2, ry2))
                         .concat(this._calculatePointOnQuad(quad, rx1, ry2));
    this.setVertices(rectQuad, z);
  }

  /**
   * Intersects quad with given transform matrix and line l(t) = (x0, y0, t)
   * @param {!CSSMatrix} matrix
   * @param {number} x0
   * @param {number} y0
   * @return {(number|undefined)}
   */
  intersectWithLine(matrix, x0, y0) {
    let i;
    // Vertices of the quad with transform matrix applied
    const points = [];
    for (i = 0; i < 4; ++i) {
      points[i] = UI.Geometry.multiplyVectorByMatrixAndNormalize(
          new UI.Geometry.Vector(this.vertices[i * 3], this.vertices[i * 3 + 1], this.vertices[i * 3 + 2]), matrix);
    }
    // Calculating quad plane normal
    const normal = UI.Geometry.crossProduct(
        UI.Geometry.subtract(points[1], points[0]), UI.Geometry.subtract(points[2], points[1]));
    // General form of the equation of the quad plane: A * x + B * y + C * z + D = 0
    const A = normal.x;
    const B = normal.y;
    const C = normal.z;
    const D = -(A * points[0].x + B * points[0].y + C * points[0].z);
    // Finding t from the equation
    const t = -(D + A * x0 + B * y0) / C;
    // Point of the intersection
    const pt = new UI.Geometry.Vector(x0, y0, t);
    // Vectors from the intersection point to vertices of the quad
    const tVects = points.map(UI.Geometry.subtract.bind(null, pt));
    // Intersection point lies inside of the polygon if scalar products of normal of the plane and
    // cross products of successive tVects are all nonstrictly above or all nonstrictly below zero
    for (i = 0; i < tVects.length; ++i) {
      const product =
          UI.Geometry.scalarProduct(normal, UI.Geometry.crossProduct(tVects[i], tVects[(i + 1) % tVects.length]));
      if (product < 0)
        return undefined;
    }
    return t;
  }
};


/**
 * @unrestricted
 */
LayerViewer.LayerTextureManager.Tile = class {
  /**
   * @param {!SDK.SnapshotWithRect} snapshotWithRect
   */
  constructor(snapshotWithRect) {
    this.snapshot = snapshotWithRect.snapshot;
    this.rect = snapshotWithRect.rect;
    this.scale = 0;
    /** @type {?WebGLTexture} */
    this.texture = null;
  }

  dispose() {
    this.snapshot.release();
    if (this.texture) {
      this._gl.deleteTexture(this.texture);
      this.texture = null;
    }
  }

  /**
   * @param {!WebGLRenderingContext} glContext
   * @param {number} scale
   * @return {?Promise}
   */
  updateScale(glContext, scale) {
    if (this.texture && this.scale >= scale)
      return null;
    return this.update(glContext, scale);
  }

  /**
   * @param {!WebGLRenderingContext} glContext
   * @param {number} scale
   * @return {!Promise}
   */
  async update(glContext, scale) {
    this._gl = glContext;
    this.scale = scale;
    const imageURL = await this.snapshot.replay(scale);
    const image = imageURL && await UI.loadImage(imageURL);
    this.texture = image && LayerViewer.LayerTextureManager._createTextureForImage(glContext, image);
  }
};
