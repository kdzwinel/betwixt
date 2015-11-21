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
 * @param {!WebInspector.IsolatedFileSystemManager} manager
 * @param {string} path
 * @param {!DOMFileSystem} domFileSystem
 */
WebInspector.IsolatedFileSystem = function(manager, path, domFileSystem)
{
    this._manager = manager;
    this._path = path;
    this._domFileSystem = domFileSystem;
    this._excludedFoldersSetting = WebInspector.settings.createLocalSetting("workspaceExcludedFolders", {});
    /** @type {!Set<string>} */
    this._excludedFolders = new Set(this._excludedFoldersSetting.get()[path] || []);
    /** @type {!Set<string>} */
    this._nonConfigurableExcludedFolders = new Set();
}

/**
 * @constructor
 * @param {!WebInspector.IsolatedFileSystemManager} manager
 * @param {string} path
 * @param {string} name
 * @param {string} rootURL
 * @return {!Promise<?WebInspector.IsolatedFileSystem>}
 */
WebInspector.IsolatedFileSystem.create = function(manager, path, name, rootURL)
{
    return new Promise(promiseBody);

    /**
     * @param {function(?WebInspector.IsolatedFileSystem)} resolve
     * @param {function(!Error)} reject
     */
    function promiseBody(resolve, reject)
    {
        var domFileSystem = InspectorFrontendHost.isolatedFileSystem(name, rootURL);
        if (!domFileSystem) {
            resolve(null);
            return;
        }
        var fileSystem = new WebInspector.IsolatedFileSystem(manager, path, domFileSystem);
        fileSystem.requestFileContent(".devtools", onConfigAvailable);

        /**
         * @param {?string} projectText
         */
        function onConfigAvailable(projectText)
        {
            if (projectText) {
                try {
                    var projectObject = JSON.parse(projectText);
                    fileSystem._initializeProject(typeof projectObject === "object" ? /** @type {!Object} */ (projectObject) : null);
                } catch (e) {
                    WebInspector.console.error("Invalid project file: " + projectText);
                }
            }
            resolve(fileSystem);
        }
    }
}

/**
 * @param {!FileError} error
 * @return {string}
 */
WebInspector.IsolatedFileSystem.errorMessage = function(error)
{
    return WebInspector.UIString("File system error: %s", error.message);
}

/**
 * @param {string} fileSystemPath
 * @return {string}
 */
WebInspector.IsolatedFileSystem.normalizePath = function(fileSystemPath)
{
    if (WebInspector.isWin())
        return fileSystemPath.replace(/\\/g, "/");
    return fileSystemPath;
}

WebInspector.IsolatedFileSystem.prototype = {
    /**
     * @return {string}
     */
    path: function()
    {
        return this._path;
    },

    /**
     * @return {string}
     */
    normalizedPath: function()
    {
        if (this._normalizedPath)
            return this._normalizedPath;
        this._normalizedPath = WebInspector.IsolatedFileSystem.normalizePath(this._path);
        return this._normalizedPath;
    },

    /**
     * @param {?Object} projectObject
     */
    _initializeProject: function(projectObject)
    {
        this._projectObject = projectObject;

        var projectExcludes = this.projectProperty("excludes");
        if (Array.isArray(projectExcludes)) {
            for (var folder of /** @type {!Array<*>} */ (projectExcludes)) {
                if (typeof folder === "string")
                    this._nonConfigurableExcludedFolders.add(folder);
            }
        }
    },

    /**
     * @param {string} key
     * @return {*}
     */
    projectProperty: function(key)
    {
        return this._projectObject ? this._projectObject[key] : null;
    },

    /**
     * @param {string} path
     * @param {function(string)} fileCallback
     * @param {function()=} finishedCallback
     */
    requestFilesRecursive: function(path, fileCallback, finishedCallback)
    {
        var pendingRequests = 1;
        this._requestEntries(path, innerCallback.bind(this));

        /**
         * @param {!Array.<!FileEntry>} entries
         * @this {WebInspector.IsolatedFileSystem}
         */
        function innerCallback(entries)
        {
            for (var i = 0; i < entries.length; ++i) {
                var entry = entries[i];
                if (!entry.isDirectory) {
                    if (this._isFileExcluded(entry.fullPath))
                        continue;
                    fileCallback(entry.fullPath.substr(1));
                } else {
                    if (this._isFileExcluded(entry.fullPath + "/"))
                        continue;
                    ++pendingRequests;
                    this._requestEntries(entry.fullPath, innerCallback.bind(this));
                }
            }
            if (finishedCallback && (--pendingRequests === 0))
                finishedCallback();
        }
    },

    /**
     * @param {string} path
     * @param {?string} name
     * @param {function(?string)} callback
     */
    createFile: function(path, name, callback)
    {
        var newFileIndex = 1;
        if (!name)
            name = "NewFile";
        var nameCandidate;

        this._domFileSystem.root.getDirectory(path, null, dirEntryLoaded.bind(this), errorHandler.bind(this));

        /**
         * @param {!DirectoryEntry} dirEntry
         * @this {WebInspector.IsolatedFileSystem}
         */
        function dirEntryLoaded(dirEntry)
        {
            var nameCandidate = name;
            if (newFileIndex > 1)
                nameCandidate += newFileIndex;
            ++newFileIndex;
            dirEntry.getFile(nameCandidate, { create: true, exclusive: true }, fileCreated, fileCreationError.bind(this));

            function fileCreated(entry)
            {
                callback(entry.fullPath.substr(1));
            }

            /**
             * @this {WebInspector.IsolatedFileSystem}
             */
            function fileCreationError(error)
            {
                if (error.code === FileError.INVALID_MODIFICATION_ERR) {
                    dirEntryLoaded.call(this, dirEntry);
                    return;
                }

                var errorMessage = WebInspector.IsolatedFileSystem.errorMessage(error);
                console.error(errorMessage + " when testing if file exists '" + (this._path + "/" + path + "/" + nameCandidate) + "'");
                callback(null);
            }
        }

        /**
         * @this {WebInspector.IsolatedFileSystem}
         */
        function errorHandler(error)
        {
            var errorMessage = WebInspector.IsolatedFileSystem.errorMessage(error);
            var filePath = this._path + "/" + path;
            if (nameCandidate)
                filePath += "/" + nameCandidate;
            console.error(errorMessage + " when getting content for file '" + (filePath) + "'");
            callback(null);
        }
    },

    /**
     * @param {string} path
     */
    deleteFile: function(path)
    {
        this._domFileSystem.root.getFile(path, null, fileEntryLoaded.bind(this), errorHandler.bind(this));

        /**
         * @param {!FileEntry} fileEntry
         * @this {WebInspector.IsolatedFileSystem}
         */
        function fileEntryLoaded(fileEntry)
        {
            fileEntry.remove(fileEntryRemoved, errorHandler.bind(this));
        }

        function fileEntryRemoved()
        {
        }

        /**
         * @param {!FileError} error
         * @this {WebInspector.IsolatedFileSystem}
         */
        function errorHandler(error)
        {
            var errorMessage = WebInspector.IsolatedFileSystem.errorMessage(error);
            console.error(errorMessage + " when deleting file '" + (this._path + "/" + path) + "'");
        }
    },

    /**
     * @param {string} path
     * @param {function(?Date, ?number)} callback
     */
    requestMetadata: function(path, callback)
    {
        this._domFileSystem.root.getFile(path, null, fileEntryLoaded, errorHandler);

        /**
         * @param {!FileEntry} entry
         */
        function fileEntryLoaded(entry)
        {
            entry.getMetadata(successHandler, errorHandler);
        }

        /**
         * @param {!Metadata} metadata
         */
        function successHandler(metadata)
        {
            callback(metadata.modificationTime, metadata.size);
        }

        /**
         * @param {!FileError} error
         */
        function errorHandler(error)
        {
            callback(null, null);
        }
    },

    /**
     * @param {string} path
     * @param {function(?string)} callback
     */
    requestFileContent: function(path, callback)
    {
        this._domFileSystem.root.getFile(path, null, fileEntryLoaded.bind(this), errorHandler.bind(this));

        /**
         * @param {!FileEntry} entry
         * @this {WebInspector.IsolatedFileSystem}
         */
        function fileEntryLoaded(entry)
        {
            entry.file(fileLoaded, errorHandler.bind(this));
        }

        /**
         * @param {!Blob} file
         */
        function fileLoaded(file)
        {
            var reader = new FileReader();
            reader.onloadend = readerLoadEnd;
            reader.readAsText(file);
        }

        /**
         * @this {!FileReader}
         */
        function readerLoadEnd()
        {
            /** @type {?string} */
            var string = null;
            try {
                string = /** @type {string} */ (this.result);
            } catch (e) {
                console.error("Can't read file: " + path + ": " + e);
            }
            callback(string);
        }

        /**
         * @this {WebInspector.IsolatedFileSystem}
         */
        function errorHandler(error)
        {
            if (error.code === FileError.NOT_FOUND_ERR) {
                callback(null);
                return;
            }

            var errorMessage = WebInspector.IsolatedFileSystem.errorMessage(error);
            console.error(errorMessage + " when getting content for file '" + (this._path + "/" + path) + "'");
            callback(null);
        }
    },

    /**
     * @param {string} path
     * @param {string} content
     * @param {function()} callback
     */
    setFileContent: function(path, content, callback)
    {
        WebInspector.userMetrics.actionTaken(WebInspector.UserMetrics.Action.FileSavedInWorkspace);
        this._domFileSystem.root.getFile(path, { create: true }, fileEntryLoaded.bind(this), errorHandler.bind(this));

        /**
         * @param {!FileEntry} entry
         * @this {WebInspector.IsolatedFileSystem}
         */
        function fileEntryLoaded(entry)
        {
            entry.createWriter(fileWriterCreated.bind(this), errorHandler.bind(this));
        }

        /**
         * @param {!FileWriter} fileWriter
         * @this {WebInspector.IsolatedFileSystem}
         */
        function fileWriterCreated(fileWriter)
        {
            fileWriter.onerror = errorHandler.bind(this);
            fileWriter.onwriteend = fileWritten;
            var blob = new Blob([content], { type: "text/plain" });
            fileWriter.write(blob);

            function fileWritten()
            {
                fileWriter.onwriteend = callback;
                fileWriter.truncate(blob.size);
            }
        }

        /**
         * @this {WebInspector.IsolatedFileSystem}
         */
        function errorHandler(error)
        {
            var errorMessage = WebInspector.IsolatedFileSystem.errorMessage(error);
            console.error(errorMessage + " when setting content for file '" + (this._path + "/" + path) + "'");
            callback();
        }
    },

    /**
     * @param {string} path
     * @param {string} newName
     * @param {function(boolean, string=)} callback
     */
    renameFile: function(path, newName, callback)
    {
        newName = newName ? newName.trim() : newName;
        if (!newName || newName.indexOf("/") !== -1) {
            callback(false);
            return;
        }
        var fileEntry;
        var dirEntry;

        this._domFileSystem.root.getFile(path, null, fileEntryLoaded.bind(this), errorHandler.bind(this));

        /**
         * @param {!FileEntry} entry
         * @this {WebInspector.IsolatedFileSystem}
         */
        function fileEntryLoaded(entry)
        {
            if (entry.name === newName) {
                callback(false);
                return;
            }

            fileEntry = entry;
            fileEntry.getParent(dirEntryLoaded.bind(this), errorHandler.bind(this));
        }

        /**
         * @param {!Entry} entry
         * @this {WebInspector.IsolatedFileSystem}
         */
        function dirEntryLoaded(entry)
        {
            dirEntry = entry;
            dirEntry.getFile(newName, null, newFileEntryLoaded, newFileEntryLoadErrorHandler.bind(this));
        }

        /**
         * @param {!FileEntry} entry
         */
        function newFileEntryLoaded(entry)
        {
            callback(false);
        }

        /**
         * @this {WebInspector.IsolatedFileSystem}
         */
        function newFileEntryLoadErrorHandler(error)
        {
            if (error.code !== FileError.NOT_FOUND_ERR) {
                callback(false);
                return;
            }
            fileEntry.moveTo(dirEntry, newName, fileRenamed, errorHandler.bind(this));
        }

        /**
         * @param {!FileEntry} entry
         */
        function fileRenamed(entry)
        {
            callback(true, entry.name);
        }

        /**
         * @this {WebInspector.IsolatedFileSystem}
         */
        function errorHandler(error)
        {
            var errorMessage = WebInspector.IsolatedFileSystem.errorMessage(error);
            console.error(errorMessage + " when renaming file '" + (this._path + "/" + path) + "' to '" + newName + "'");
            callback(false);
        }
    },

    /**
     * @param {!DirectoryEntry} dirEntry
     * @param {function(!Array.<!FileEntry>)} callback
     */
    _readDirectory: function(dirEntry, callback)
    {
        var dirReader = dirEntry.createReader();
        var entries = [];

        function innerCallback(results)
        {
            if (!results.length) {
                callback(entries.sort());
            } else {
                entries = entries.concat(toArray(results));
                dirReader.readEntries(innerCallback, errorHandler);
            }
        }

        function toArray(list)
        {
            return Array.prototype.slice.call(list || [], 0);
        }

        dirReader.readEntries(innerCallback, errorHandler);

        function errorHandler(error)
        {
            var errorMessage = WebInspector.IsolatedFileSystem.errorMessage(error);
            console.error(errorMessage + " when reading directory '" + dirEntry.fullPath + "'");
            callback([]);
        }
    },

    /**
     * @param {string} path
     * @param {function(!Array.<!FileEntry>)} callback
     */
    _requestEntries: function(path, callback)
    {
        this._domFileSystem.root.getDirectory(path, null, innerCallback.bind(this), errorHandler);

        /**
         * @param {!DirectoryEntry} dirEntry
         * @this {WebInspector.IsolatedFileSystem}
         */
        function innerCallback(dirEntry)
        {
            this._readDirectory(dirEntry, callback);
        }

        function errorHandler(error)
        {
            var errorMessage = WebInspector.IsolatedFileSystem.errorMessage(error);
            console.error(errorMessage + " when requesting entry '" + path + "'");
            callback([]);
        }
    },

    _saveExcludedFolders: function()
    {
        var settingValue = this._excludedFoldersSetting.get();
        settingValue[this._path] = Array.from(this._excludedFolders.values());
        this._excludedFoldersSetting.set(settingValue);
    },

    /**
     * @param {string} path
     */
    addExcludedFolder: function(path)
    {
        this._excludedFolders.add(path);
        this._saveExcludedFolders();
        this._manager.dispatchEventToListeners(WebInspector.IsolatedFileSystemManager.Events.ExcludedFolderAdded, path);
    },

    /**
     * @param {string} path
     */
    removeExcludedFolder: function(path)
    {
        this._excludedFolders.delete(path);
        this._saveExcludedFolders();
        this._manager.dispatchEventToListeners(WebInspector.IsolatedFileSystemManager.Events.ExcludedFolderRemoved, path);
    },

    fileSystemRemoved: function()
    {
        var settingValue = this._excludedFoldersSetting.get();
        delete settingValue[this._path];
        this._excludedFoldersSetting.set(settingValue);
    },

    /**
     * @param {string} folderPath
     * @return {boolean}
     */
    _isFileExcluded: function(folderPath)
    {
        if (this._nonConfigurableExcludedFolders.has(folderPath) || this._excludedFolders.has(folderPath))
            return true;
        var regex = this._manager.workspaceFolderExcludePatternSetting().asRegExp();
        return !!(regex && regex.test(folderPath));
    },

    /**
     * @return {!Set<string>}
     */
    excludedFolders: function()
    {
        return this._excludedFolders;
    },

    /**
     * @return {!Set<string>}
     */
    nonConfigurableExcludedFolders: function()
    {
        return this._nonConfigurableExcludedFolders;
    }
}
