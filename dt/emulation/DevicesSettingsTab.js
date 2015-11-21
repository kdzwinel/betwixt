// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.ListWidget.Delegate}
 */
WebInspector.DevicesSettingsTab = function()
{
    WebInspector.VBox.call(this);
    this.element.classList.add("settings-tab-container");
    this.element.classList.add("devices-settings-tab");
    this.registerRequiredCSS("emulation/devicesSettingsTab.css");

    var header = this.element.createChild("header");
    header.createChild("h3").createTextChild(WebInspector.UIString("Emulated Devices"));
    this.containerElement = this.element.createChild("div", "help-container-wrapper").createChild("div", "settings-tab help-content help-container");

    var buttonsRow = this.containerElement.createChild("div", "devices-button-row");
    var addCustomButton = createTextButton(WebInspector.UIString("Add custom device..."), this._addCustomDevice.bind(this));
    buttonsRow.appendChild(addCustomButton);

    this._list = new WebInspector.ListWidget(this);
    this._list.registerRequiredCSS("emulation/devicesSettingsTab.css");
    this._list.element.classList.add("devices-list");
    this._list.show(this.containerElement);

    this._muteUpdate = false;
    WebInspector.emulatedDevicesList.addEventListener(WebInspector.EmulatedDevicesList.Events.CustomDevicesUpdated, this._devicesUpdated, this);
    WebInspector.emulatedDevicesList.addEventListener(WebInspector.EmulatedDevicesList.Events.StandardDevicesUpdated, this._devicesUpdated, this);

    this.setDefaultFocusedElement(addCustomButton);
}

WebInspector.DevicesSettingsTab.prototype = {
    wasShown: function()
    {
        WebInspector.VBox.prototype.wasShown.call(this);
        this._devicesUpdated();
    },

    _devicesUpdated: function()
    {
        if (this._muteUpdate)
            return;

        this._list.clear();

        var devices = WebInspector.emulatedDevicesList.custom().slice();
        for (var i = 0; i < devices.length; ++i)
            this._list.appendItem(devices[i], true);

        this._list.appendSeparator();

        devices = WebInspector.emulatedDevicesList.standard().slice();
        devices.sort(WebInspector.EmulatedDevice.compareByTitle);
        for (var i = 0; i < devices.length; ++i)
            this._list.appendItem(devices[i], false);
    },

    /**
     * @param {boolean} custom
     */
    _muteAndSaveDeviceList: function(custom)
    {
        this._muteUpdate = true;
        if (custom)
            WebInspector.emulatedDevicesList.saveCustomDevices();
        else
            WebInspector.emulatedDevicesList.saveStandardDevices();
        this._muteUpdate = false;
    },

    _addCustomDevice: function()
    {
        var device = new WebInspector.EmulatedDevice();
        device.deviceScaleFactor = 0;
        this._list.addNewItem(WebInspector.emulatedDevicesList.custom().length, device);
    },

    /**
     * @param {number} value
     * @return {string}
     */
    _toNumericInputValue: function(value)
    {
        return value ? String(value) : "";
    },

    /**
     * @override
     * @param {*} item
     * @param {boolean} editable
     * @return {!Element}
     */
    renderItem: function(item, editable)
    {
        var device = /** @type {!WebInspector.EmulatedDevice} */ (item);
        var element = createElementWithClass("div", "devices-list-item");
        var checkbox = element.createChild("input", "devices-list-checkbox");
        checkbox.type = "checkbox";
        checkbox.checked = device.show();
        element.createChild("div", "devices-list-title").textContent = device.title;
        element.addEventListener("click", onItemClicked.bind(this), false);
        element.classList.toggle("device-list-item-show", device.show());
        return element;

        /**
         * @param {!Event} event
         * @this {WebInspector.DevicesSettingsTab}
         */
        function onItemClicked(event)
        {
            var show = !checkbox.checked;
            device.setShow(show);
            this._muteAndSaveDeviceList(editable);
            checkbox.checked = show;
            element.classList.toggle("device-list-item-show", show);
            event.consume();
        }
    },

    /**
     * @override
     * @param {*} item
     * @param {number} index
     */
    removeItemRequested: function(item, index)
    {
        WebInspector.emulatedDevicesList.removeCustomDevice(/** @type {!WebInspector.EmulatedDevice} */ (item));
    },

    /**
     * @override
     * @param {*} item
     * @param {!WebInspector.ListWidget.Editor} editor
     * @param {boolean} isNew
     */
    commitEdit: function(item, editor, isNew)
    {
        var device = /** @type {!WebInspector.EmulatedDevice} */ (item);
        device.title = editor.control("title").value.trim();
        device.vertical.width = editor.control("width").value ? parseInt(editor.control("width").value, 10) : 0;
        device.vertical.height = editor.control("height").value ? parseInt(editor.control("height").value, 10) : 0;
        device.horizontal.width = device.vertical.height;
        device.horizontal.height = device.vertical.width;
        device.deviceScaleFactor = editor.control("scale").value ? parseFloat(editor.control("scale").value) : 0;
        device.userAgent = editor.control("user-agent").value;
        device.modes = [];
        device.modes.push({title: "", orientation: WebInspector.EmulatedDevice.Horizontal, insets: new Insets(0, 0, 0, 0), images: null});
        device.modes.push({title: "", orientation: WebInspector.EmulatedDevice.Vertical, insets: new Insets(0, 0, 0, 0), images: null});

        if (isNew)
            WebInspector.emulatedDevicesList.addCustomDevice(device);
        else
            WebInspector.emulatedDevicesList.saveCustomDevices();
    },

    /**
     * @override
     * @param {*} item
     * @return {!WebInspector.ListWidget.Editor}
     */
    beginEdit: function(item)
    {
        var device = /** @type {!WebInspector.EmulatedDevice} */ (item);
        var editor = this._createEditor();
        editor.control("title").value = device.title;
        editor.control("width").value = this._toNumericInputValue(device.vertical.width);
        editor.control("height").value = this._toNumericInputValue(device.vertical.height);
        editor.control("scale").value = this._toNumericInputValue(device.deviceScaleFactor);
        editor.control("user-agent").value = device.userAgent;
        return editor;
    },

    /**
     * @return {!WebInspector.ListWidget.Editor}
     */
    _createEditor: function()
    {
        if (this._editor)
            return this._editor;

        var editor = new WebInspector.ListWidget.Editor();
        this._editor = editor;
        var content = editor.contentElement();

        var fields = content.createChild("div", "devices-edit-fields");
        fields.appendChild(editor.createInput("title", "text", WebInspector.UIString("Device name"), titleValidator));
        var screen = fields.createChild("div", "hbox");
        var width = editor.createInput("width", "text", WebInspector.UIString("Width"), sizeValidator);
        width.classList.add("device-edit-small");
        screen.appendChild(width);
        var height = editor.createInput("height", "text", WebInspector.UIString("height"), sizeValidator);
        height.classList.add("device-edit-small");
        screen.appendChild(height);
        screen.appendChild(editor.createInput("scale", "text", WebInspector.UIString("Device pixel ratio"), scaleValidator));
        fields.appendChild(editor.createInput("user-agent", "text", WebInspector.UIString("User agent string"), userAgentValidator));

        return editor;

        /**
         * @param {!HTMLInputElement|!HTMLSelectElement} input
         * @return {boolean}
         */
        function titleValidator(input)
        {
            var value = input.value.trim();
            return value.length > 0 && value.length < 50;
        }

        /**
         * @param {!HTMLInputElement|!HTMLSelectElement} input
         * @return {boolean}
         */
        function sizeValidator(input)
        {
            return !WebInspector.OverridesSupport.deviceSizeValidator(input.value);
        }

        /**
         * @param {!HTMLInputElement|!HTMLSelectElement} input
         * @return {boolean}
         */
        function scaleValidator(input)
        {
            return !WebInspector.OverridesSupport.deviceScaleFactorValidator(input.value);
        }

        /**
         * @param {!HTMLInputElement|!HTMLSelectElement} input
         * @return {boolean}
         */
        function userAgentValidator(input)
        {
            return true;
        }
    },

    __proto__: WebInspector.VBox.prototype
}
