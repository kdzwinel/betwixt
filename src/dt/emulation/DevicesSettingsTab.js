// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {UI.ListWidget.Delegate}
 * @unrestricted
 */
Emulation.DevicesSettingsTab = class extends UI.VBox {
  constructor() {
    super();
    this.element.classList.add('settings-tab-container');
    this.element.classList.add('devices-settings-tab');
    this.registerRequiredCSS('emulation/devicesSettingsTab.css');

    const header = this.element.createChild('header');
    header.createChild('h3').createTextChild(Common.UIString('Emulated Devices'));
    this.containerElement = this.element.createChild('div', 'settings-container-wrapper')
                                .createChild('div', 'settings-tab settings-content settings-container');

    const buttonsRow = this.containerElement.createChild('div', 'devices-button-row');
    this._addCustomButton =
        UI.createTextButton(Common.UIString('Add custom device...'), this._addCustomDevice.bind(this));
    buttonsRow.appendChild(this._addCustomButton);

    this._list = new UI.ListWidget(this);
    this._list.registerRequiredCSS('emulation/devicesSettingsTab.css');
    this._list.element.classList.add('devices-list');
    this._list.show(this.containerElement);

    this._muteUpdate = false;
    this._emulatedDevicesList = Emulation.EmulatedDevicesList.instance();
    this._emulatedDevicesList.addEventListener(
        Emulation.EmulatedDevicesList.Events.CustomDevicesUpdated, this._devicesUpdated, this);
    this._emulatedDevicesList.addEventListener(
        Emulation.EmulatedDevicesList.Events.StandardDevicesUpdated, this._devicesUpdated, this);

    this.setDefaultFocusedElement(this._addCustomButton);
  }

  /**
   * @override
   */
  wasShown() {
    super.wasShown();
    this._devicesUpdated();
  }

  _devicesUpdated() {
    if (this._muteUpdate)
      return;

    this._list.clear();

    let devices = this._emulatedDevicesList.custom().slice();
    for (let i = 0; i < devices.length; ++i)
      this._list.appendItem(devices[i], true);

    this._list.appendSeparator();

    devices = this._emulatedDevicesList.standard().slice();
    devices.sort(Emulation.EmulatedDevice.deviceComparator);
    for (let i = 0; i < devices.length; ++i)
      this._list.appendItem(devices[i], false);
  }

  /**
   * @param {boolean} custom
   */
  _muteAndSaveDeviceList(custom) {
    this._muteUpdate = true;
    if (custom)
      this._emulatedDevicesList.saveCustomDevices();
    else
      this._emulatedDevicesList.saveStandardDevices();
    this._muteUpdate = false;
  }

  _addCustomDevice() {
    const device = new Emulation.EmulatedDevice();
    device.deviceScaleFactor = 0;
    device.horizontal.width = 700;
    device.horizontal.height = 400;
    device.vertical.width = 400;
    device.vertical.height = 700;
    this._list.addNewItem(this._emulatedDevicesList.custom().length, device);
  }

  /**
   * @param {number} value
   * @return {string}
   */
  _toNumericInputValue(value) {
    return value ? String(value) : '';
  }

  /**
   * @override
   * @param {*} item
   * @param {boolean} editable
   * @return {!Element}
   */
  renderItem(item, editable) {
    const device = /** @type {!Emulation.EmulatedDevice} */ (item);
    const element = createElementWithClass('div', 'devices-list-item');
    const checkbox = element.createChild('input', 'devices-list-checkbox');
    checkbox.type = 'checkbox';
    checkbox.checked = device.show();
    checkbox.addEventListener('click', event => event.consume(), false);
    element.createChild('div', 'devices-list-title').textContent = device.title;
    element.addEventListener('click', onItemClicked.bind(this), false);
    return element;

    /**
     * @param {!Event} event
     * @this {Emulation.DevicesSettingsTab}
     */
    function onItemClicked(event) {
      const show = !checkbox.checked;
      device.setShow(show);
      this._muteAndSaveDeviceList(editable);
      checkbox.checked = show;
      event.consume();
    }
  }

  /**
   * @override
   * @param {*} item
   * @param {number} index
   */
  removeItemRequested(item, index) {
    this._emulatedDevicesList.removeCustomDevice(/** @type {!Emulation.EmulatedDevice} */ (item));
  }

  /**
   * @override
   * @param {*} item
   * @param {!UI.ListWidget.Editor} editor
   * @param {boolean} isNew
   */
  commitEdit(item, editor, isNew) {
    const device = /** @type {!Emulation.EmulatedDevice} */ (item);
    device.title = editor.control('title').value.trim();
    device.vertical.width = editor.control('width').value ? parseInt(editor.control('width').value, 10) : 0;
    device.vertical.height = editor.control('height').value ? parseInt(editor.control('height').value, 10) : 0;
    device.horizontal.width = device.vertical.height;
    device.horizontal.height = device.vertical.width;
    device.deviceScaleFactor = editor.control('scale').value ? parseFloat(editor.control('scale').value) : 0;
    device.userAgent = editor.control('user-agent').value;
    device.modes = [];
    device.modes.push(
        {title: '', orientation: Emulation.EmulatedDevice.Vertical, insets: new UI.Insets(0, 0, 0, 0), image: null});
    device.modes.push(
        {title: '', orientation: Emulation.EmulatedDevice.Horizontal, insets: new UI.Insets(0, 0, 0, 0), image: null});
    device.capabilities = [];
    const uaType = editor.control('ua-type').value;
    if (uaType === Emulation.DeviceModeModel.UA.Mobile || uaType === Emulation.DeviceModeModel.UA.MobileNoTouch)
      device.capabilities.push(Emulation.EmulatedDevice.Capability.Mobile);
    if (uaType === Emulation.DeviceModeModel.UA.Mobile || uaType === Emulation.DeviceModeModel.UA.DesktopTouch)
      device.capabilities.push(Emulation.EmulatedDevice.Capability.Touch);
    if (isNew)
      this._emulatedDevicesList.addCustomDevice(device);
    else
      this._emulatedDevicesList.saveCustomDevices();
    this._addCustomButton.scrollIntoViewIfNeeded();
    this._addCustomButton.focus();
  }

  /**
   * @override
   * @param {*} item
   * @return {!UI.ListWidget.Editor}
   */
  beginEdit(item) {
    const device = /** @type {!Emulation.EmulatedDevice} */ (item);
    const editor = this._createEditor();
    editor.control('title').value = device.title;
    editor.control('width').value = this._toNumericInputValue(device.vertical.width);
    editor.control('height').value = this._toNumericInputValue(device.vertical.height);
    editor.control('scale').value = this._toNumericInputValue(device.deviceScaleFactor);
    editor.control('user-agent').value = device.userAgent;
    let uaType;
    if (device.mobile())
      uaType = device.touch() ? Emulation.DeviceModeModel.UA.Mobile : Emulation.DeviceModeModel.UA.MobileNoTouch;
    else
      uaType = device.touch() ? Emulation.DeviceModeModel.UA.DesktopTouch : Emulation.DeviceModeModel.UA.Desktop;
    editor.control('ua-type').value = uaType;
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

    const fields = content.createChild('div', 'devices-edit-fields');
    fields.createChild('div', 'hbox')
        .appendChild(editor.createInput('title', 'text', Common.UIString('Device name'), titleValidator));
    const screen = fields.createChild('div', 'hbox');
    screen.appendChild(editor.createInput('width', 'text', Common.UIString('Width'), sizeValidator));
    screen.appendChild(editor.createInput('height', 'text', Common.UIString('height'), sizeValidator));
    const dpr = editor.createInput('scale', 'text', Common.UIString('Device pixel ratio'), scaleValidator);
    dpr.classList.add('device-edit-fixed');
    screen.appendChild(dpr);
    const ua = fields.createChild('div', 'hbox');
    ua.appendChild(editor.createInput('user-agent', 'text', Common.UIString('User agent string'), () => true));
    const uaType = editor.createSelect(
        'ua-type',
        [
          Emulation.DeviceModeModel.UA.Mobile, Emulation.DeviceModeModel.UA.MobileNoTouch,
          Emulation.DeviceModeModel.UA.Desktop, Emulation.DeviceModeModel.UA.DesktopTouch
        ],
        () => true);
    uaType.classList.add('device-edit-fixed');
    ua.appendChild(uaType);

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
    function sizeValidator(item, index, input) {
      return Emulation.DeviceModeModel.deviceSizeValidator(input.value);
    }

    /**
     * @param {*} item
     * @param {number} index
     * @param {!HTMLInputElement|!HTMLSelectElement} input
     * @return {boolean}
     */
    function scaleValidator(item, index, input) {
      return Emulation.DeviceModeModel.deviceScaleFactorValidator(input.value);
    }
  }
};
