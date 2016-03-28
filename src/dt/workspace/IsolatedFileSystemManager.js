/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
 * @extends {WebInspector.Object}
 */
WebInspector.IsolatedFileSystemManager = function()
{
    /** @type {!Object.<string, !WebInspector.IsolatedFileSystem>} */
    this._fileSystems = {};

    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.FileSystemsLoaded, this._onFileSystemsLoaded, this);
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.FileSystemRemoved, this._onFileSystemRemoved, this);
    InspectorFrontendHost.events.addEventListener(InspectorFrontendHostAPI.Events.FileSystemAdded, this._onFileSystemAdded, this);

    this._initExcludePatterSetting();
}

/** @typedef {!{fileSystemName: string, rootURL: string, fileSystemPath: string}} */
WebInspector.IsolatedFileSystemManager.FileSystem;

WebInspector.IsolatedFileSystemManager.Events = {
    FileSystemAdded: "FileSystemAdded",
    FileSystemRemoved: "FileSystemRemoved",
    FileSystemsLoaded: "FileSystemsLoaded",
    ExcludedFolderAdded: "ExcludedFolderAdded",
    ExcludedFolderRemoved: "ExcludedFolderRemoved"
}

WebInspector.IsolatedFileSystemManager.prototype = {
    /**
     * @param {function()} callback
     */
    initialize: function(callback)
    {
        this._initializeCallback = callback;
        InspectorFrontendHost.requestFileSystems();
    },

    /**
     * @param {string} fileSystemPath
     */
    addFileSystem: function(fileSystemPath)
    {
        InspectorFrontendHost.addFileSystem(fileSystemPath);
    },

    /**
     * @param {string} fileSystemPath
     */
    removeFileSystem: function(fileSystemPath)
    {
        InspectorFrontendHost.removeFileSystem(fileSystemPath);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onFileSystemsLoaded: function(event)
    {
        var fileSystems = /** @type {!Array.<!WebInspector.IsolatedFileSystemManager.FileSystem>} */ (event.data);
        var promises = [];
        for (var i = 0; i < fileSystems.length; ++i)
            promises.push(this._innerAddFileSystem(fileSystems[i]));
        Promise.all(promises).then(fireFileSystemsLoaded.bind(this));

        /**
         * @this {WebInspector.IsolatedFileSystemManager}
         */
        function fireFileSystemsLoaded()
        {
            this._initializeCallback();
            delete this._initializeCallback;
            this.dispatchEventToListeners(WebInspector.IsolatedFileSystemManager.Events.FileSystemsLoaded);
        }
    },

    /**
     * @return {boolean}
     */
    fileSystemsLoaded: function()
    {
        return !this._initializeCallback;
    },

    /**
     * @param {!WebInspector.IsolatedFileSystemManager.FileSystem} fileSystem
     * @return {!Promise}
     */
    _innerAddFileSystem: function(fileSystem)
    {
        var fileSystemPath = fileSystem.fileSystemPath;
        var promise = WebInspector.IsolatedFileSystem.create(this, fileSystemPath, fileSystem.fileSystemName, fileSystem.rootURL);
        return promise.then(storeFileSystem.bind(this));

        /**
         * @param {?WebInspector.IsolatedFileSystem} fileSystem
         * @this {WebInspector.IsolatedFileSystemManager}
         */
        function storeFileSystem(fileSystem)
        {
            if (!fileSystem)
                return;
            this._fileSystems[fileSystemPath] = fileSystem;
            this.dispatchEventToListeners(WebInspector.IsolatedFileSystemManager.Events.FileSystemAdded, fileSystem);
        }
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onFileSystemAdded: function(event)
    {
        var errorMessage = /** @type {string} */ (event.data["errorMessage"]);
        var fileSystem = /** @type {?WebInspector.IsolatedFileSystemManager.FileSystem} */ (event.data["fileSystem"]);
        if (errorMessage)
            WebInspector.console.error(errorMessage);
        else if (fileSystem)
            this._innerAddFileSystem(fileSystem);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onFileSystemRemoved: function(event)
    {
        this._fileSystemRemoved(/** @type {string} */ (event.data));
    },

    /**
     * @param {string} fileSystemPath
     */
    _fileSystemRemoved: function(fileSystemPath)
    {
        var isolatedFileSystem = this._fileSystems[fileSystemPath];
        delete this._fileSystems[fileSystemPath];
        if (isolatedFileSystem) {
            isolatedFileSystem.fileSystemRemoved();
            this.dispatchEventToListeners(WebInspector.IsolatedFileSystemManager.Events.FileSystemRemoved, isolatedFileSystem);
        }
    },

    /**
     * @return {!Array<string>}
     */
    fileSystemPaths: function()
    {
        return Object.keys(this._fileSystems);
    },

    /**
     * @param {string} fileSystemPath
     * @return {?WebInspector.IsolatedFileSystem}
     */
    fileSystem: function(fileSystemPath)
    {
        return this._fileSystems[fileSystemPath];
    },

    _initExcludePatterSetting: function()
    {
        var defaultCommonExcludedFolders = [
            "/\\.devtools",
            "/\\.git/",
            "/\\.sass-cache/",
            "/\\.hg/",
            "/\\.idea/",
            "/\\.svn/",
            "/\\.cache/",
            "/\\.project/"
        ];
        var defaultWinExcludedFolders = [
            "/Thumbs.db$",
            "/ehthumbs.db$",
            "/Desktop.ini$",
            "/\\$RECYCLE.BIN/"
        ];
        var defaultMacExcludedFolders = [
            "/\\.DS_Store$",
            "/\\.Trashes$",
            "/\\.Spotlight-V100$",
            "/\\.AppleDouble$",
            "/\\.LSOverride$",
            "/Icon$",
            "/\\._.*$"
        ];
        var defaultLinuxExcludedFolders = [
            "/.*~$"
        ];
        var defaultExcludedFolders = defaultCommonExcludedFolders;
        if (WebInspector.isWin())
            defaultExcludedFolders = defaultExcludedFolders.concat(defaultWinExcludedFolders);
        else if (WebInspector.isMac())
            defaultExcludedFolders = defaultExcludedFolders.concat(defaultMacExcludedFolders);
        else
            defaultExcludedFolders = defaultExcludedFolders.concat(defaultLinuxExcludedFolders);
        var defaultExcludedFoldersPattern = defaultExcludedFolders.join("|");
        this._workspaceFolderExcludePatternSetting = WebInspector.settings.createRegExpSetting("workspaceFolderExcludePattern", defaultExcludedFoldersPattern, WebInspector.isWin() ? "i" : "");
    },

    /**
     * @return {!WebInspector.Setting}
     */
    workspaceFolderExcludePatternSetting: function()
    {
        return this._workspaceFolderExcludePatternSetting;
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @type {!WebInspector.IsolatedFileSystemManager}
 */
WebInspector.isolatedFileSystemManager;
