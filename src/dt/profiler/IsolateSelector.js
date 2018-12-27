// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {SDK.SDKModelObserver<!SDK.RuntimeModel>}
 * @implements {UI.ListDelegate<!Profiler.IsolateSelector.ListItem>}
 */
Profiler.IsolateSelector = class extends UI.VBox {
  constructor() {
    super(true);

    /** @type {!UI.ListModel<!Profiler.IsolateSelector.ListItem>} */
    this._items = new UI.ListModel();
    /** @type {!UI.ListControl<!Profiler.IsolateSelector.ListItem>} */
    this._list = new UI.ListControl(this._items, this, UI.ListMode.NonViewport);
    this.contentElement.appendChild(this._list.element);

    this.registerRequiredCSS('profiler/profileLauncherView.css');
    /** @type {!Map<!SDK.RuntimeModel, !Promise<string>>} */
    this._isolateByModel = new Map();
    /** @type {!Map<string, !Profiler.IsolateSelector.ListItem>} */
    this._itemByIsolate = new Map();
    this._updateTimer = null;

    SDK.targetManager.observeModels(SDK.RuntimeModel, this);
    SDK.targetManager.addEventListener(SDK.TargetManager.Events.NameChanged, this._targetChanged, this);
    SDK.targetManager.addEventListener(SDK.TargetManager.Events.InspectedURLChanged, this._targetChanged, this);
  }

  /**
   * @override
   */
  wasShown() {
    this._updateStats();
  }

  /**
   * @override
   */
  willHide() {
    clearTimeout(this._updateTimer);
  }

  /**
   * @override
   * @param {!SDK.RuntimeModel} model
   */
  modelAdded(model) {
    this._modelAdded(model);
  }

  /**
   * @param {!SDK.RuntimeModel} model
   */
  async _modelAdded(model) {
    const isolatePromise = model.isolateId();
    this._isolateByModel.set(model, isolatePromise);
    const isolate = await isolatePromise;
    let item = this._itemByIsolate.get(isolate);
    if (!item) {
      item = new Profiler.IsolateSelector.ListItem(model);
      const index = model.target() === SDK.targetManager.mainTarget() ? 0 : this._items.length;
      this._items.insert(index, item);
      this._itemByIsolate.set(isolate, item);
      if (this._items.length === 1)
        this._list.selectItem(item);
    } else {
      item.addModel(model);
    }
    this._update();
  }

  /**
   * @override
   * @param {!SDK.RuntimeModel} model
   */
  modelRemoved(model) {
    this._modelRemoved(model);
  }

  /**
   * @param {!SDK.RuntimeModel} model
   */
  async _modelRemoved(model) {
    const isolate = await this._isolateByModel.get(model);
    this._isolateByModel.delete(model);
    const item = this._itemByIsolate.get(isolate);
    item.removeModel(model);
    if (!item.models().length) {
      this._items.remove(this._items.indexOf(item));
      this._itemByIsolate.delete(isolate);
    }
    this._update();
  }

  /**
   * @param {!Common.Event} event
   */
  async _targetChanged(event) {
    const target = /** @type {!SDK.Target} */ (event.data);
    const model = target.model(SDK.RuntimeModel);
    const isolate = model && await this._isolateByModel.get(model);
    const item = isolate && this._itemByIsolate.get(isolate);
    if (item)
      item.updateTitle();
  }

  /**
   * @override
   * @param {!Profiler.IsolateSelector.ListItem} item
   * @return {!Element}
   */
  createElementForItem(item) {
    return item.element;
  }

  /**
   * @override
   * @param {!Profiler.IsolateSelector.ListItem} item
   * @return {number}
   */
  heightForItem(item) {
  }

  /**
   * @override
   * @param {!Profiler.IsolateSelector.ListItem} item
   * @return {boolean}
   */
  isItemSelectable(item) {
    return true;
  }

  /**
   * @override
   * @param {?Profiler.IsolateSelector.ListItem} from
   * @param {?Profiler.IsolateSelector.ListItem} to
   * @param {?Element} fromElement
   * @param {?Element} toElement
   */
  selectedItemChanged(from, to, fromElement, toElement) {
    if (fromElement)
      fromElement.classList.remove('selected');
    if (toElement)
      toElement.classList.add('selected');
    const model = to && to.models()[0];
    UI.context.setFlavor(SDK.HeapProfilerModel, model && model.heapProfilerModel());
    UI.context.setFlavor(SDK.CPUProfilerModel, model && model.target().model(SDK.CPUProfilerModel));
  }

  _update() {
    this._list.invalidateRange(0, this._items.length);
  }

  _updateStats() {
    for (const item of this._itemByIsolate.values())
      item.updateStats();
    const heapStatsUpdateIntervalMs = 2000;
    this._updateTimer = setTimeout(() => this._updateStats(), heapStatsUpdateIntervalMs);
  }
};

Profiler.IsolateSelector.ListItem = class {
  /**
   * @param {!SDK.RuntimeModel} model
   */
  constructor(model) {
    /** @type {!Set<!SDK.RuntimeModel>} */
    this._models = new Set([model]);
    this.element = createElementWithClass('div', 'profile-isolate-item hbox');
    this._heapDiv = this.element.createChild('div', 'profile-isolate-item-heap');
    this._nameDiv = this.element.createChild('div', 'profile-isolate-item-name');
    this._updatesDisabled = false;
    this.updateTitle();
    this.updateStats();
  }

  /**
   * @param {!SDK.RuntimeModel} model
   */
  addModel(model) {
    this._models.add(model);
    this.updateTitle();
  }

  /**
   * @param {!SDK.RuntimeModel} model
   */
  removeModel(model) {
    this._models.delete(model);
    this.updateTitle();
  }

  /**
   * @return {!Array<!SDK.RuntimeModel>}
   */
  models() {
    return Array.from(this._models);
  }

  async updateStats() {
    if (this._updatesDisabled)
      return;
    const heapStats = await this._models.values().next().value.heapUsage();
    if (!heapStats) {
      this._updatesDisabled = true;
      return;
    }
    const usedTitle = ls`Heap size in use by live JS objects.`;
    const totalTitle = ls`Total JS heap size including live objects, garbage, and reserved space.`;
    this._heapDiv.removeChildren();
    this._heapDiv.append(UI.html`
        <span title="${usedTitle}">${Number.bytesToString(heapStats.usedSize)}</span>
        <span> / </span>
        <span title="${totalTitle}">${Number.bytesToString(heapStats.totalSize)}</span>`);
  }

  updateTitle() {
    /** @type {!Map<string, number>} */
    const modelCountByName = new Map();
    for (const model of this._models.values()) {
      const target = model.target();
      const name = SDK.targetManager.mainTarget() !== target ? target.name() : '';
      const parsedURL = new Common.ParsedURL(target.inspectedURL());
      const domain = parsedURL.isValid ? parsedURL.domain() : '';
      const title = target.decorateLabel(domain && name ? `${domain}: ${name}` : name || domain || ls`(empty)`);
      modelCountByName.set(title, (modelCountByName.get(title) || 0) + 1);
    }
    this._nameDiv.removeChildren();
    for (const [name, count] of modelCountByName) {
      const title = count > 1 ? `${name} (${count})` : name;
      this._nameDiv.appendChild(UI.html`<div title="${title}">${title}</div>`);
    }
  }
};
