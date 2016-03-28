// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!WebInspector.TargetManager} targetManager
 * @param {!WebInspector.Workspace} workspace
 * @param {!WebInspector.FileSystemWorkspaceBinding} fileSystemWorkspaceBinding
 * @param {!WebInspector.FileSystemMapping} fileSystemMapping
 */
WebInspector.NetworkMapping = function(targetManager, workspace, fileSystemWorkspaceBinding, fileSystemMapping)
{
    this._targetManager = targetManager;
    this._workspace = workspace;
    this._fileSystemWorkspaceBinding = fileSystemWorkspaceBinding;
    this._fileSystemMapping = fileSystemMapping;
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.RevealSourceLine, this._revealSourceLine, this);

    // For now, following block is here primarily for testing since in the real life, network manager is created early enough to capture those events.
    var fileSystemManager = fileSystemWorkspaceBinding.fileSystemManager();
    for (var path of fileSystemManager.fileSystemPaths()) {
        var fileSystem = fileSystemManager.fileSystem(path);
        this._fileSystemAdded(new WebInspector.Event(fileSystemManager, WebInspector.IsolatedFileSystemManager.Events.FileSystemAdded, fileSystem));
    }
    if (fileSystemManager.fileSystemsLoaded())
        this._fileSystemsLoaded();

    fileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemAdded, this._fileSystemAdded, this);
    fileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemRemoved, this._fileSystemRemoved, this);
    fileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemsLoaded, this._fileSystemsLoaded, this);

    this._fileSystemMapping.addEventListener(WebInspector.FileSystemMapping.Events.FileMappingAdded, this._fileSystemMappingChanged, this);
    this._fileSystemMapping.addEventListener(WebInspector.FileSystemMapping.Events.FileMappingRemoved, this._fileSystemMappingChanged, this);
}

WebInspector.NetworkMapping.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _fileSystemAdded: function(event)
    {
        this._addingFileSystem = true;
        var fileSystem = /** @type {!WebInspector.IsolatedFileSystem} */ (event.data);
        this._fileSystemMapping.addFileSystem(fileSystem.path());

        var mappings = fileSystem.projectProperty("mappings");
        for (var i = 0; Array.isArray(mappings) && i < mappings.length; ++i) {
            var mapping = mappings[i];
            if (!mapping || typeof mapping !== "object")
                continue;
            var folder = mapping["folder"];
            var url = mapping["url"];
            if (typeof folder !== "string" || typeof url !== "string")
                continue;
            this._fileSystemMapping.addNonConfigurableFileMapping(fileSystem.path(), url, folder);
        }
        this._addingFileSystem = false;
        this._fileSystemMappingChanged();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _fileSystemRemoved: function(event)
    {
        var fileSystem = /** @type {!WebInspector.IsolatedFileSystem} */ (event.data);
        this._fileSystemMapping.removeFileSystem(fileSystem.path());
        this._fileSystemMappingChanged();
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     * @return {string}
     */
    networkURL: function(uiSourceCode)
    {
        if (uiSourceCode.project().type() === WebInspector.projectTypes.FileSystem) {
            var fileSystemPath = this._fileSystemWorkspaceBinding.fileSystemPath(uiSourceCode.project().id());
            return this.urlForPath(fileSystemPath, uiSourceCode.path());
        }
        return uiSourceCode.originURL();
    },

    /**
     * @param {string} url
     * @return {boolean}
     */
    hasMappingForURL: function(url)
    {
        return this._fileSystemMapping.hasMappingForURL(url);
    },

    /**
     * @param {string} url
     * @param {!WebInspector.Target} target
     * @return {?WebInspector.UISourceCode}
     */
    _networkUISourceCodeForURL: function(url, target)
    {
        var splitURL = WebInspector.ParsedURL.splitURLIntoPathComponents(url);
        var projectId = WebInspector.NetworkProject.projectId(target, splitURL[0], false);
        var project = this._workspace.project(projectId);
        return project ? project.uiSourceCode(splitURL.slice(1).join("/")) : null;
    },

    /**
     * @param {string} url
     * @param {!WebInspector.Target} target
     * @return {?WebInspector.UISourceCode}
     */
    _contentScriptUISourceCodeForURL: function(url, target)
    {
        var splitURL = WebInspector.ParsedURL.splitURLIntoPathComponents(url);
        var projectId = WebInspector.NetworkProject.projectId(target, splitURL[0], true);
        var project = this._workspace.project(projectId);
        return project ? project.uiSourceCode(splitURL.slice(1).join("/")) : null;
    },

    /**
     * @param {string} url
     * @param {!WebInspector.Target} target
     * @return {?WebInspector.UISourceCode}
     */
    uiSourceCodeForURL: function(url, target)
    {
        var file = this._fileSystemMapping.fileForURL(url);
        if (file) {
            var projectId = WebInspector.FileSystemWorkspaceBinding.projectId(file.fileSystemPath);
            var project = this._workspace.project(projectId);
            return project ? project.uiSourceCode(file.filePath) : null;
        }

        return this._networkUISourceCodeForURL(url, target) || this._contentScriptUISourceCodeForURL(url, target);
    },

    /**
     * @param {string} url
     * @return {?WebInspector.UISourceCode}
     */
    uiSourceCodeForURLForAnyTarget: function(url)
    {
        for (var target of WebInspector.targetManager.targets()) {
            var result = this.uiSourceCodeForURL(url, target);
            if (result)
                return result;
        }
        return null;
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} filePath
     * @return {string}
     */
    urlForPath: function(fileSystemPath, filePath)
    {
        return this._fileSystemMapping.urlForPath(fileSystemPath, filePath);
    },

    /**
     * @param {!WebInspector.UISourceCode} networkUISourceCode
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    addMapping: function(networkUISourceCode, uiSourceCode)
    {
        var url = this.networkURL(networkUISourceCode);
        var path = uiSourceCode.path();
        var fileSystemPath = this._fileSystemWorkspaceBinding.fileSystemPath(uiSourceCode.project().id());
        this._fileSystemMapping.addMappingForResource(url, fileSystemPath, path);
    },

    /**
     * @param {!WebInspector.UISourceCode} uiSourceCode
     */
    removeMapping: function(uiSourceCode)
    {
        var networkURL = this.networkURL(uiSourceCode);
        this._fileSystemMapping.removeMappingForURL(networkURL);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _revealSourceLine: function(event)
    {
        var url = /** @type {string} */ (event.data["url"]);
        var lineNumber = /** @type {number} */ (event.data["lineNumber"]);
        var columnNumber = /** @type {number} */ (event.data["columnNumber"]);

        var uiSourceCode = this.uiSourceCodeForURLForAnyTarget(url);
        if (uiSourceCode) {
            WebInspector.Revealer.reveal(uiSourceCode.uiLocation(lineNumber, columnNumber));
            return;
        }

        /**
         * @param {!WebInspector.Event} event
         * @this {WebInspector.NetworkMapping}
         */
        function listener(event)
        {
            var uiSourceCode = /** @type {!WebInspector.UISourceCode} */ (event.data);
            if (this.networkURL(uiSourceCode) === url) {
                WebInspector.Revealer.reveal(uiSourceCode.uiLocation(lineNumber, columnNumber));
                this._workspace.removeEventListener(WebInspector.Workspace.Events.UISourceCodeAdded, listener, this);
            }
        }

        this._workspace.addEventListener(WebInspector.Workspace.Events.UISourceCodeAdded, listener, this);
    },

    _fileSystemsLoaded: function()
    {
        this._fileSystemsReady = true;
    },

    _fileSystemMappingChanged: function()
    {
        if (!this._fileSystemsReady || this._addingFileSystem)
            return;
        this._targetManager.suspendAndResumeAllTargets();
    },

    dispose: function()
    {
        this._fileSystemWorkspaceBinding.fileSystemManager().removeEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemAdded, this._fileSystemAdded, this);
        this._fileSystemWorkspaceBinding.fileSystemManager().removeEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemRemoved, this._fileSystemRemoved, this);
        this._fileSystemMapping.removeEventListener(WebInspector.FileSystemMapping.Events.FileMappingAdded, this._fileSystemMappingChanged, this);
        this._fileSystemMapping.removeEventListener(WebInspector.FileSystemMapping.Events.FileMappingRemoved, this._fileSystemMappingChanged, this);
    }
}

/**
 * @type {!WebInspector.NetworkMapping}
 */
WebInspector.networkMapping;
