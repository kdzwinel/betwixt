/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @implements {WebInspector.ListWidget.Delegate}
 */
WebInspector.FrameworkBlackboxSettingsTab = function()
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("settings/frameworkBlackboxSettingsTab.css");

    this.contentElement.createChild("div", "header").textContent = WebInspector.UIString("Framework Blackbox Patterns");
    this.contentElement.createChild("div", "blackbox-content-scripts").appendChild(WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Blackbox content scripts"), WebInspector.moduleSetting("skipContentScripts"), true));

    this._blackboxLabel = WebInspector.UIString("Blackbox");
    this._disabledLabel = WebInspector.UIString("Disabled");

    this._list = new WebInspector.ListWidget(this);
    this._list.element.classList.add("blackbox-list");
    this._list.registerRequiredCSS("settings/frameworkBlackboxSettingsTab.css");

    var placeholder = createElementWithClass("div", "blackbox-list-empty");
    placeholder.textContent = WebInspector.UIString("No blackboxed patterns");
    this._list.setEmptyPlaceholder(placeholder);
    this._list.show(this.contentElement);
    this.contentElement.appendChild(createTextButton(WebInspector.UIString("Add pattern..."), this._addButtonClicked.bind(this), "add-button"));

    this._setting = WebInspector.moduleSetting("skipStackFramesPattern");
    this._setting.addChangeListener(this._settingUpdated, this);

    this.contentElement.tabIndex = 0;
}

WebInspector.FrameworkBlackboxSettingsTab.prototype = {
    wasShown: function()
    {
        WebInspector.SettingsTab.prototype.wasShown.call(this);
        this._settingUpdated();
    },

    _settingUpdated: function()
    {
        if (this._muteUpdate)
            return;

        this._list.clear();
        var patterns = this._setting.getAsArray();
        for (var i = 0; i < patterns.length; ++i)
            this._list.appendItem(patterns[i], true);
    },

    _addButtonClicked: function()
    {
        this._list.addNewItem(this._setting.getAsArray().length, {pattern: "", disabled: false});
    },

    /**
     * @override
     * @param {*} item
     * @param {boolean} editable
     * @return {!Element}
     */
    renderItem: function(item, editable)
    {
        var element = createElementWithClass("div", "blackbox-list-item");
        var pattern = element.createChild("div", "blackbox-pattern");
        pattern.textContent = item.pattern;
        pattern.title = item.pattern;
        element.createChild("div", "blackbox-separator");
        element.createChild("div", "blackbox-behavior").textContent = item.disabled ? this._disabledLabel : this._blackboxLabel;
        if (item.disabled)
            element.classList.add("blackbox-disabled");
        return element;
    },

    /**
     * @override
     * @param {*} item
     * @param {number} index
     */
    removeItemRequested: function(item, index)
    {
        var patterns = this._setting.getAsArray();
        patterns.splice(index, 1);
        this._muteUpdate = true;
        this._setting.setAsArray(patterns);
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
        item.pattern = editor.control("pattern").value.trim();
        item.disabled = editor.control("behavior").value === this._disabledLabel;

        var list = this._setting.getAsArray();
        if (isNew)
            list.push(item);
        this._setting.setAsArray(list);
    },

    /**
     * @override
     * @param {*} item
     * @return {!WebInspector.ListWidget.Editor}
     */
    beginEdit: function(item)
    {
        var editor = this._createEditor();
        editor.control("pattern").value = item.pattern;
        editor.control("behavior").value = item.disabled ? this._disabledLabel : this._blackboxLabel;
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

        var titles = content.createChild("div", "blackbox-edit-row");
        titles.createChild("div", "blackbox-pattern").textContent = WebInspector.UIString("Pattern");
        titles.createChild("div", "blackbox-separator blackbox-separator-invisible");
        titles.createChild("div", "blackbox-behavior").textContent = WebInspector.UIString("Behavior");

        var fields = content.createChild("div", "blackbox-edit-row");
        fields.createChild("div", "blackbox-pattern").appendChild(editor.createInput("pattern", "text", "/framework\\.js$", patternValidator));
        fields.createChild("div", "blackbox-separator blackbox-separator-invisible");
        fields.createChild("div", "blackbox-behavior").appendChild(editor.createSelect("behavior", [this._blackboxLabel, this._disabledLabel], behaviorValidator));

        return editor;

        /**
         * @param {!HTMLInputElement|!HTMLSelectElement} input
         * @return {boolean}
         */
        function patternValidator(input)
        {
            var pattern = input.value.trim();
            var regex;
            try {
                regex = new RegExp(pattern);
            } catch (e) {
            }
            return !!(pattern && regex);
        }

        /**
         * @param {!HTMLInputElement|!HTMLSelectElement} input
         * @return {boolean}
         */
        function behaviorValidator(input)
        {
            return true;
        }
    },

    __proto__: WebInspector.VBox.prototype
}
