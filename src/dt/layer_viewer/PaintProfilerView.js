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
LayerViewer.PaintProfilerView = class extends UI.HBox {
  /**
   * @param {function(string=)} showImageCallback
   */
  constructor(showImageCallback) {
    super(true);
    this.registerRequiredCSS('layer_viewer/paintProfiler.css');
    this.contentElement.classList.add('paint-profiler-overview');
    this._canvasContainer = this.contentElement.createChild('div', 'paint-profiler-canvas-container');
    this._progressBanner = this.contentElement.createChild('div', 'full-widget-dimmed-banner hidden');
    this._progressBanner.textContent = Common.UIString('Profiling\u2026');
    this._pieChart = new PerfUI.PieChart(55, this._formatPieChartTime.bind(this), true);
    this._pieChart.element.classList.add('paint-profiler-pie-chart');
    this.contentElement.appendChild(this._pieChart.element);

    this._showImageCallback = showImageCallback;

    this._canvas = this._canvasContainer.createChild('canvas', 'fill');
    this._context = this._canvas.getContext('2d');
    this._selectionWindow = new PerfUI.OverviewGrid.Window(this._canvasContainer);
    this._selectionWindow.addEventListener(PerfUI.OverviewGrid.Events.WindowChanged, this._onWindowChanged, this);

    this._innerBarWidth = 4 * window.devicePixelRatio;
    this._minBarHeight = window.devicePixelRatio;
    this._barPaddingWidth = 2 * window.devicePixelRatio;
    this._outerBarWidth = this._innerBarWidth + this._barPaddingWidth;
    this._pendingScale = 1;
    this._scale = this._pendingScale;

    this._reset();
  }

  /**
   * @return {!Object.<string, !LayerViewer.PaintProfilerCategory>}
   */
  static categories() {
    if (LayerViewer.PaintProfilerView._categories)
      return LayerViewer.PaintProfilerView._categories;
    LayerViewer.PaintProfilerView._categories = {
      shapes: new LayerViewer.PaintProfilerCategory('shapes', Common.UIString('Shapes'), 'rgb(255, 161, 129)'),
      bitmap: new LayerViewer.PaintProfilerCategory('bitmap', Common.UIString('Bitmap'), 'rgb(136, 196, 255)'),
      text: new LayerViewer.PaintProfilerCategory('text', Common.UIString('Text'), 'rgb(180, 255, 137)'),
      misc: new LayerViewer.PaintProfilerCategory('misc', Common.UIString('Misc'), 'rgb(206, 160, 255)')
    };
    return LayerViewer.PaintProfilerView._categories;
  }

  /**
   * @return {!Object.<string, !LayerViewer.PaintProfilerCategory>}
   */
  static _initLogItemCategories() {
    if (LayerViewer.PaintProfilerView._logItemCategoriesMap)
      return LayerViewer.PaintProfilerView._logItemCategoriesMap;

    const categories = LayerViewer.PaintProfilerView.categories();

    const logItemCategories = {};
    logItemCategories['Clear'] = categories['misc'];
    logItemCategories['DrawPaint'] = categories['misc'];
    logItemCategories['DrawData'] = categories['misc'];
    logItemCategories['SetMatrix'] = categories['misc'];
    logItemCategories['PushCull'] = categories['misc'];
    logItemCategories['PopCull'] = categories['misc'];
    logItemCategories['Translate'] = categories['misc'];
    logItemCategories['Scale'] = categories['misc'];
    logItemCategories['Concat'] = categories['misc'];
    logItemCategories['Restore'] = categories['misc'];
    logItemCategories['SaveLayer'] = categories['misc'];
    logItemCategories['Save'] = categories['misc'];
    logItemCategories['BeginCommentGroup'] = categories['misc'];
    logItemCategories['AddComment'] = categories['misc'];
    logItemCategories['EndCommentGroup'] = categories['misc'];
    logItemCategories['ClipRect'] = categories['misc'];
    logItemCategories['ClipRRect'] = categories['misc'];
    logItemCategories['ClipPath'] = categories['misc'];
    logItemCategories['ClipRegion'] = categories['misc'];
    logItemCategories['DrawPoints'] = categories['shapes'];
    logItemCategories['DrawRect'] = categories['shapes'];
    logItemCategories['DrawOval'] = categories['shapes'];
    logItemCategories['DrawRRect'] = categories['shapes'];
    logItemCategories['DrawPath'] = categories['shapes'];
    logItemCategories['DrawVertices'] = categories['shapes'];
    logItemCategories['DrawDRRect'] = categories['shapes'];
    logItemCategories['DrawBitmap'] = categories['bitmap'];
    logItemCategories['DrawBitmapRectToRect'] = categories['bitmap'];
    logItemCategories['DrawBitmapMatrix'] = categories['bitmap'];
    logItemCategories['DrawBitmapNine'] = categories['bitmap'];
    logItemCategories['DrawSprite'] = categories['bitmap'];
    logItemCategories['DrawPicture'] = categories['bitmap'];
    logItemCategories['DrawText'] = categories['text'];
    logItemCategories['DrawPosText'] = categories['text'];
    logItemCategories['DrawPosTextH'] = categories['text'];
    logItemCategories['DrawTextOnPath'] = categories['text'];

    LayerViewer.PaintProfilerView._logItemCategoriesMap = logItemCategories;
    return logItemCategories;
  }

  /**
   * @param {!Object} logItem
   * @return {!LayerViewer.PaintProfilerCategory}
   */
  static _categoryForLogItem(logItem) {
    const method = logItem.method.toTitleCase();

    const logItemCategories = LayerViewer.PaintProfilerView._initLogItemCategories();
    let result = logItemCategories[method];
    if (!result) {
      result = LayerViewer.PaintProfilerView.categories()['misc'];
      logItemCategories[method] = result;
    }
    return result;
  }

  /**
   * @override
   */
  onResize() {
    this._update();
  }

  /**
   * @param {?SDK.PaintProfilerSnapshot} snapshot
   * @param {!Array.<!SDK.PaintProfilerLogItem>} log
   * @param {?Protocol.DOM.Rect} clipRect
   */
  async setSnapshotAndLog(snapshot, log, clipRect) {
    this._reset();
    this._snapshot = snapshot;
    if (this._snapshot)
      this._snapshot.addReference();
    this._log = log;
    this._logCategories = this._log.map(LayerViewer.PaintProfilerView._categoryForLogItem);

    if (!this._snapshot) {
      this._update();
      this._pieChart.setTotal(0);
      this._selectionWindow.setEnabled(false);
      return;
    }
    this._selectionWindow.setEnabled(true);
    this._progressBanner.classList.remove('hidden');
    this._updateImage();

    const profiles = await snapshot.profile(clipRect);

    this._progressBanner.classList.add('hidden');
    this._profiles = profiles;
    this._update();
    this._updatePieChart();
  }

  /**
   * @param {number} scale
   */
  setScale(scale) {
    const needsUpdate = scale > this._scale;
    const predictiveGrowthFactor = 2;
    this._pendingScale = Math.min(1, scale * predictiveGrowthFactor);
    if (needsUpdate && this._snapshot)
      this._updateImage();
  }

  _update() {
    this._canvas.width = this._canvasContainer.clientWidth * window.devicePixelRatio;
    this._canvas.height = this._canvasContainer.clientHeight * window.devicePixelRatio;
    this._samplesPerBar = 0;
    if (!this._profiles || !this._profiles.length)
      return;

    const maxBars = Math.floor((this._canvas.width - 2 * this._barPaddingWidth) / this._outerBarWidth);
    const sampleCount = this._log.length;
    this._samplesPerBar = Math.ceil(sampleCount / maxBars);

    let maxBarTime = 0;
    const barTimes = [];
    const barHeightByCategory = [];
    let heightByCategory = {};
    for (let i = 0, lastBarIndex = 0, lastBarTime = 0; i < sampleCount;) {
      let categoryName = (this._logCategories[i] && this._logCategories[i].name) || 'misc';
      const sampleIndex = this._log[i].commandIndex;
      for (let row = 0; row < this._profiles.length; row++) {
        const sample = this._profiles[row][sampleIndex];
        lastBarTime += sample;
        heightByCategory[categoryName] = (heightByCategory[categoryName] || 0) + sample;
      }
      ++i;
      if (i - lastBarIndex === this._samplesPerBar || i === sampleCount) {
        // Normalize by total number of samples accumulated.
        const factor = this._profiles.length * (i - lastBarIndex);
        lastBarTime /= factor;
        for (categoryName in heightByCategory)
          heightByCategory[categoryName] /= factor;

        barTimes.push(lastBarTime);
        barHeightByCategory.push(heightByCategory);

        if (lastBarTime > maxBarTime)
          maxBarTime = lastBarTime;
        lastBarTime = 0;
        heightByCategory = {};
        lastBarIndex = i;
      }
    }

    const paddingHeight = 4 * window.devicePixelRatio;
    const scale = (this._canvas.height - paddingHeight - this._minBarHeight) / maxBarTime;
    for (let i = 0; i < barTimes.length; ++i) {
      for (const categoryName in barHeightByCategory[i])
        barHeightByCategory[i][categoryName] *= (barTimes[i] * scale + this._minBarHeight) / barTimes[i];
      this._renderBar(i, barHeightByCategory[i]);
    }
  }

  /**
   * @param {number} index
   * @param {!Object.<string, number>} heightByCategory
   */
  _renderBar(index, heightByCategory) {
    const categories = LayerViewer.PaintProfilerView.categories();
    let currentHeight = 0;
    const x = this._barPaddingWidth + index * this._outerBarWidth;
    for (const categoryName in categories) {
      if (!heightByCategory[categoryName])
        continue;
      currentHeight += heightByCategory[categoryName];
      const y = this._canvas.height - currentHeight;
      this._context.fillStyle = categories[categoryName].color;
      this._context.fillRect(x, y, this._innerBarWidth, heightByCategory[categoryName]);
    }
  }

  _onWindowChanged() {
    this.dispatchEventToListeners(LayerViewer.PaintProfilerView.Events.WindowChanged);
    this._updatePieChart();
    if (this._updateImageTimer)
      return;
    this._updateImageTimer = setTimeout(this._updateImage.bind(this), 100);
  }

  _updatePieChart() {
    const window = this.selectionWindow();
    if (!this._profiles || !this._profiles.length || !window)
      return;
    let totalTime = 0;
    const timeByCategory = {};
    for (let i = window.left; i < window.right; ++i) {
      const logEntry = this._log[i];
      const category = LayerViewer.PaintProfilerView._categoryForLogItem(logEntry);
      timeByCategory[category.color] = timeByCategory[category.color] || 0;
      for (let j = 0; j < this._profiles.length; ++j) {
        const time = this._profiles[j][logEntry.commandIndex];
        totalTime += time;
        timeByCategory[category.color] += time;
      }
    }
    this._pieChart.setTotal(totalTime / this._profiles.length);
    for (const color in timeByCategory)
      this._pieChart.addSlice(timeByCategory[color] / this._profiles.length, color);
  }

  /**
   * @param {number} value
   * @return {string}
   */
  _formatPieChartTime(value) {
    return Number.millisToString(value * 1000, true);
  }

  /**
   * @return {?{left: number, right: number}}
   */
  selectionWindow() {
    if (!this._log)
      return null;

    const screenLeft = this._selectionWindow.windowLeft * this._canvas.width;
    const screenRight = this._selectionWindow.windowRight * this._canvas.width;
    const barLeft = Math.floor(screenLeft / this._outerBarWidth);
    const barRight = Math.floor((screenRight + this._innerBarWidth - this._barPaddingWidth / 2) / this._outerBarWidth);
    const stepLeft = Number.constrain(barLeft * this._samplesPerBar, 0, this._log.length - 1);
    const stepRight = Number.constrain(barRight * this._samplesPerBar, 0, this._log.length);

    return {left: stepLeft, right: stepRight};
  }

  _updateImage() {
    delete this._updateImageTimer;
    let left;
    let right;
    const window = this.selectionWindow();
    if (this._profiles && this._profiles.length && window) {
      left = this._log[window.left].commandIndex;
      right = this._log[window.right - 1].commandIndex;
    }
    const scale = this._pendingScale;
    this._snapshot.replay(scale, left, right).then(image => {
      if (!image)
        return;
      this._scale = scale;
      this._showImageCallback(image);
    });
  }

  _reset() {
    if (this._snapshot)
      this._snapshot.release();
    this._snapshot = null;
    this._profiles = null;
    this._selectionWindow.reset();
    this._selectionWindow.setEnabled(false);
  }
};

/** @enum {symbol} */
LayerViewer.PaintProfilerView.Events = {
  WindowChanged: Symbol('WindowChanged')
};

/**
 * @unrestricted
 */
LayerViewer.PaintProfilerCommandLogView = class extends UI.ThrottledWidget {
  constructor() {
    super();
    this.setMinimumSize(100, 25);
    this.element.classList.add('overflow-auto');

    this._treeOutline = new UI.TreeOutlineInShadow();
    this.element.appendChild(this._treeOutline.element);

    this._log = [];
  }

  /**
   * @param {!Array.<!SDK.PaintProfilerLogItem>} log
   */
  setCommandLog(log) {
    this._log = log;
    /** @type {!Map<!SDK.PaintProfilerLogItem>} */
    this._treeItemCache = new Map();
    this.updateWindow({left: 0, right: this._log.length});
  }

  /**
   * @param {!SDK.PaintProfilerLogItem} logItem
   */
  _appendLogItem(logItem) {
    let treeElement = this._treeItemCache.get(logItem);
    if (!treeElement) {
      treeElement = new LayerViewer.LogTreeElement(this, logItem);
      this._treeItemCache.set(logItem, treeElement);
    } else if (treeElement.parent) {
      return;
    }
    this._treeOutline.appendChild(treeElement);
  }

  /**
   * @param {?{left: number, right: number}} selectionWindow
   */
  updateWindow(selectionWindow) {
    this._selectionWindow = selectionWindow;
    this.update();
  }

  /**
   * @override
   * @return {!Promise<*>}
   */
  doUpdate() {
    if (!this._selectionWindow || !this._log.length) {
      this._treeOutline.removeChildren();
      return Promise.resolve();
    }
    const root = this._treeOutline.rootElement();
    for (;;) {
      const child = root.firstChild();
      if (!child || child._logItem.commandIndex >= this._selectionWindow.left)
        break;
      root.removeChildAtIndex(0);
    }
    for (;;) {
      const child = root.lastChild();
      if (!child || child._logItem.commandIndex < this._selectionWindow.right)
        break;
      root.removeChildAtIndex(root.children().length - 1);
    }
    for (let i = this._selectionWindow.left, right = this._selectionWindow.right; i < right; ++i)
      this._appendLogItem(this._log[i]);
    return Promise.resolve();
  }
};

/**
 * @unrestricted
 */
LayerViewer.LogTreeElement = class extends UI.TreeElement {
  /**
   * @param {!LayerViewer.PaintProfilerCommandLogView} ownerView
   * @param {!SDK.PaintProfilerLogItem} logItem
   */
  constructor(ownerView, logItem) {
    super('', !!logItem.params);
    this._logItem = logItem;
    this._ownerView = ownerView;
    this._filled = false;
  }

  /**
   * @override
   */
  onattach() {
    this._update();
  }

  /**
   * @override
   */
  onpopulate() {
    for (const param in this._logItem.params)
      LayerViewer.LogPropertyTreeElement._appendLogPropertyItem(this, param, this._logItem.params[param]);
  }

  /**
   * @param {*} param
   * @param {string} name
   * @return {string}
   */
  _paramToString(param, name) {
    if (typeof param !== 'object')
      return typeof param === 'string' && param.length > 100 ? name : JSON.stringify(param);
    let str = '';
    let keyCount = 0;
    for (const key in param) {
      if (++keyCount > 4 || typeof param[key] === 'object' ||
          (typeof param[key] === 'string' && param[key].length > 100))
        return name;
      if (str)
        str += ', ';
      str += param[key];
    }
    return str;
  }

  /**
   * @param {?Object<string, *>} params
   * @return {string}
   */
  _paramsToString(params) {
    let str = '';
    for (const key in params) {
      if (str)
        str += ', ';
      str += this._paramToString(params[key], key);
    }
    return str;
  }

  _update() {
    const title = createDocumentFragment();
    title.createTextChild(this._logItem.method + '(' + this._paramsToString(this._logItem.params) + ')');
    this.title = title;
  }
};

/**
 * @unrestricted
 */
LayerViewer.LogPropertyTreeElement = class extends UI.TreeElement {
  /**
   * @param {!{name: string, value}} property
   */
  constructor(property) {
    super();
    this._property = property;
  }

  /**
   * @param {!UI.TreeElement} element
   * @param {string} name
   * @param {*} value
   */
  static _appendLogPropertyItem(element, name, value) {
    const treeElement = new LayerViewer.LogPropertyTreeElement({name: name, value: value});
    element.appendChild(treeElement);
    if (value && typeof value === 'object') {
      for (const property in value)
        LayerViewer.LogPropertyTreeElement._appendLogPropertyItem(treeElement, property, value[property]);
    }
  }

  /**
   * @override
   */
  onattach() {
    const title = createDocumentFragment();
    const nameElement = title.createChild('span', 'name');
    nameElement.textContent = this._property.name;
    const separatorElement = title.createChild('span', 'separator');
    separatorElement.textContent = ': ';
    if (this._property.value === null || typeof this._property.value !== 'object') {
      const valueElement = title.createChild('span', 'value');
      valueElement.textContent = JSON.stringify(this._property.value);
      valueElement.classList.add('cm-js-' + (this._property.value === null ? 'null' : typeof this._property.value));
    }
    this.title = title;
  }
};


/**
 * @unrestricted
 */
LayerViewer.PaintProfilerCategory = class {
  /**
   * @param {string} name
   * @param {string} title
   * @param {string} color
   */
  constructor(name, title, color) {
    this.name = name;
    this.title = title;
    this.color = color;
  }
};
