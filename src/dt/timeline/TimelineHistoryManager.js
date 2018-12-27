// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Timeline.TimelineHistoryManager = class {
  constructor() {
    /** @type {!Array<!Timeline.PerformanceModel>} */
    this._recordings = [];
    this._action = /** @type {!UI.Action} */ (UI.actionRegistry.action('timeline.show-history'));
    /** @type {!Map<string, number>} */
    this._nextNumberByDomain = new Map();
    this._button = new Timeline.TimelineHistoryManager.ToolbarButton(this._action);
    this.clear();

    this._allOverviews = [
      {constructor: Timeline.TimelineEventOverviewResponsiveness, height: 3},
      {constructor: Timeline.TimelineEventOverviewFrames, height: 16},
      {constructor: Timeline.TimelineEventOverviewCPUActivity, height: 20},
      {constructor: Timeline.TimelineEventOverviewNetwork, height: 8}
    ];
    this._totalHeight = this._allOverviews.reduce((acc, entry) => acc + entry.height, 0);
    this._enabled = true;
    /** @type {?Timeline.PerformanceModel} */
    this._lastActiveModel = null;
  }

  /**
   * @param {!Timeline.PerformanceModel} performanceModel
   */
  addRecording(performanceModel) {
    this._lastActiveModel = performanceModel;
    this._recordings.unshift(performanceModel);
    this._buildPreview(performanceModel);
    this._button.setText(this._title(performanceModel));
    this._updateState();
    if (this._recordings.length <= Timeline.TimelineHistoryManager._maxRecordings)
      return;
    const lruModel = this._recordings.reduce((a, b) => lastUsedTime(a) < lastUsedTime(b) ? a : b);
    this._recordings.splice(this._recordings.indexOf(lruModel), 1);
    lruModel.dispose();

    /**
     * @param {!Timeline.PerformanceModel} model
     * @return {number}
     */
    function lastUsedTime(model) {
      return Timeline.TimelineHistoryManager._dataForModel(model).lastUsed;
    }
  }

  /**
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = enabled;
    this._updateState();
  }

  button() {
    return this._button;
  }

  clear() {
    this._recordings.forEach(model => model.dispose());
    this._recordings = [];
    this._lastActiveModel = null;
    this._updateState();
    this._button.setText(Common.UIString('(no recordings)'));
    this._nextNumberByDomain.clear();
  }

  /**
   * @return {!Promise<?Timeline.PerformanceModel>}
   */
  async showHistoryDropDown() {
    if (this._recordings.length < 2 || !this._enabled)
      return null;

    const model = await Timeline.TimelineHistoryManager.DropDown.show(
        this._recordings, /** @type {!Timeline.PerformanceModel} */ (this._lastActiveModel), this._button.element);
    if (!model)
      return null;
    const index = this._recordings.indexOf(model);
    if (index < 0) {
      console.assert(false, `selected recording not found`);
      return null;
    }
    this._setCurrentModel(model);
    return model;
  }

  cancelIfShowing() {
    Timeline.TimelineHistoryManager.DropDown.cancelIfShowing();
  }

  /**
   * @param {number} direction
   * @return {?Timeline.PerformanceModel}
   */
  navigate(direction) {
    if (!this._enabled || !this._lastActiveModel)
      return null;
    const index = this._recordings.indexOf(this._lastActiveModel);
    if (index < 0)
      return null;
    const newIndex = Number.constrain(index + direction, 0, this._recordings.length - 1);
    const model = this._recordings[newIndex];
    this._setCurrentModel(model);
    return model;
  }

  /**
   * @param {!Timeline.PerformanceModel} model
   */
  _setCurrentModel(model) {
    Timeline.TimelineHistoryManager._dataForModel(model).lastUsed = Date.now();
    this._lastActiveModel = model;
    this._button.setText(this._title(model));
  }

  _updateState() {
    this._action.setEnabled(this._recordings.length > 1 && this._enabled);
  }

  /**
   * @param {!Timeline.PerformanceModel} performanceModel
   * @return {!Element}
   */
  static _previewElement(performanceModel) {
    const data = Timeline.TimelineHistoryManager._dataForModel(performanceModel);
    const startedAt = performanceModel.recordStartTime();
    data.time.textContent =
        startedAt ? Common.UIString('(%s ago)', Timeline.TimelineHistoryManager._coarseAge(startedAt)) : '';
    return data.preview;
  }

  /**
   * @param {number} time
   * @return {string}
   */
  static _coarseAge(time) {
    const seconds = Math.round((Date.now() - time) / 1000);
    if (seconds < 50)
      return Common.UIString('moments');
    const minutes = Math.round(seconds / 60);
    if (minutes < 50)
      return Common.UIString('%s m', minutes);
    const hours = Math.round(minutes / 60);
    return Common.UIString('%s h', hours);
  }

  /**
   * @param {!Timeline.PerformanceModel} performanceModel
   * @return {string}
   */
  _title(performanceModel) {
    return Timeline.TimelineHistoryManager._dataForModel(performanceModel).title;
  }

  /**
   * @param {!Timeline.PerformanceModel} performanceModel
   */
  _buildPreview(performanceModel) {
    const parsedURL = performanceModel.timelineModel().pageURL().asParsedURL();
    const domain = parsedURL ? parsedURL.host : '';
    const sequenceNumber = this._nextNumberByDomain.get(domain) || 1;
    const title = Common.UIString('%s #%d', domain, sequenceNumber);
    this._nextNumberByDomain.set(domain, sequenceNumber + 1);
    const timeElement = createElement('span');

    const preview = createElementWithClass('div', 'preview-item vbox');
    const data = {preview: preview, title: title, time: timeElement, lastUsed: Date.now()};
    performanceModel[Timeline.TimelineHistoryManager._previewDataSymbol] = data;

    preview.appendChild(this._buildTextDetails(performanceModel, title, timeElement));
    const screenshotAndOverview = preview.createChild('div', 'hbox');
    screenshotAndOverview.appendChild(this._buildScreenshotThumbnail(performanceModel));
    screenshotAndOverview.appendChild(this._buildOverview(performanceModel));
    return data.preview;
  }

  /**
   * @param {!Timeline.PerformanceModel} performanceModel
   * @param {string} title
   * @param {!Element} timeElement
   * @return {!Element}
   */
  _buildTextDetails(performanceModel, title, timeElement) {
    const container = createElementWithClass('div', 'text-details hbox');
    container.createChild('span', 'name').textContent = title;
    const tracingModel = performanceModel.tracingModel();
    const duration = Number.millisToString(tracingModel.maximumRecordTime() - tracingModel.minimumRecordTime(), false);
    const timeContainer = container.createChild('span', 'time');
    timeContainer.appendChild(createTextNode(duration));
    timeContainer.appendChild(timeElement);
    return container;
  }

  /**
   * @param {!Timeline.PerformanceModel} performanceModel
   * @return {!Element}
   */
  _buildScreenshotThumbnail(performanceModel) {
    const container = createElementWithClass('div', 'screenshot-thumb');
    const thumbnailAspectRatio = 3 / 2;
    container.style.width = this._totalHeight * thumbnailAspectRatio + 'px';
    container.style.height = this._totalHeight + 'px';
    const filmStripModel = performanceModel.filmStripModel();
    const lastFrame = filmStripModel.frames().peekLast();
    if (!lastFrame)
      return container;
    lastFrame.imageDataPromise()
        .then(data => UI.loadImageFromData(data))
        .then(image => image && container.appendChild(image));
    return container;
  }

  /**
   * @param {!Timeline.PerformanceModel} performanceModel
   * @return {!Element}
   */
  _buildOverview(performanceModel) {
    const container = createElement('div');

    container.style.width = Timeline.TimelineHistoryManager._previewWidth + 'px';
    container.style.height = this._totalHeight + 'px';
    const canvas = container.createChild('canvas');
    canvas.width = window.devicePixelRatio * Timeline.TimelineHistoryManager._previewWidth;
    canvas.height = window.devicePixelRatio * this._totalHeight;

    const ctx = canvas.getContext('2d');
    let yOffset = 0;
    for (const overview of this._allOverviews) {
      const timelineOverview = new overview.constructor();
      timelineOverview.setCanvasSize(Timeline.TimelineHistoryManager._previewWidth, overview.height);
      timelineOverview.setModel(performanceModel);
      timelineOverview.update();
      const sourceContext = timelineOverview.context();
      const imageData = sourceContext.getImageData(0, 0, sourceContext.canvas.width, sourceContext.canvas.height);
      ctx.putImageData(imageData, 0, yOffset);
      yOffset += overview.height * window.devicePixelRatio;
    }
    return container;
  }

  /**
   * @param {!Timeline.PerformanceModel} model
   * @return {?Timeline.TimelineHistoryManager.PreviewData}
   */
  static _dataForModel(model) {
    return model[Timeline.TimelineHistoryManager._previewDataSymbol] || null;
  }
};

/** @typedef {!{preview: !Element, time: !Element, lastUsed: number, title: string}} */
Timeline.TimelineHistoryManager.PreviewData;

Timeline.TimelineHistoryManager._maxRecordings = 5;
Timeline.TimelineHistoryManager._previewWidth = 450;
Timeline.TimelineHistoryManager._previewDataSymbol = Symbol('previewData');

/**
 * @implements {UI.ListDelegate<!Timeline.PerformanceModel>}
 */
Timeline.TimelineHistoryManager.DropDown = class {
  /**
   * @param {!Array<!Timeline.PerformanceModel>} models
   */
  constructor(models) {
    this._glassPane = new UI.GlassPane();
    this._glassPane.setSizeBehavior(UI.GlassPane.SizeBehavior.MeasureContent);
    this._glassPane.setOutsideClickCallback(() => this._close(null));
    this._glassPane.setPointerEventsBehavior(UI.GlassPane.PointerEventsBehavior.BlockedByGlassPane);
    this._glassPane.setAnchorBehavior(UI.GlassPane.AnchorBehavior.PreferBottom);

    const shadowRoot =
        UI.createShadowRootWithCoreStyles(this._glassPane.contentElement, 'timeline/timelineHistoryManager.css');
    const contentElement = shadowRoot.createChild('div', 'drop-down');

    const listModel = new UI.ListModel();
    this._listControl = new UI.ListControl(listModel, this, UI.ListMode.NonViewport);
    this._listControl.element.addEventListener('mousemove', this._onMouseMove.bind(this), false);
    listModel.replaceAll(models);

    contentElement.appendChild(this._listControl.element);
    contentElement.addEventListener('keydown', this._onKeyDown.bind(this), false);
    contentElement.addEventListener('click', this._onClick.bind(this), false);

    /** @type {?function(?Timeline.PerformanceModel)} */
    this._selectionDone = null;
  }

  /**
   * @param {!Array<!Timeline.PerformanceModel>} models
   * @param {!Timeline.PerformanceModel} currentModel
   * @param {!Element} anchor
   * @return {!Promise<?Timeline.PerformanceModel>}
   */
  static show(models, currentModel, anchor) {
    if (Timeline.TimelineHistoryManager.DropDown._instance)
      return Promise.resolve(/** @type {?Timeline.PerformanceModel} */ (null));
    const instance = new Timeline.TimelineHistoryManager.DropDown(models);
    return instance._show(anchor, currentModel);
  }

  static cancelIfShowing() {
    if (!Timeline.TimelineHistoryManager.DropDown._instance)
      return;
    Timeline.TimelineHistoryManager.DropDown._instance._close(null);
  }

  /**
   * @param {!Element} anchor
   * @param {!Timeline.PerformanceModel} currentModel
   * @return {!Promise<?Timeline.PerformanceModel>}
   */
  _show(anchor, currentModel) {
    Timeline.TimelineHistoryManager.DropDown._instance = this;
    this._glassPane.setContentAnchorBox(anchor.boxInWindow());
    this._glassPane.show(/** @type {!Document} */ (this._glassPane.contentElement.ownerDocument));
    this._listControl.element.focus();
    this._listControl.selectItem(currentModel);

    return new Promise(fulfill => this._selectionDone = fulfill);
  }

  /**
   * @param {!Event} event
   */
  _onMouseMove(event) {
    const node = event.target.enclosingNodeOrSelfWithClass('preview-item');
    const listItem = node && this._listControl.itemForNode(node);
    if (!listItem)
      return;
    this._listControl.selectItem(listItem);
  }

  /**
   * @param {!Event} event
   */
  _onClick(event) {
    if (!event.target.enclosingNodeOrSelfWithClass('preview-item'))
      return;
    this._close(this._listControl.selectedItem());
  }

  /**
   * @param {!Event} event
   */
  _onKeyDown(event) {
    switch (event.key) {
      case 'Escape':
        this._close(null);
        break;
      case 'Enter':
        this._close(this._listControl.selectedItem());
        break;
      default:
        return;
    }
    event.consume(true);
  }

  /**
   * @param {?Timeline.PerformanceModel} model
   */
  _close(model) {
    this._selectionDone(model);
    this._glassPane.hide();
    Timeline.TimelineHistoryManager.DropDown._instance = null;
  }

  /**
   * @override
   * @param {!Timeline.PerformanceModel} item
   * @return {!Element}
   */
  createElementForItem(item) {
    const element = Timeline.TimelineHistoryManager._previewElement(item);
    element.classList.remove('selected');
    return element;
  }

  /**
   * @override
   * @param {!Timeline.PerformanceModel} item
   * @return {number}
   */
  heightForItem(item) {
    console.assert(false, 'Should not be called');
    return 0;
  }

  /**
   * @override
   * @param {!Timeline.PerformanceModel} item
   * @return {boolean}
   */
  isItemSelectable(item) {
    return true;
  }

  /**
   * @override
   * @param {?Timeline.PerformanceModel} from
   * @param {?Timeline.PerformanceModel} to
   * @param {?Element} fromElement
   * @param {?Element} toElement
   */
  selectedItemChanged(from, to, fromElement, toElement) {
    if (fromElement)
      fromElement.classList.remove('selected');
    if (toElement)
      toElement.classList.add('selected');
  }
};

/**
 * @type {?Timeline.TimelineHistoryManager.DropDown}
 */
Timeline.TimelineHistoryManager.DropDown._instance = null;


Timeline.TimelineHistoryManager.ToolbarButton = class extends UI.ToolbarItem {
  /**
   * @param {!UI.Action} action
   */
  constructor(action) {
    super(createElementWithClass('button', 'dropdown-button'));
    const shadowRoot = UI.createShadowRootWithCoreStyles(this.element, 'timeline/historyToolbarButton.css');

    this._contentElement = shadowRoot.createChild('span', 'content');
    const dropdownArrowIcon = UI.Icon.create('smallicon-triangle-down');
    shadowRoot.appendChild(dropdownArrowIcon);
    this.element.addEventListener('click', () => void action.execute(), false);
    this.setEnabled(action.enabled());
    action.addEventListener(UI.Action.Events.Enabled, event => this.setEnabled(/** @type {boolean} */ (event.data)));
    this.setTitle(action.title());
  }

  /**
   * @param {string} text
   */
  setText(text) {
    this._contentElement.textContent = text;
  }
};
