// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {UI.ListWidget.Delegate}
 * @unrestricted
 */
Emulation.GeolocationsSettingsTab = class extends UI.VBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('emulation/geolocationsSettingsTab.css');

    this.contentElement.createChild('div', 'header').textContent = Common.UIString('Custom Geolocations');

    const addButton = UI.createTextButton(
        Common.UIString('Add location...'), this._addButtonClicked.bind(this), 'add-geolocations-button');
    this.contentElement.appendChild(addButton);

    this._list = new UI.ListWidget(this);
    this._list.element.classList.add('geolocations-list');
    this._list.registerRequiredCSS('emulation/geolocationsSettingsTab.css');
    this._list.show(this.contentElement);

    this._customSetting = Common.moduleSetting('emulation.geolocations');
    this._customSetting.addChangeListener(this._geolocationsUpdated, this);

    this.setDefaultFocusedElement(addButton);
    this.contentElement.tabIndex = 0;
  }

  /**
   * @override
   */
  wasShown() {
    super.wasShown();
    this._geolocationsUpdated();
  }

  _geolocationsUpdated() {
    this._list.clear();

    const conditions = this._customSetting.get();
    for (let i = 0; i < conditions.length; ++i)
      this._list.appendItem(conditions[i], true);

    this._list.appendSeparator();
  }

  _addButtonClicked() {
    this._list.addNewItem(this._customSetting.get().length, {title: '', lat: 0, long: 0});
  }

  /**
   * @override
   * @param {*} item
   * @param {boolean} editable
   * @return {!Element}
   */
  renderItem(item, editable) {
    const geolocation = /** @type {!Emulation.GeolocationsSettingsTab.Item} */ (item);
    const element = createElementWithClass('div', 'geolocations-list-item');
    const title = element.createChild('div', 'geolocations-list-text geolocations-list-title');
    const titleText = title.createChild('div', 'geolocations-list-title-text');
    titleText.textContent = geolocation.title;
    titleText.title = geolocation.title;
    element.createChild('div', 'geolocations-list-separator');
    element.createChild('div', 'geolocations-list-text').textContent = geolocation.lat;
    element.createChild('div', 'geolocations-list-separator');
    element.createChild('div', 'geolocations-list-text').textContent = geolocation.long;
    return element;
  }

  /**
   * @override
   * @param {*} item
   * @param {number} index
   */
  removeItemRequested(item, index) {
    const list = this._customSetting.get();
    list.splice(index, 1);
    this._customSetting.set(list);
  }

  /**
   * @override
   * @param {*} item
   * @param {!UI.ListWidget.Editor} editor
   * @param {boolean} isNew
   */
  commitEdit(item, editor, isNew) {
    const geolocation = /** @type {?Emulation.GeolocationsSettingsTab.Item} */ (item);
    geolocation.title = editor.control('title').value.trim();
    const lat = editor.control('lat').value.trim();
    geolocation.lat = lat ? parseFloat(lat) : 0;
    const long = editor.control('long').value.trim();
    geolocation.long = long ? parseFloat(long) : 0;

    const list = this._customSetting.get();
    if (isNew)
      list.push(geolocation);
    this._customSetting.set(list);
  }

  /**
   * @override
   * @param {*} item
   * @return {!UI.ListWidget.Editor}
   */
  beginEdit(item) {
    const geolocation = /** @type {?Emulation.GeolocationsSettingsTab.Item} */ (item);
    const editor = this._createEditor();
    editor.control('title').value = geolocation.title;
    editor.control('lat').value = String(geolocation.lat);
    editor.control('long').value = String(geolocation.long);
    return editor;
  }

  /**
   * @return {!UI.ListWidget.Editor}
   */
  _createEditor() {
    if (this._editor)
      return this._editor;

    const editor = new UI.ListWidget.Editor();
    this._editor = editor;
    const content = editor.contentElement();

    const titles = content.createChild('div', 'geolocations-edit-row');
    titles.createChild('div', 'geolocations-list-text geolocations-list-title').textContent =
        Common.UIString('Location name');
    titles.createChild('div', 'geolocations-list-separator geolocations-list-separator-invisible');
    titles.createChild('div', 'geolocations-list-text').textContent = Common.UIString('Lat');
    titles.createChild('div', 'geolocations-list-separator geolocations-list-separator-invisible');
    titles.createChild('div', 'geolocations-list-text').textContent = Common.UIString('Long');

    const fields = content.createChild('div', 'geolocations-edit-row');
    fields.createChild('div', 'geolocations-list-text geolocations-list-title')
        .appendChild(editor.createInput('title', 'text', '', titleValidator));
    fields.createChild('div', 'geolocations-list-separator geolocations-list-separator-invisible');

    let cell = fields.createChild('div', 'geolocations-list-text');
    cell.appendChild(editor.createInput('lat', 'text', '', latValidator));
    fields.createChild('div', 'geolocations-list-separator geolocations-list-separator-invisible');

    cell = fields.createChild('div', 'geolocations-list-text');
    cell.appendChild(editor.createInput('long', 'text', '', longValidator));
    fields.createChild('div', 'geolocations-list-separator geolocations-list-separator-invisible');

    return editor;

    /**
     * @param {*} item
     * @param {number} index
     * @param {!HTMLInputElement|!HTMLSelectElement} input
     * @return {boolean}
     */
    function titleValidator(item, index, input) {
      const value = input.value.trim();
      return value.length > 0 && value.length < 50;
    }

    /**
     * @param {*} item
     * @param {number} index
     * @param {!HTMLInputElement|!HTMLSelectElement} input
     * @return {boolean}
     */
    function latValidator(item, index, input) {
      const value = input.value.trim();
      return !value || (/^-?[\d]+(\.\d+)?|\.\d+$/.test(value) && value >= -90 && value <= 90);
    }

    /**
     * @param {*} item
     * @param {number} index
     * @param {!HTMLInputElement|!HTMLSelectElement} input
     * @return {boolean}
     */
    function longValidator(item, index, input) {
      const value = input.value.trim();
      return !value || (/^-?[\d]+(\.\d+)?|\.\d+$/.test(value) && value >= -180 && value <= 180);
    }
  }
};

/** @typedef {{title: string, lat: number, long: number}} */
Emulation.GeolocationsSettingsTab.Item;