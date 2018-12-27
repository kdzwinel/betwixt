// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {UI.ListWidget.Delegate}
 * @unrestricted
 */
MobileThrottling.ThrottlingSettingsTab = class extends UI.VBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('mobile_throttling/throttlingSettingsTab.css');

    this.contentElement.createChild('div', 'header').textContent = Common.UIString('Network Throttling Profiles');

    const addButton = UI.createTextButton(
        Common.UIString('Add custom profile...'), this._addButtonClicked.bind(this), 'add-conditions-button');
    this.contentElement.appendChild(addButton);

    this._list = new UI.ListWidget(this);
    this._list.element.classList.add('conditions-list');
    this._list.registerRequiredCSS('mobile_throttling/throttlingSettingsTab.css');
    this._list.show(this.contentElement);

    this._customSetting = Common.moduleSetting('customNetworkConditions');
    this._customSetting.addChangeListener(this._conditionsUpdated, this);

    this.setDefaultFocusedElement(addButton);
    this.contentElement.tabIndex = 0;
  }

  /**
   * @override
   */
  wasShown() {
    super.wasShown();
    this._conditionsUpdated();
  }

  _conditionsUpdated() {
    this._list.clear();

    const conditions = this._customSetting.get();
    for (let i = 0; i < conditions.length; ++i)
      this._list.appendItem(conditions[i], true);

    this._list.appendSeparator();
  }

  _addButtonClicked() {
    this._list.addNewItem(this._customSetting.get().length, {title: '', download: -1, upload: -1, latency: 0});
  }

  /**
   * @override
   * @param {*} item
   * @param {boolean} editable
   * @return {!Element}
   */
  renderItem(item, editable) {
    const conditions = /** @type {!SDK.NetworkManager.Conditions} */ (item);
    const element = createElementWithClass('div', 'conditions-list-item');
    const title = element.createChild('div', 'conditions-list-text conditions-list-title');
    const titleText = title.createChild('div', 'conditions-list-title-text');
    titleText.textContent = conditions.title;
    titleText.title = conditions.title;
    element.createChild('div', 'conditions-list-separator');
    element.createChild('div', 'conditions-list-text').textContent =
        MobileThrottling.throughputText(conditions.download);
    element.createChild('div', 'conditions-list-separator');
    element.createChild('div', 'conditions-list-text').textContent = MobileThrottling.throughputText(conditions.upload);
    element.createChild('div', 'conditions-list-separator');
    element.createChild('div', 'conditions-list-text').textContent = Common.UIString('%dms', conditions.latency);
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
    const conditions = /** @type {?SDK.NetworkManager.Conditions} */ (item);
    conditions.title = editor.control('title').value.trim();
    const download = editor.control('download').value.trim();
    conditions.download = download ? parseInt(download, 10) * (1024 / 8) : -1;
    const upload = editor.control('upload').value.trim();
    conditions.upload = upload ? parseInt(upload, 10) * (1024 / 8) : -1;
    const latency = editor.control('latency').value.trim();
    conditions.latency = latency ? parseInt(latency, 10) : 0;

    const list = this._customSetting.get();
    if (isNew)
      list.push(conditions);
    this._customSetting.set(list);
  }

  /**
   * @override
   * @param {*} item
   * @return {!UI.ListWidget.Editor}
   */
  beginEdit(item) {
    const conditions = /** @type {?SDK.NetworkManager.Conditions} */ (item);
    const editor = this._createEditor();
    editor.control('title').value = conditions.title;
    editor.control('download').value = conditions.download <= 0 ? '' : String(conditions.download / (1024 / 8));
    editor.control('upload').value = conditions.upload <= 0 ? '' : String(conditions.upload / (1024 / 8));
    editor.control('latency').value = conditions.latency ? String(conditions.latency) : '';
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

    const titles = content.createChild('div', 'conditions-edit-row');
    titles.createChild('div', 'conditions-list-text conditions-list-title').textContent =
        Common.UIString('Profile Name');
    titles.createChild('div', 'conditions-list-separator conditions-list-separator-invisible');
    titles.createChild('div', 'conditions-list-text').textContent = Common.UIString('Download');
    titles.createChild('div', 'conditions-list-separator conditions-list-separator-invisible');
    titles.createChild('div', 'conditions-list-text').textContent = Common.UIString('Upload');
    titles.createChild('div', 'conditions-list-separator conditions-list-separator-invisible');
    titles.createChild('div', 'conditions-list-text').textContent = Common.UIString('Latency');

    const fields = content.createChild('div', 'conditions-edit-row');
    fields.createChild('div', 'conditions-list-text conditions-list-title')
        .appendChild(editor.createInput('title', 'text', '', titleValidator));
    fields.createChild('div', 'conditions-list-separator conditions-list-separator-invisible');

    let cell = fields.createChild('div', 'conditions-list-text');
    cell.appendChild(editor.createInput('download', 'text', Common.UIString('kb/s'), throughputValidator));
    cell.createChild('div', 'conditions-edit-optional').textContent = Common.UIString('optional');
    fields.createChild('div', 'conditions-list-separator conditions-list-separator-invisible');

    cell = fields.createChild('div', 'conditions-list-text');
    cell.appendChild(editor.createInput('upload', 'text', Common.UIString('kb/s'), throughputValidator));
    cell.createChild('div', 'conditions-edit-optional').textContent = Common.UIString('optional');
    fields.createChild('div', 'conditions-list-separator conditions-list-separator-invisible');

    cell = fields.createChild('div', 'conditions-list-text');
    cell.appendChild(editor.createInput('latency', 'text', Common.UIString('ms'), latencyValidator));
    cell.createChild('div', 'conditions-edit-optional').textContent = Common.UIString('optional');

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
    function throughputValidator(item, index, input) {
      const value = input.value.trim();
      return !value || (/^[\d]+(\.\d+)?|\.\d+$/.test(value) && value >= 0 && value <= 10000000);
    }

    /**
     * @param {*} item
     * @param {number} index
     * @param {!HTMLInputElement|!HTMLSelectElement} input
     * @return {boolean}
     */
    function latencyValidator(item, index, input) {
      const value = input.value.trim();
      return !value || (/^[\d]+$/.test(value) && value >= 0 && value <= 1000000);
    }
  }
};

/**
 * @param {number} throughput
 * @param {boolean=} plainText
 * @return {string}
 */
MobileThrottling.throughputText = function(throughput, plainText) {
  if (throughput < 0)
    return '';
  const throughputInKbps = throughput / (1024 / 8);
  const delimiter = plainText ? '' : ' ';
  if (throughputInKbps < 1024)
    return Common.UIString('%d%skb/s', throughputInKbps, delimiter);
  if (throughputInKbps < 1024 * 10)
    return Common.UIString('%.1f%sMb/s', throughputInKbps / 1024, delimiter);
  return Common.UIString('%d%sMb/s', (throughputInKbps / 1024) | 0, delimiter);
};
