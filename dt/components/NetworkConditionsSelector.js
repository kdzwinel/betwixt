// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!HTMLSelectElement} selectElement
 */
WebInspector.NetworkConditionsSelector = function(selectElement)
{
    this._selectElement = selectElement;
    this._selectElement.addEventListener("change", this._optionSelected.bind(this), false);
    this._customSetting = WebInspector.moduleSetting("networkConditionsCustomProfiles");
    this._customSetting.addChangeListener(this._populateOptions, this);
    this._setting = WebInspector.moduleSetting("networkConditions");
    this._setting.addChangeListener(this._settingChanged, this);
    this._populateOptions();
}

/** @typedef {!{title: string, value: !WebInspector.NetworkManager.Conditions}} */
WebInspector.NetworkConditionsProfile;

/**
 * @param {!WebInspector.NetworkManager.Conditions} conditions
 * @return {string}
 */
WebInspector.NetworkConditionsSelector.throughputText = function(conditions)
{
    if (conditions.throughput < 0)
        return "";
    var throughputInKbps = conditions.throughput / (1024 / 8);
    return (throughputInKbps < 1024) ? WebInspector.UIString("%d kb/s", throughputInKbps) : WebInspector.UIString("%d Mb/s", (throughputInKbps / 1024) | 0);
}

/** @type {!Array.<!WebInspector.NetworkConditionsProfile>} */
WebInspector.NetworkConditionsSelector._networkConditionsPresets = [
    {title: "Offline", value: {throughput: 0 * 1024 / 8, latency: 0}},
    {title: "GPRS", value: {throughput: 50 * 1024 / 8, latency: 500}},
    {title: "Regular 2G", value: {throughput: 250 * 1024 / 8, latency: 300}},
    {title: "Good 2G", value: {throughput: 450 * 1024 / 8, latency: 150}},
    {title: "Regular 3G", value: {throughput: 750 * 1024 / 8, latency: 100}},
    {title: "Good 3G", value: {throughput: 1.5 * 1024 * 1024 / 8, latency: 40}},
    {title: "Regular 4G", value: {throughput: 4 * 1024 * 1024 / 8, latency: 20}},
    {title: "DSL", value: {throughput: 2 * 1024 * 1024 / 8, latency: 5}},
    {title: "WiFi", value: {throughput: 30 * 1024 * 1024 / 8, latency: 2}}
];

/** @type {!WebInspector.NetworkConditionsProfile} */
WebInspector.NetworkConditionsSelector._disabledPreset = {title: "No throttling", value: {throughput: -1, latency: 0}};

WebInspector.NetworkConditionsSelector.prototype = {
    _populateOptions: function()
    {
        this._selectElement.removeChildren();

        var customGroup = this._addGroup(this._customSetting.get(), WebInspector.UIString("Custom"));
        customGroup.insertBefore(new Option(WebInspector.UIString("Add\u2026"), WebInspector.UIString("Add\u2026")), customGroup.firstChild);

        this._addGroup(WebInspector.NetworkConditionsSelector._networkConditionsPresets, WebInspector.UIString("Presets"));
        this._addGroup([WebInspector.NetworkConditionsSelector._disabledPreset], WebInspector.UIString("Disabled"));

        this._settingChanged();
    },

    /**
     * @param {!Array.<!WebInspector.NetworkConditionsProfile>} presets
     * @param {string} groupName
     * @return {!Element}
     */
    _addGroup: function(presets, groupName)
    {
        var groupElement = this._selectElement.createChild("optgroup");
        groupElement.label = groupName;
        for (var i = 0; i < presets.length; ++i) {
            var preset = presets[i];
            var throughputInKbps = preset.value.throughput / (1024 / 8);
            var isThrottling = (throughputInKbps > 0) || preset.value.latency;
            var option;
            var presetTitle = WebInspector.UIString(preset.title);
            if (!isThrottling) {
                option = new Option(presetTitle, presetTitle);
            } else {
                var throughputText = WebInspector.NetworkConditionsSelector.throughputText(preset.value);
                var title = WebInspector.UIString("%s (%s %dms RTT)", presetTitle, throughputText, preset.value.latency);
                option = new Option(title, presetTitle);
                option.title = WebInspector.UIString("Maximum download throughput: %s.\r\nMinimum round-trip time: %dms.", throughputText, preset.value.latency);
            }
            option.settingValue = preset.value;
            groupElement.appendChild(option);
        }
        return groupElement;
    },

    _optionSelected: function()
    {
        if (this._selectElement.selectedIndex === 0) {
            WebInspector.Revealer.reveal(this._customSetting);
            this._settingChanged();
            return;
        }

        this._setting.removeChangeListener(this._settingChanged, this);
        this._setting.set(this._selectElement.options[this._selectElement.selectedIndex].settingValue);
        this._setting.addChangeListener(this._settingChanged, this);
    },

    _settingChanged: function()
    {
        var value = this._setting.get();
        var options = this._selectElement.options;
        for (var index = 1; index < options.length; ++index) {
            var option = options[index];
            if (option.settingValue.throughput === value.throughput && option.settingValue.latency === value.latency)
                this._selectElement.selectedIndex = index;
        }
    }
}


/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.ListWidget.Delegate}
 */
WebInspector.NetworkConditionsSettingsTab = function()
{
    WebInspector.VBox.call(this);
    this.element.classList.add("settings-tab-container");
    this.element.classList.add("network-conditions-settings-tab");
    this.registerRequiredCSS("components/networkConditionsSettingsTab.css");

    var header = this.element.createChild("header");
    header.createChild("h3").createTextChild(WebInspector.UIString("Network Throttling Profiles"));
    this.containerElement = this.element.createChild("div", "help-container-wrapper").createChild("div", "settings-tab help-content help-container");

    var buttonsRow = this.containerElement.createChild("div", "button-row");
    var addButton = createTextButton(WebInspector.UIString("Add custom profile..."), this._addButtonClicked.bind(this));
    buttonsRow.appendChild(addButton);

    this._list = new WebInspector.ListWidget(this);
    this._list.registerRequiredCSS("components/networkConditionsSettingsTab.css");
    this._list.show(this.containerElement);

    this._customSetting = WebInspector.moduleSetting("networkConditionsCustomProfiles");
    this._customSetting.addChangeListener(this._conditionsUpdated, this);

    this.setDefaultFocusedElement(addButton);
}

WebInspector.NetworkConditionsSettingsTab.prototype = {
    wasShown: function()
    {
        WebInspector.VBox.prototype.wasShown.call(this);
        this._conditionsUpdated();
    },

    _conditionsUpdated: function()
    {
        if (this._muteUpdate)
            return;

        this._list.clear();

        var conditions = this._customSetting.get();
        for (var i = 0; i < conditions.length; ++i)
            this._list.appendItem(conditions[i], true);

        this._list.appendSeparator();

        conditions = WebInspector.NetworkConditionsSelector._networkConditionsPresets;
        for (var i = 0; i < conditions.length; ++i)
            this._list.appendItem(conditions[i], false);
    },

    _addButtonClicked: function()
    {
        this._list.addNewItem(this._customSetting.get().length, {title: "", value: {throughput: 0, latency: 0}});
    },

    /**
     * @override
     * @param {*} item
     * @param {boolean} editable
     * @return {!Element}
     */
    renderItem: function(item, editable)
    {
        var conditions = /** @type {!WebInspector.NetworkConditionsProfile} */ (item);
        var element = createElementWithClass("div", "conditions-list-item");
        var title = element.createChild("div", "conditions-list-text conditions-list-title");
        var titleText = title.createChild("div", "conditions-list-title-text");
        titleText.textContent = conditions.title;
        titleText.title = conditions.title;
        element.createChild("div", "conditions-list-separator");
        element.createChild("div", "conditions-list-text").textContent = WebInspector.NetworkConditionsSelector.throughputText(conditions.value);
        element.createChild("div", "conditions-list-separator");
        element.createChild("div", "conditions-list-text").textContent = WebInspector.UIString("%dms", conditions.value.latency);
        return element;
    },

    /**
     * @override
     * @param {*} item
     * @param {number} index
     */
    removeItemRequested: function(item, index)
    {
        var list = this._customSetting.get();
        list.splice(index, 1);
        this._muteUpdate = true;
        this._customSetting.set(list);
        this._muteUpdate = false;
        this._list.removeItem(index);
    },

    /**
     * @override
     * @param {*} item
     * @param {!WebInspector.ListWidget.Editor} editor
     * @param {boolean} isNew
     */
    commitEdit: function(item, editor, isNew)
    {
        var conditions = /** @type {?WebInspector.NetworkConditionsProfile} */ (item);
        conditions.title = editor.control("title").value.trim();
        var throughput = editor.control("throughput").value.trim();
        conditions.value.throughput = throughput ? parseInt(throughput, 10) * (1024 / 8) : -1;
        var latency = editor.control("latency").value.trim();
        conditions.value.latency = latency ? parseInt(latency, 10) : 0;

        var list = this._customSetting.get();
        if (isNew)
            list.push(conditions);
        this._customSetting.set(list);
    },

    /**
     * @override
     * @param {*} item
     * @return {!WebInspector.ListWidget.Editor}
     */
    beginEdit: function(item)
    {
        var conditions = /** @type {?WebInspector.NetworkConditionsProfile} */ (item);
        var editor = this._createEditor();
        editor.control("title").value = conditions.title;
        editor.control("throughput").value = conditions.value.throughput < 0 ? "" : String(conditions.value.throughput / (1024 / 8));
        editor.control("latency").value = String(conditions.value.latency);
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

        var titles = content.createChild("div", "conditions-edit-row");
        titles.createChild("div", "conditions-list-text conditions-list-title").textContent = WebInspector.UIString("Profile Name");
        titles.createChild("div", "conditions-list-separator conditions-list-separator-invisible");
        titles.createChild("div", "conditions-list-text").textContent = WebInspector.UIString("Throughput");
        titles.createChild("div", "conditions-list-separator conditions-list-separator-invisible");
        titles.createChild("div", "conditions-list-text").textContent = WebInspector.UIString("Latency");

        var fields = content.createChild("div", "conditions-edit-row");
        fields.createChild("div", "conditions-list-text conditions-list-title").appendChild(editor.createInput("title", "text", "", titleValidator));
        fields.createChild("div", "conditions-list-separator conditions-list-separator-invisible");

        var cell = fields.createChild("div", "conditions-list-text");
        cell.appendChild(editor.createInput("throughput", "text", WebInspector.UIString("kb/s"), throughputValidator));
        cell.createChild("div", "conditions-edit-optional").textContent = WebInspector.UIString("optional");
        fields.createChild("div", "conditions-list-separator conditions-list-separator-invisible");

        cell = fields.createChild("div", "conditions-list-text");
        cell.appendChild(editor.createInput("latency", "text", WebInspector.UIString("ms"), latencyValidator));
        cell.createChild("div", "conditions-edit-optional").textContent = WebInspector.UIString("optional");

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
        function throughputValidator(input)
        {
            var value = input.value.trim();
            return !value || (/^[\d]+(\.\d+)?|\.\d+$/.test(value) && value >= 0 && value <= 10000000);
        }

        /**
         * @param {!HTMLInputElement|!HTMLSelectElement} input
         * @return {boolean}
         */
        function latencyValidator(input)
        {
            var value = input.value.trim();
            return !value || (/^[\d]+$/.test(value) && value >= 0 && value <= 1000000);
        }
    },

    __proto__: WebInspector.VBox.prototype
}
