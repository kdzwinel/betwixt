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
 * @unrestricted
 */
Persistence.IsolatedFileSystemManager = class extends Common.Object {
  constructor() {
    super();

    /** @type {!Map<string, !Persistence.PlatformFileSystem>} */
    this._fileSystems = new Map();
    /** @type {!Map<number, function(!Array.<string>)>} */
    this._callbacks = new Map();
    /** @type {!Map<number, !Common.Progress>} */
    this._progresses = new Map();

    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.FileSystemRemoved, this._onFileSystemRemoved, this);
    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.FileSystemAdded, this._onFileSystemAdded, this);
    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.FileSystemFilesChangedAddedRemoved, this._onFileSystemFilesChanged, this);
    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.IndexingTotalWorkCalculated, this._onIndexingTotalWorkCalculated, this);
    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.IndexingWorked, this._onIndexingWorked, this);
    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.IndexingDone, this._onIndexingDone, this);
    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.SearchCompleted, this._onSearchCompleted, this);

    this._initExcludePatterSetting();

    /** @type {?function(?Persistence.IsolatedFileSystem)} */
    this._fileSystemRequestResolve = null;
    this._fileSystemsLoadedPromise = this._requestFileSystems();
  }

  /**
   * @return {!Promise<!Array<!Persistence.IsolatedFileSystem>>}
   */
  _requestFileSystems() {
    let fulfill;
    const promise = new Promise(f => fulfill = f);
    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.FileSystemsLoaded, onFileSystemsLoaded, this);
    InspectorFrontendHost.requestFileSystems();
    return promise;

    /**
     * @param {!Common.Event} event
     * @this {Persistence.IsolatedFileSystemManager}
     */
    function onFileSystemsLoaded(event) {
      const fileSystems = /** @type {!Array.<!Persistence.IsolatedFileSystemManager.FileSystem>} */ (event.data);
      const promises = [];
      for (let i = 0; i < fileSystems.length; ++i)
        promises.push(this._innerAddFileSystem(fileSystems[i], false));
      Promise.all(promises).then(onFileSystemsAdded);
    }

    /**
     * @param {!Array<?Persistence.IsolatedFileSystem>} fileSystems
     */
    function onFileSystemsAdded(fileSystems) {
      fulfill(fileSystems.filter(fs => !!fs));
    }
  }

  /**
   * @param {string=} type
   * @return {!Promise<?Persistence.IsolatedFileSystem>}
   */
  addFileSystem(type) {
    return new Promise(resolve => {
      this._fileSystemRequestResolve = resolve;
      InspectorFrontendHost.addFileSystem(type || '');
    });
  }

  /**
   * @param {!Persistence.PlatformFileSystem} fileSystem
   */
  removeFileSystem(fileSystem) {
    InspectorFrontendHost.removeFileSystem(fileSystem.embedderPath());
  }

  /**
   * @return {!Promise<!Array<!Persistence.IsolatedFileSystem>>}
   */
  waitForFileSystems() {
    return this._fileSystemsLoadedPromise;
  }

  /**
   * @param {!Persistence.IsolatedFileSystemManager.FileSystem} fileSystem
   * @param {boolean} dispatchEvent
   * @return {!Promise<?Persistence.IsolatedFileSystem>}
   */
  _innerAddFileSystem(fileSystem, dispatchEvent) {
    const embedderPath = fileSystem.fileSystemPath;
    const fileSystemURL = Common.ParsedURL.platformPathToURL(fileSystem.fileSystemPath);
    const promise = Persistence.IsolatedFileSystem.create(
        this, fileSystemURL, embedderPath, fileSystem.type, fileSystem.fileSystemName, fileSystem.rootURL);
    return promise.then(storeFileSystem.bind(this));

    /**
     * @param {?Persistence.PlatformFileSystem} fileSystem
     * @this {Persistence.IsolatedFileSystemManager}
     */
    function storeFileSystem(fileSystem) {
      if (!fileSystem)
        return null;
      this._fileSystems.set(fileSystemURL, fileSystem);
      if (dispatchEvent)
        this.dispatchEventToListeners(Persistence.IsolatedFileSystemManager.Events.FileSystemAdded, fileSystem);
      return fileSystem;
    }
  }

  /**
   * @param {string} fileSystemURL
   * @param {!Persistence.PlatformFileSystem} fileSystem
   */
  addPlatformFileSystem(fileSystemURL, fileSystem) {
    this._fileSystems.set(fileSystemURL, fileSystem);
    this.dispatchEventToListeners(Persistence.IsolatedFileSystemManager.Events.FileSystemAdded, fileSystem);
  }

  /**
   * @param {!Common.Event} event
   */
  async _onFileSystemAdded(event) {
    const errorMessage = /** @type {string} */ (event.data['errorMessage']);
    let fileSystem = /** @type {?Persistence.IsolatedFileSystemManager.FileSystem} */ (event.data['fileSystem']);
    if (errorMessage) {
      Common.console.error(Common.UIString('Unable to add filesystem: %s', errorMessage));
      if (!this._fileSystemRequestResolve)
        return;
      this._fileSystemRequestResolve.call(null, null);
      this._fileSystemRequestResolve = null;
    } else if (fileSystem) {
      fileSystem = await this._innerAddFileSystem(fileSystem, true);
      if (this._fileSystemRequestResolve) {
        this._fileSystemRequestResolve.call(null, fileSystem);
        this._fileSystemRequestResolve = null;
      }
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _onFileSystemRemoved(event) {
    const embedderPath = /** @type {string} */ (event.data);
    const fileSystemPath = Common.ParsedURL.platformPathToURL(embedderPath);
    const isolatedFileSystem = this._fileSystems.get(fileSystemPath);
    if (!isolatedFileSystem)
      return;
    this._fileSystems.delete(fileSystemPath);
    isolatedFileSystem.fileSystemRemoved();
    this.dispatchEventToListeners(Persistence.IsolatedFileSystemManager.Events.FileSystemRemoved, isolatedFileSystem);
  }

  /**
   * @param {!Common.Event} event
   */
  _onFileSystemFilesChanged(event) {
    const urlPaths = {
      changed: groupFilePathsIntoFileSystemPaths.call(this, event.data.changed),
      added: groupFilePathsIntoFileSystemPaths.call(this, event.data.added),
      removed: groupFilePathsIntoFileSystemPaths.call(this, event.data.removed)
    };

    this.dispatchEventToListeners(Persistence.IsolatedFileSystemManager.Events.FileSystemFilesChanged, urlPaths);

    /**
     * @param {!Array<string>} embedderPaths
     * @return {!Multimap<string, string>}
     * @this {Persistence.IsolatedFileSystemManager}
     */
    function groupFilePathsIntoFileSystemPaths(embedderPaths) {
      const paths = new Multimap();
      for (const embedderPath of embedderPaths) {
        const filePath = Common.ParsedURL.platformPathToURL(embedderPath);
        for (const fileSystemPath of this._fileSystems.keys()) {
          if (this._fileSystems.get(fileSystemPath).isFileExcluded(embedderPath))
            continue;
          const pathPrefix = fileSystemPath.endsWith('/') ? fileSystemPath : fileSystemPath + '/';
          if (!filePath.startsWith(pathPrefix))
            continue;
          paths.set(fileSystemPath, filePath);
        }
      }
      return paths;
    }
  }

  /**
   * @return {!Array<!Persistence.IsolatedFileSystem>}
   */
  fileSystems() {
    return this._fileSystems.valuesArray();
  }

  /**
   * @param {string} fileSystemPath
   * @return {?Persistence.PlatformFileSystem}
   */
  fileSystem(fileSystemPath) {
    return this._fileSystems.get(fileSystemPath) || null;
  }

  _initExcludePatterSetting() {
    const defaultCommonExcludedFolders = [
      '/node_modules/', '/bower_components/', '/\\.devtools', '/\\.git/', '/\\.sass-cache/', '/\\.hg/', '/\\.idea/',
      '/\\.svn/', '/\\.cache/', '/\\.project/'
    ];
    const defaultWinExcludedFolders = ['/Thumbs.db$', '/ehthumbs.db$', '/Desktop.ini$', '/\\$RECYCLE.BIN/'];
    const defaultMacExcludedFolders = [
      '/\\.DS_Store$', '/\\.Trashes$', '/\\.Spotlight-V100$', '/\\.AppleDouble$', '/\\.LSOverride$', '/Icon$',
      '/\\._.*$'
    ];
    const defaultLinuxExcludedFolders = ['/.*~$'];
    let defaultExcludedFolders = defaultCommonExcludedFolders;
    if (Host.isWin())
      defaultExcludedFolders = defaultExcludedFolders.concat(defaultWinExcludedFolders);
    else if (Host.isMac())
      defaultExcludedFolders = defaultExcludedFolders.concat(defaultMacExcludedFolders);
    else
      defaultExcludedFolders = defaultExcludedFolders.concat(defaultLinuxExcludedFolders);
    const defaultExcludedFoldersPattern = defaultExcludedFolders.join('|');
    this._workspaceFolderExcludePatternSetting = Common.settings.createRegExpSetting(
        'workspaceFolderExcludePattern', defaultExcludedFoldersPattern, Host.isWin() ? 'i' : '');
  }

  /**
   * @return {!Common.Setting}
   */
  workspaceFolderExcludePatternSetting() {
    return this._workspaceFolderExcludePatternSetting;
  }

  /**
   * @param {function(!Array.<string>)} callback
   * @return {number}
   */
  registerCallback(callback) {
    const requestId = ++Persistence.IsolatedFileSystemManager._lastRequestId;
    this._callbacks.set(requestId, callback);
    return requestId;
  }

  /**
   * @param {!Common.Progress} progress
   * @return {number}
   */
  registerProgress(progress) {
    const requestId = ++Persistence.IsolatedFileSystemManager._lastRequestId;
    this._progresses.set(requestId, progress);
    return requestId;
  }

  /**
   * @param {!Common.Event} event
   */
  _onIndexingTotalWorkCalculated(event) {
    const requestId = /** @type {number} */ (event.data['requestId']);
    const totalWork = /** @type {number} */ (event.data['totalWork']);

    const progress = this._progresses.get(requestId);
    if (!progress)
      return;
    progress.setTotalWork(totalWork);
  }

  /**
   * @param {!Common.Event} event
   */
  _onIndexingWorked(event) {
    const requestId = /** @type {number} */ (event.data['requestId']);
    const worked = /** @type {number} */ (event.data['worked']);

    const progress = this._progresses.get(requestId);
    if (!progress)
      return;
    progress.worked(worked);
    if (progress.isCanceled()) {
      InspectorFrontendHost.stopIndexing(requestId);
      this._onIndexingDone(event);
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _onIndexingDone(event) {
    const requestId = /** @type {number} */ (event.data['requestId']);

    const progress = this._progresses.get(requestId);
    if (!progress)
      return;
    progress.done();
    this._progresses.delete(requestId);
  }

  /**
   * @param {!Common.Event} event
   */
  _onSearchCompleted(event) {
    const requestId = /** @type {number} */ (event.data['requestId']);
    const files = /** @type {!Array.<string>} */ (event.data['files']);

    const callback = this._callbacks.get(requestId);
    if (!callback)
      return;
    callback.call(null, files);
    this._callbacks.delete(requestId);
  }
};

/** @typedef {!{type: string, fileSystemName: string, rootURL: string, fileSystemPath: string}} */
Persistence.IsolatedFileSystemManager.FileSystem;

/** @typedef {!{changed:!Multimap<string, string>, added:!Multimap<string, string>, removed:!Multimap<string, string>}} */
Persistence.IsolatedFileSystemManager.FilesChangedData;

/** @enum {symbol} */
Persistence.IsolatedFileSystemManager.Events = {
  FileSystemAdded: Symbol('FileSystemAdded'),
  FileSystemRemoved: Symbol('FileSystemRemoved'),
  FileSystemFilesChanged: Symbol('FileSystemFilesChanged'),
  ExcludedFolderAdded: Symbol('ExcludedFolderAdded'),
  ExcludedFolderRemoved: Symbol('ExcludedFolderRemoved')
};

Persistence.IsolatedFileSystemManager._lastRequestId = 0;

/**
 * @type {!Persistence.IsolatedFileSystemManager}
 */
Persistence.isolatedFileSystemManager;
