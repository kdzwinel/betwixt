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
WebInspector.FileSystemMapping = function()
{
    WebInspector.Object.call(this);
    this._fileSystemMappingSetting = WebInspector.settings.createLocalSetting("fileSystemMapping", {});
    /** @type {!Object.<string, !Array.<!WebInspector.FileSystemMapping.Entry>>} */
    this._fileSystemMappings = {};
    this._loadFromSettings();
}

WebInspector.FileSystemMapping.Events = {
    FileMappingAdded: "FileMappingAdded",
    FileMappingRemoved: "FileMappingRemoved"
}

WebInspector.FileSystemMapping.prototype = {
    _loadFromSettings: function()
    {
        var savedMapping = this._fileSystemMappingSetting.get();
        this._fileSystemMappings = {};
        for (var fileSystemPath in savedMapping) {
            var savedFileSystemMappings = savedMapping[fileSystemPath];

            this._fileSystemMappings[fileSystemPath] = [];
            var fileSystemMappings = this._fileSystemMappings[fileSystemPath];

            for (var i = 0; i < savedFileSystemMappings.length; ++i) {
                var savedEntry = savedFileSystemMappings[i];
                var entry = new WebInspector.FileSystemMapping.Entry(savedEntry.fileSystemPath, savedEntry.urlPrefix, savedEntry.pathPrefix, true);
                fileSystemMappings.push(entry);
            }
        }

        this._rebuildIndexes();
    },

    _saveToSettings: function()
    {
        var setting = {};
        for (var fileSystemPath in this._fileSystemMappings) {
            setting[fileSystemPath] = [];
            var entries = this._fileSystemMappings[fileSystemPath];
            for (var entry of entries) {
                if (entry.configurable)
                    setting[fileSystemPath].push(entry);
            }
        }
        this._fileSystemMappingSetting.set(setting);
    },

    _rebuildIndexes: function()
    {
        // We are building an index here to search for the longest url prefix match faster.
        this._mappingForURLPrefix = {};
        this._urlPrefixes = [];
        for (var fileSystemPath in this._fileSystemMappings) {
            var fileSystemMapping = this._fileSystemMappings[fileSystemPath];
            for (var i = 0; i < fileSystemMapping.length; ++i) {
                var entry = fileSystemMapping[i];
                // Resolve conflict in favor of configurable mapping.
                if (this._mappingForURLPrefix[entry.urlPrefix] && !entry.configurable)
                    continue;
                this._mappingForURLPrefix[entry.urlPrefix] = entry;
                if (this._urlPrefixes.indexOf(entry.urlPrefix) === -1)
                    this._urlPrefixes.push(entry.urlPrefix);
            }
        }
        this._urlPrefixes.sort();
    },

    /**
     * @param {string} fileSystemPath
     */
    addFileSystem: function(fileSystemPath)
    {
        if (this._fileSystemMappings[fileSystemPath])
            return;

        this._fileSystemMappings[fileSystemPath] = [];
        this._saveToSettings();
    },

    /**
     * @param {string} fileSystemPath
     */
    removeFileSystem: function(fileSystemPath)
    {
        if (!this._fileSystemMappings[fileSystemPath])
            return;
        delete this._fileSystemMappings[fileSystemPath];
        this._rebuildIndexes();
        this._saveToSettings();
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} urlPrefix
     * @param {string} pathPrefix
     */
    addFileMapping: function(fileSystemPath, urlPrefix, pathPrefix)
    {
        this._innerAddFileMapping(fileSystemPath, urlPrefix, pathPrefix, true);
        this._saveToSettings();
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} urlPrefix
     * @param {string} pathPrefix
     */
    addNonConfigurableFileMapping: function(fileSystemPath, urlPrefix, pathPrefix)
    {
        this._innerAddFileMapping(fileSystemPath, urlPrefix, pathPrefix, false);
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} urlPrefix
     * @param {string} pathPrefix
     * @param {boolean} configurable
     */
    _innerAddFileMapping: function(fileSystemPath, urlPrefix, pathPrefix, configurable)
    {
        var entry = new WebInspector.FileSystemMapping.Entry(fileSystemPath, urlPrefix, pathPrefix, configurable);
        this._fileSystemMappings[fileSystemPath].push(entry);
        this._rebuildIndexes();
        this.dispatchEventToListeners(WebInspector.FileSystemMapping.Events.FileMappingAdded, entry);
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} urlPrefix
     * @param {string} pathPrefix
     */
    removeFileMapping: function(fileSystemPath, urlPrefix, pathPrefix)
    {
        var entry = this._configurableMappingEntryForPathPrefix(fileSystemPath, pathPrefix);
        if (!entry)
            return;
        this._fileSystemMappings[fileSystemPath].remove(entry);
        this._rebuildIndexes();
        this._saveToSettings();
        this.dispatchEventToListeners(WebInspector.FileSystemMapping.Events.FileMappingRemoved, entry);
    },

    /**
     * @param {string} url
     * @return {?WebInspector.FileSystemMapping.Entry}
     */
    _mappingEntryForURL: function(url)
    {
        for (var i = this._urlPrefixes.length - 1; i >= 0; --i) {
            var urlPrefix = this._urlPrefixes[i];
            if (url.startsWith(urlPrefix))
                return this._mappingForURLPrefix[urlPrefix];
        }
        return null;
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} filePath
     * @return {?WebInspector.FileSystemMapping.Entry}
     */
    _mappingEntryForPath: function(fileSystemPath, filePath)
    {
        var entries = this._fileSystemMappings[fileSystemPath];
        if (!entries)
            return null;

        var entry = null;
        for (var i = 0; i < entries.length; ++i) {
            var pathPrefix = entries[i].pathPrefix;
            if (entry && entry.configurable && !entries[i].configurable)
                continue;
            // We are looking for the longest pathPrefix match.
            if (entry && entry.pathPrefix.length > pathPrefix.length)
                continue;
            if (filePath.startsWith(pathPrefix.substr(1)))
                entry = entries[i];
        }
        return entry;
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} pathPrefix
     * @return {?WebInspector.FileSystemMapping.Entry}
     */
    _configurableMappingEntryForPathPrefix: function(fileSystemPath, pathPrefix)
    {
        var entries = this._fileSystemMappings[fileSystemPath];
        for (var i = 0; i < entries.length; ++i) {
            if (entries[i].configurable && pathPrefix === entries[i].pathPrefix)
                return entries[i];
        }
        return null;
    },

    /**
     * @param {string} fileSystemPath
     * @return {!Array.<!WebInspector.FileSystemMapping.Entry>}
     */
    mappingEntries: function(fileSystemPath)
    {
        return this._fileSystemMappings[fileSystemPath].slice();
    },

    /**
     * @param {string} url
     * @return {boolean}
     */
    hasMappingForURL: function(url)
    {
        return !!this._mappingEntryForURL(url);
    },

    /**
     * @param {string} url
     * @return {?{fileSystemPath: string, filePath: string}}
     */
    fileForURL: function(url)
    {
        var entry = this._mappingEntryForURL(url);
        if (!entry)
            return null;
        var file = {};
        file.fileSystemPath = entry.fileSystemPath;
        file.filePath = entry.pathPrefix.substr(1) + url.substr(entry.urlPrefix.length);
        return file;
    },

    /**
     * @param {string} fileSystemPath
     * @param {string} filePath
     * @return {string}
     */
    urlForPath: function(fileSystemPath, filePath)
    {
        var entry = this._mappingEntryForPath(fileSystemPath, filePath);
        if (!entry)
            return "";
        return entry.urlPrefix + filePath.substring(entry.pathPrefix.length - 1);
    },

    /**
     * @param {string} url
     */
    removeMappingForURL: function(url)
    {
        var entry = this._mappingEntryForURL(url);
        if (!entry || !entry.configurable)
            return;
        this._fileSystemMappings[entry.fileSystemPath].remove(entry);
        this._saveToSettings();
    },

    /**
     * @param {string} url
     * @param {string} fileSystemPath
     * @param {string} filePath
     */
    addMappingForResource: function(url, fileSystemPath, filePath)
    {
        var commonPathSuffixLength = 0;
        var normalizedFilePath = "/" + filePath;
        for (var i = 0; i < normalizedFilePath.length; ++i) {
            var filePathCharacter = normalizedFilePath[normalizedFilePath.length - 1 - i];
            var urlCharacter = url[url.length - 1 - i];
            if (filePathCharacter !== urlCharacter)
                break;
            if (filePathCharacter === "/")
                commonPathSuffixLength = i;
        }
        var pathPrefix = normalizedFilePath.substr(0, normalizedFilePath.length - commonPathSuffixLength);
        var urlPrefix = url.substr(0, url.length - commonPathSuffixLength);
        this.addFileMapping(fileSystemPath, urlPrefix, pathPrefix);
    },

    resetForTesting: function()
    {
        this._fileSystemMappings = {};
    },

    __proto__: WebInspector.Object.prototype
}

/**
 * @constructor
 * @param {string} fileSystemPath
 * @param {string} urlPrefix
 * @param {string} pathPrefix
 * @param {boolean} configurable
 */
WebInspector.FileSystemMapping.Entry = function(fileSystemPath, urlPrefix, pathPrefix, configurable)
{
    this.fileSystemPath = fileSystemPath;
    this.urlPrefix = urlPrefix;
    this.pathPrefix = pathPrefix;
    this.configurable = configurable;
}

/**
 * @type {!WebInspector.FileSystemMapping}
 */
WebInspector.fileSystemMapping;
