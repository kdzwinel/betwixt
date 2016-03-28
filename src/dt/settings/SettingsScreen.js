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
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.SettingsScreen = function()
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("settings/settingsScreen.css");
    this.element.id = "settings-screen";

    this.contentElement.tabIndex = 0;
    this.contentElement.classList.add("help-window-main");
    this.contentElement.classList.add("vbox");
    var settingsLabelElement = createElementWithClass("div", "help-window-label");
    settingsLabelElement.createTextChild(WebInspector.UIString("Settings"));

    this._tabbedPane = new WebInspector.TabbedPane();
    this._tabbedPane.insertBeforeTabStrip(settingsLabelElement);
    this._tabbedPane.setShrinkableTabs(false);
    this._tabbedPane.setVerticalTabLayout(true);
    this._tabbedPane.appendTab("general", WebInspector.UIString("General"), new WebInspector.GenericSettingsTab());
    this._tabbedPane.appendTab("workspace", WebInspector.UIString("Workspace"), new WebInspector.WorkspaceSettingsTab());
    this._tabbedPane.appendTab("blackbox", WebInspector.manageBlackboxingSettingsTabLabel(), new WebInspector.FrameworkBlackboxSettingsTab());
    if (Runtime.experiments.supportEnabled())
        this._tabbedPane.appendTab("experiments", WebInspector.UIString("Experiments"), new WebInspector.ExperimentsSettingsTab());
    this._tabbedPaneController = new WebInspector.ExtensibleTabbedPaneController(this._tabbedPane, "settings-view");
    this._tabbedPane.appendTab("shortcuts", WebInspector.UIString("Shortcuts"), WebInspector.shortcutsScreen.createShortcutsTabView());

    this.element.addEventListener("keydown", this._keyDown.bind(this), false);
    this._developerModeCounter = 0;
    this.setDefaultFocusedElement(this.contentElement);
}

WebInspector.SettingsScreen.prototype = {
    /**
     * @override
     */
    wasShown: function()
    {
        this._tabbedPane.selectTab("general");
        this._tabbedPane.show(this.contentElement);
        WebInspector.VBox.prototype.wasShown.call(this);
    },

    /**
     * @param {string} name
     */
    selectTab: function(name)
    {
        this._tabbedPane.selectTab(name);
    },

    /**
     * @param {!Event} event
     */
    _keyDown: function(event)
    {
        var shiftKeyCode = 16;
        if (event.keyCode === shiftKeyCode && ++this._developerModeCounter > 5)
            this.contentElement.classList.add("settings-developer-mode");
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @param {string} name
 * @param {string=} id
 */
WebInspector.SettingsTab = function(name, id)
{
    WebInspector.VBox.call(this);
    this.element.classList.add("settings-tab-container");
    if (id)
        this.element.id = id;
    var header = this.element.createChild("header");
    header.createChild("h3").createTextChild(name);
    this.containerElement = this.element.createChild("div", "help-container-wrapper").createChild("div", "settings-tab help-content help-container");
}

WebInspector.SettingsTab.prototype = {
    /**
     *  @param {string=} name
     *  @return {!Element}
     */
    _appendSection: function(name)
    {
        var block = this.containerElement.createChild("div", "help-block");
        if (name)
            block.createChild("div", "help-section-title").textContent = name;
        return block;
    },

    _createSelectSetting: function(name, options, setting)
    {
        var p = createElement("p");
        p.createChild("label").textContent = name;

        var select = p.createChild("select", "chrome-select");
        var settingValue = setting.get();

        for (var i = 0; i < options.length; ++i) {
            var option = options[i];
            select.add(new Option(option[0], option[1]));
            if (settingValue === option[1])
                select.selectedIndex = i;
        }

        function changeListener(e)
        {
            // Don't use e.target.value to avoid conversion of the value to string.
            setting.set(options[select.selectedIndex][1]);
        }

        select.addEventListener("change", changeListener, false);
        return p;
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SettingsTab}
 */
WebInspector.GenericSettingsTab = function()
{
    WebInspector.SettingsTab.call(this, WebInspector.UIString("General"), "general-tab-content");

    /** @const */
    var explicitSectionOrder = ["", "Appearance", "Elements", "Sources", "Network", "Profiler", "Console", "Extensions"];
    /** @type {!Map<string, !Element>} */
    this._nameToSection = new Map();
    /** @type {!Map<string, !Element>} */
    this._nameToSettingElement = new Map();
    for (var sectionName of explicitSectionOrder)
        this._sectionElement(sectionName);
    self.runtime.extensions("setting").forEach(this._addSetting.bind(this));
    self.runtime.extensions(WebInspector.SettingUI).forEach(this._addSettingUI.bind(this));

    this._appendSection().appendChild(createTextButton(WebInspector.UIString("Restore defaults and reload"), restoreAndReload));

    function restoreAndReload()
    {
        WebInspector.settings.clearAll();
        WebInspector.reload();
    }
}

/**
 * @param {!Runtime.Extension} extension
 * @return {boolean}
 */
WebInspector.GenericSettingsTab.isSettingVisible = function(extension)
{
    var descriptor = extension.descriptor();
    if (!("title" in descriptor))
        return false;
    if (!(("category" in descriptor) || ("parentSettingName" in descriptor)))
        return false;
    return true;
}

WebInspector.GenericSettingsTab.prototype = {
    /**
     * @param {!Runtime.Extension} extension
     */
    _addSetting: function(extension)
    {
        if (!WebInspector.GenericSettingsTab.isSettingVisible(extension))
            return;
        var descriptor = extension.descriptor();
        var sectionName = descriptor["category"];
        var settingName = descriptor["settingName"];
        var setting = WebInspector.moduleSetting(settingName);
        var uiTitle = WebInspector.UIString(extension.title(WebInspector.platform()));

        var sectionElement = this._sectionElement(sectionName);
        var parentSettingName = descriptor["parentSettingName"];
        var parentSettingElement = parentSettingName ? this._nameToSettingElement.get(descriptor["parentSettingName"]) : null;
        var parentFieldset = null;
        if (parentSettingElement) {
            parentFieldset = parentSettingElement.__fieldset;
            if (!parentFieldset) {
                parentFieldset = WebInspector.SettingsUI.createSettingFieldset(WebInspector.moduleSetting(parentSettingName));
                parentSettingElement.appendChild(parentFieldset);
                parentSettingElement.__fieldset = parentFieldset;
            }
        }

        var settingControl;

        switch (descriptor["settingType"]) {
        case "boolean":
            settingControl = WebInspector.SettingsUI.createSettingCheckbox(uiTitle, setting);
            break;
        case "enum":
            var descriptorOptions = descriptor["options"];
            var options = new Array(descriptorOptions.length);
            for (var i = 0; i < options.length; ++i) {
                // The third array item flags that the option name is "raw" (non-i18n-izable).
                var optionName = descriptorOptions[i][2] ? descriptorOptions[i][0] : WebInspector.UIString(descriptorOptions[i][0]);
                options[i] = [optionName, descriptorOptions[i][1]];
            }
            settingControl = this._createSelectSetting(uiTitle, options, setting);
            break;
        default:
            console.error("Invalid setting type: " + descriptor["settingType"]);
            return;
        }
        this._nameToSettingElement.set(settingName, settingControl);
        (parentFieldset || sectionElement).appendChild(/** @type {!Element} */ (settingControl));
    },

    /**
     * @param {!Runtime.Extension} extension
     */
    _addSettingUI: function(extension)
    {
        var descriptor = extension.descriptor();
        var sectionName = descriptor["category"] || "";
        extension.instancePromise().then(appendCustomSetting.bind(this));

        /**
         * @param {!Object} object
         * @this {WebInspector.GenericSettingsTab}
         */
        function appendCustomSetting(object)
        {
            var settingUI = /** @type {!WebInspector.SettingUI} */ (object);
            var element = settingUI.settingElement();
            if (element)
                this._sectionElement(sectionName).appendChild(element);
        }
    },

    /**
     * @param {string} sectionName
     * @return {!Element}
     */
    _sectionElement: function(sectionName)
    {
        var sectionElement = this._nameToSection.get(sectionName);
        if (!sectionElement) {
            var uiSectionName = sectionName && WebInspector.UIString(sectionName);
            sectionElement = this._appendSection(uiSectionName);
            this._nameToSection.set(sectionName, sectionElement);
        }
        return sectionElement;
    },

    __proto__: WebInspector.SettingsTab.prototype
}

/**
 * @constructor
 * @extends {WebInspector.SettingsTab}
 */
WebInspector.WorkspaceSettingsTab = function()
{
    WebInspector.SettingsTab.call(this, WebInspector.UIString("Workspace"), "workspace-tab-content");
    WebInspector.isolatedFileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemAdded, this._fileSystemAdded, this);
    WebInspector.isolatedFileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemRemoved, this._fileSystemRemoved, this);

    var folderExcludeSetting = WebInspector.isolatedFileSystemManager.workspaceFolderExcludePatternSetting();
    var folderExcludePatternInput = WebInspector.SettingsUI.createSettingInputField(WebInspector.UIString("Folder exclude pattern"), folderExcludeSetting, false, 0, "270px", WebInspector.SettingsUI.regexValidator);
    folderExcludePatternInput.classList.add("folder-exclude-pattern");
    this.containerElement.appendChild(folderExcludePatternInput);

    this._fileSystemsListContainer = this.containerElement.createChild("div", "");

    this.containerElement.appendChild(createTextButton(WebInspector.UIString("Add folder\u2026"), this._addFileSystemClicked.bind(this)));

    /** @type {!Map<string, !Element>} */
    this._elementByPath = new Map();

    /** @type {!Map<string, !WebInspector.EditFileSystemView>} */
    this._mappingViewByPath = new Map();

    var fileSystemPaths = WebInspector.isolatedFileSystemManager.fileSystemPaths();
    for (var i = 0; i < fileSystemPaths.length; ++i)
        this._addItem(/** @type {!WebInspector.IsolatedFileSystem} */ (WebInspector.isolatedFileSystemManager.fileSystem(fileSystemPaths[i])));
}

WebInspector.WorkspaceSettingsTab.prototype = {
    /**
     * @param {!WebInspector.IsolatedFileSystem} fileSystem
     */
    _addItem: function(fileSystem)
    {
        var element = this._renderFileSystem(fileSystem);
        this._elementByPath.set(fileSystem.path(), element);

        this._fileSystemsListContainer.appendChild(element);

        var mappingView = new WebInspector.EditFileSystemView(fileSystem.path());
        this._mappingViewByPath.set(fileSystem.path(), mappingView);
        mappingView.element.classList.add("file-system-mapping-view");
        mappingView.show(element);
    },

    /**
     * @param {!WebInspector.IsolatedFileSystem} fileSystem
     * @return {!Element}
     */
    _renderFileSystem: function(fileSystem)
    {
        var fileSystemPath = fileSystem.path();
        var lastIndexOfSlash = fileSystemPath.lastIndexOf(WebInspector.isWin() ? "\\" : "/");
        var folderName = fileSystemPath.substr(lastIndexOfSlash + 1);

        var element = createElementWithClass("div", "file-system-container");
        var header = element.createChild("div", "file-system-header");

        header.createChild("div", "file-system-name").textContent = folderName;
        var path = header.createChild("div", "file-system-path");
        path.textContent = fileSystemPath;
        path.title = fileSystemPath;

        var toolbar = new WebInspector.Toolbar();
        var button = new WebInspector.ToolbarButton(WebInspector.UIString("Remove"), "delete-toolbar-item");
        button.addEventListener("click", this._removeFileSystemClicked.bind(this, fileSystem));
        toolbar.appendToolbarItem(button);
        header.appendChild(toolbar.element);

        return element;
    },

    /**
     * @param {!WebInspector.IsolatedFileSystem} fileSystem
     */
    _removeFileSystemClicked: function(fileSystem)
    {
        WebInspector.isolatedFileSystemManager.removeFileSystem(fileSystem.path());
    },

    _addFileSystemClicked: function()
    {
        WebInspector.isolatedFileSystemManager.addFileSystem("");
    },

    _fileSystemAdded: function(event)
    {
        var fileSystem = /** @type {!WebInspector.IsolatedFileSystem} */ (event.data);
        this._addItem(fileSystem);
    },

    _fileSystemRemoved: function(event)
    {
        var fileSystem = /** @type {!WebInspector.IsolatedFileSystem} */ (event.data);

        var mappingView = this._mappingViewByPath.get(fileSystem.path());
        if (mappingView) {
            mappingView.dispose();
            this._mappingViewByPath.delete(fileSystem.path());
        }

        var element = this._elementByPath.get(fileSystem.path());
        if (element) {
            this._elementByPath.delete(fileSystem.path());
            element.remove();
        }
    },

    __proto__: WebInspector.SettingsTab.prototype
}


/**
 * @constructor
 * @extends {WebInspector.SettingsTab}
 */
WebInspector.ExperimentsSettingsTab = function()
{
    WebInspector.SettingsTab.call(this, WebInspector.UIString("Experiments"), "experiments-tab-content");

    var experiments = Runtime.experiments.allConfigurableExperiments();
    if (experiments.length) {
        var experimentsSection = this._appendSection();
        experimentsSection.appendChild(this._createExperimentsWarningSubsection());
        for (var i = 0; i < experiments.length; ++i)
            experimentsSection.appendChild(this._createExperimentCheckbox(experiments[i]));
    }
}

WebInspector.ExperimentsSettingsTab.prototype = {
    /**
     * @return {!Element} element
     */
    _createExperimentsWarningSubsection: function()
    {
        var subsection = createElement("div");
        var warning = subsection.createChild("span", "settings-experiments-warning-subsection-warning");
        warning.textContent = WebInspector.UIString("WARNING:");
        subsection.createTextChild(" ");
        var message = subsection.createChild("span", "settings-experiments-warning-subsection-message");
        message.textContent = WebInspector.UIString("These experiments could be dangerous and may require restart.");
        return subsection;
    },

    _createExperimentCheckbox: function(experiment)
    {
        var label = createCheckboxLabel(WebInspector.UIString(experiment.title), experiment.isEnabled());
        var input = label.checkboxElement;
        input.name = experiment.name;
        function listener()
        {
            experiment.setEnabled(input.checked);
        }
        input.addEventListener("click", listener, false);

        var p = createElement("p");
        p.className = experiment.hidden && !experiment.isEnabled() ? "settings-experiment-hidden" : "";
        p.appendChild(label);
        return p;
    },

    __proto__: WebInspector.SettingsTab.prototype
}

/**
 * @constructor
 */
WebInspector.SettingsController = function()
{
    /** @type {?WebInspector.SettingsScreen} */
    this._settingsScreen;
}

WebInspector.SettingsController.prototype = {
    /**
     * @param {string=} name
     */
    showSettingsScreen: function(name)
    {
        if (!this._settingsScreen)
            this._settingsScreen = new WebInspector.SettingsScreen();

        var dialog = new WebInspector.Dialog();
        dialog.addCloseButton();
        this._settingsScreen.show(dialog.element);
        dialog.show();

        if (name)
            this._settingsScreen.selectTab(name);
    }
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.SettingsController.ActionDelegate = function() { }

WebInspector.SettingsController.ActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     * @return {boolean}
     */
    handleAction: function(context, actionId)
    {
        switch (actionId) {
        case "settings.show":
            WebInspector._settingsController.showSettingsScreen();
            return true;
        case "settings.help":
            InspectorFrontendHost.openInNewTab("https://developers.google.com/web/tools/chrome-devtools/");
            return true;
        case "settings.shortcuts":
            WebInspector._settingsController.showSettingsScreen("shortcuts");
            return true;
        }
        return false;
    }
}

/**
 * @constructor
 * @implements {WebInspector.Revealer}
 */
WebInspector.SettingsController.Revealer = function() { }

WebInspector.SettingsController.Revealer.prototype = {
    /**
     * @override
     * @param {!Object} object
     * @param {number=} lineNumber
     * @return {!Promise}
     */
    reveal: function(object, lineNumber)
    {
        console.assert(object instanceof WebInspector.Setting);
        var setting = /** @type {!WebInspector.Setting} */ (object);
        var success = false;

        self.runtime.extensions("setting").forEach(revealModuleSetting);
        self.runtime.extensions(WebInspector.SettingUI).forEach(revealSettingUI);
        self.runtime.extensions("settings-view").forEach(revealSettingsView);

        return success ? Promise.resolve() : Promise.reject();

        /**
         * @param {!Runtime.Extension} extension
         */
        function revealModuleSetting(extension)
        {
            if (!WebInspector.GenericSettingsTab.isSettingVisible(extension))
                return;
            if (extension.descriptor()["settingName"] === setting.name) {
                WebInspector._settingsController.showSettingsScreen("general");
                success = true;
            }
        }

        /**
         * @param {!Runtime.Extension} extension
         */
        function revealSettingUI(extension)
        {
            var settings = extension.descriptor()["settings"];
            if (settings && settings.indexOf(setting.name) !== -1) {
                WebInspector._settingsController.showSettingsScreen("general");
                success = true;
            }
        }

        /**
         * @param {!Runtime.Extension} extension
         */
        function revealSettingsView(extension)
        {
            var settings = extension.descriptor()["settings"];
            if (settings && settings.indexOf(setting.name) !== -1) {
                WebInspector._settingsController.showSettingsScreen(extension.descriptor()["name"]);
                success = true;
            }
        }
    }
}

WebInspector._settingsController = new WebInspector.SettingsController();
