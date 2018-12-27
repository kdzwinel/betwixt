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
 * @unrestricted
 */
Persistence.FileSystemWorkspaceBinding = class {
  /**
   * @param {!Persistence.IsolatedFileSystemManager} isolatedFileSystemManager
   * @param {!Workspace.Workspace} workspace
   */
  constructor(isolatedFileSystemManager, workspace) {
    this._isolatedFileSystemManager = isolatedFileSystemManager;
    this._workspace = workspace;
    this._eventListeners = [
      this._isolatedFileSystemManager.addEventListener(
          Persistence.IsolatedFileSystemManager.Events.FileSystemAdded, this._onFileSystemAdded, this),
      this._isolatedFileSystemManager.addEventListener(
          Persistence.IsolatedFileSystemManager.Events.FileSystemRemoved, this._onFileSystemRemoved, this),
      this._isolatedFileSystemManager.addEventListener(
          Persistence.IsolatedFileSystemManager.Events.FileSystemFilesChanged, this._fileSystemFilesChanged, this)
    ];
    /** @type {!Map.<string, !Persistence.FileSystemWorkspaceBinding.FileSystem>} */
    this._boundFileSystems = new Map();
    this._isolatedFileSystemManager.waitForFileSystems().then(this._onFileSystemsLoaded.bind(this));
  }

  /**
   * @param {string} fileSystemPath
   * @return {string}
   */
  static projectId(fileSystemPath) {
    return fileSystemPath;
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!Array<string>}
   */
  static relativePath(uiSourceCode) {
    const baseURL =
        /** @type {!Persistence.FileSystemWorkspaceBinding.FileSystem}*/ (uiSourceCode.project())._fileSystemBaseURL;
    return uiSourceCode.url().substring(baseURL.length).split('/');
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {string}
   */
  static tooltipForUISourceCode(uiSourceCode) {
    const fileSystem =
        /** @type {!Persistence.FileSystemWorkspaceBinding.FileSystem}*/ (uiSourceCode.project())._fileSystem;
    return fileSystem.tooltipForURL(uiSourceCode.url());
  }

  /**
   * @param {!Workspace.Project} project
   * @return {string}
   */
  static fileSystemType(project) {
    const fileSystem =
        /** @type {!Persistence.FileSystemWorkspaceBinding.FileSystem}*/ (project)._fileSystem;
    return fileSystem.type();
  }

  /**
   * @param {!Workspace.Project} project
   * @return {boolean}
   */
  static fileSystemSupportsAutomapping(project) {
    const fileSystem =
        /** @type {!Persistence.FileSystemWorkspaceBinding.FileSystem}*/ (project)._fileSystem;
    return fileSystem.supportsAutomapping();
  }

  /**
   * @param {!Workspace.Project} project
   * @param {string} relativePath
   * @return {string}
   */
  static completeURL(project, relativePath) {
    const fsProject = /** @type {!Persistence.FileSystemWorkspaceBinding.FileSystem}*/ (project);
    return fsProject._fileSystemBaseURL + relativePath;
  }

  /**
   * @param {string} projectId
   * @return {string}
   */
  static fileSystemPath(projectId) {
    return projectId;
  }

  /**
   * @return {!Persistence.IsolatedFileSystemManager}
   */
  fileSystemManager() {
    return this._isolatedFileSystemManager;
  }

  /**
   * @param {!Array<!Persistence.IsolatedFileSystem>} fileSystems
   */
  _onFileSystemsLoaded(fileSystems) {
    for (const fileSystem of fileSystems)
      this._addFileSystem(fileSystem);
  }

  /**
   * @param {!Common.Event} event
   */
  _onFileSystemAdded(event) {
    const fileSystem = /** @type {!Persistence.PlatformFileSystem} */ (event.data);
    this._addFileSystem(fileSystem);
  }

  /**
   * @param {!Persistence.PlatformFileSystem} fileSystem
   */
  _addFileSystem(fileSystem) {
    const boundFileSystem = new Persistence.FileSystemWorkspaceBinding.FileSystem(this, fileSystem, this._workspace);
    this._boundFileSystems.set(fileSystem.path(), boundFileSystem);
  }

  /**
   * @param {!Common.Event} event
   */
  _onFileSystemRemoved(event) {
    const fileSystem = /** @type {!Persistence.PlatformFileSystem} */ (event.data);
    const boundFileSystem = this._boundFileSystems.get(fileSystem.path());
    boundFileSystem.dispose();
    this._boundFileSystems.remove(fileSystem.path());
  }

  /**
   * @param {!Common.Event} event
   */
  _fileSystemFilesChanged(event) {
    const paths = /** @type {!Persistence.IsolatedFileSystemManager.FilesChangedData} */ (event.data);
    for (const fileSystemPath of paths.changed.keysArray()) {
      const fileSystem = this._boundFileSystems.get(fileSystemPath);
      if (!fileSystem)
        continue;
      paths.changed.get(fileSystemPath).forEach(path => fileSystem._fileChanged(path));
    }

    for (const fileSystemPath of paths.added.keysArray()) {
      const fileSystem = this._boundFileSystems.get(fileSystemPath);
      if (!fileSystem)
        continue;
      paths.added.get(fileSystemPath).forEach(path => fileSystem._fileChanged(path));
    }

    for (const fileSystemPath of paths.removed.keysArray()) {
      const fileSystem = this._boundFileSystems.get(fileSystemPath);
      if (!fileSystem)
        continue;
      paths.removed.get(fileSystemPath).forEach(path => fileSystem.removeUISourceCode(path));
    }
  }

  dispose() {
    Common.EventTarget.removeEventListeners(this._eventListeners);
    for (const fileSystem of this._boundFileSystems.values()) {
      fileSystem.dispose();
      this._boundFileSystems.remove(fileSystem._fileSystem.path());
    }
  }
};

/**
 * @implements {Workspace.Project}
 * @unrestricted
 */
Persistence.FileSystemWorkspaceBinding.FileSystem = class extends Workspace.ProjectStore {
  /**
   * @param {!Persistence.FileSystemWorkspaceBinding} fileSystemWorkspaceBinding
   * @param {!Persistence.PlatformFileSystem} isolatedFileSystem
   * @param {!Workspace.Workspace} workspace
   */
  constructor(fileSystemWorkspaceBinding, isolatedFileSystem, workspace) {
    const fileSystemPath = isolatedFileSystem.path();
    const id = Persistence.FileSystemWorkspaceBinding.projectId(fileSystemPath);
    console.assert(!workspace.project(id));
    const displayName = fileSystemPath.substr(fileSystemPath.lastIndexOf('/') + 1);

    super(workspace, id, Workspace.projectTypes.FileSystem, displayName);

    this._fileSystem = isolatedFileSystem;
    this._fileSystemBaseURL = this._fileSystem.path() + '/';
    this._fileSystemParentURL = this._fileSystemBaseURL.substr(0, fileSystemPath.lastIndexOf('/') + 1);
    this._fileSystemWorkspaceBinding = fileSystemWorkspaceBinding;
    this._fileSystemPath = fileSystemPath;
    /** @type {!Set<string>} */
    this._creatingFilesGuard = new Set();

    workspace.addProject(this);
    this.populate();
  }

  /**
   * @return {string}
   */
  fileSystemPath() {
    return this._fileSystemPath;
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {string}
   */
  mimeType(uiSourceCode) {
    return this._fileSystem.mimeFromPath(uiSourceCode.url());
  }

  /**
   * @return {!Array<string>}
   */
  initialGitFolders() {
    return this._fileSystem.initialGitFolders().map(folder => this._fileSystemPath + '/' + folder);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {string}
   */
  _filePathForUISourceCode(uiSourceCode) {
    return uiSourceCode.url().substring(this._fileSystemPath.length);
  }

  /**
   * @override
   * @return {boolean}
   */
  isServiceProject() {
    return false;
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!Promise<?Workspace.UISourceCodeMetadata>}
   */
  requestMetadata(uiSourceCode) {
    if (uiSourceCode[Persistence.FileSystemWorkspaceBinding._metadata])
      return uiSourceCode[Persistence.FileSystemWorkspaceBinding._metadata];
    const relativePath = this._filePathForUISourceCode(uiSourceCode);
    const promise = this._fileSystem.getMetadata(relativePath).then(onMetadata);
    uiSourceCode[Persistence.FileSystemWorkspaceBinding._metadata] = promise;
    return promise;

    /**
     * @param {?{modificationTime: !Date, size: number}} metadata
     * @return {?Workspace.UISourceCodeMetadata}
     */
    function onMetadata(metadata) {
      if (!metadata)
        return null;
      return new Workspace.UISourceCodeMetadata(metadata.modificationTime, metadata.size);
    }
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!Promise<?Blob>}
   */
  requestFileBlob(uiSourceCode) {
    return this._fileSystem.requestFileBlob(this._filePathForUISourceCode(uiSourceCode));
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {function(?string, boolean)} callback
   */
  requestFileContent(uiSourceCode, callback) {
    const filePath = this._filePathForUISourceCode(uiSourceCode);
    this._fileSystem.requestFileContent(filePath, callback);
  }

  /**
   * @override
   * @return {boolean}
   */
  canSetFileContent() {
    return true;
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} newContent
   * @param {boolean} isBase64
   * @return {!Promise}
   */
  async setFileContent(uiSourceCode, newContent, isBase64) {
    const filePath = this._filePathForUISourceCode(uiSourceCode);
    await this._fileSystem.setFileContent(filePath, newContent, isBase64);
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {string}
   */
  fullDisplayName(uiSourceCode) {
    const baseURL =
        /** @type {!Persistence.FileSystemWorkspaceBinding.FileSystem}*/ (uiSourceCode.project())._fileSystemParentURL;
    return uiSourceCode.url().substring(baseURL.length);
  }

  /**
   * @override
   * @return {boolean}
   */
  canRename() {
    return true;
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} newName
   * @param {function(boolean, string=, string=, !Common.ResourceType=)} callback
   */
  rename(uiSourceCode, newName, callback) {
    if (newName === uiSourceCode.name()) {
      callback(true, uiSourceCode.name(), uiSourceCode.url(), uiSourceCode.contentType());
      return;
    }

    let filePath = this._filePathForUISourceCode(uiSourceCode);
    this._fileSystem.renameFile(filePath, newName, innerCallback.bind(this));

    /**
     * @param {boolean} success
     * @param {string=} newName
     * @this {Persistence.FileSystemWorkspaceBinding.FileSystem}
     */
    function innerCallback(success, newName) {
      if (!success || !newName) {
        callback(false, newName);
        return;
      }
      console.assert(newName);
      const slash = filePath.lastIndexOf('/');
      const parentPath = filePath.substring(0, slash);
      filePath = parentPath + '/' + newName;
      filePath = filePath.substr(1);
      const newURL = this._fileSystemBaseURL + filePath;
      const newContentType = this._fileSystem.contentType(newName);
      this.renameUISourceCode(uiSourceCode, newName);
      callback(true, newName, newURL, newContentType);
    }
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} query
   * @param {boolean} caseSensitive
   * @param {boolean} isRegex
   * @return {!Promise<!Array<!Common.ContentProvider.SearchMatch>>}
   */
  searchInFileContent(uiSourceCode, query, caseSensitive, isRegex) {
    return new Promise(resolve => {
      const filePath = this._filePathForUISourceCode(uiSourceCode);
      this._fileSystem.requestFileContent(filePath, contentCallback);

      /**
       * @param {?string} content
       */
      function contentCallback(content) {
        resolve(content ? Common.ContentProvider.performSearchInContent(content, query, caseSensitive, isRegex) : []);
      }
    });
  }

  /**
   * @override
   * @param {!Workspace.ProjectSearchConfig} searchConfig
   * @param {!Array.<string>} filesMathingFileQuery
   * @param {!Common.Progress} progress
   * @return {!Promise<!Array<string>>}
   */
  async findFilesMatchingSearchRequest(searchConfig, filesMathingFileQuery, progress) {
    let result = filesMathingFileQuery;
    const queriesToRun = searchConfig.queries().slice();
    if (!queriesToRun.length)
      queriesToRun.push('');
    progress.setTotalWork(queriesToRun.length);

    for (const query of queriesToRun) {
      const files = await this._fileSystem.searchInPath(searchConfig.isRegex() ? '' : query, progress);
      result = result.intersectOrdered(files.sort(), String.naturalOrderComparator);
      progress.worked(1);
    }

    progress.done();
    return result;
  }

  /**
   * @override
   * @param {!Common.Progress} progress
   */
  indexContent(progress) {
    this._fileSystem.indexContent(progress);
  }

  populate() {
    const chunkSize = 1000;
    const filePaths = this._fileSystem.initialFilePaths();
    reportFileChunk.call(this, 0);

    /**
     * @param {number} from
     * @this {Persistence.FileSystemWorkspaceBinding.FileSystem}
     */
    function reportFileChunk(from) {
      const to = Math.min(from + chunkSize, filePaths.length);
      for (let i = from; i < to; ++i)
        this._addFile(filePaths[i]);
      if (to < filePaths.length)
        setTimeout(reportFileChunk.bind(this, to), 100);
    }
  }

  /**
   * @override
   * @param {string} url
   */
  excludeFolder(url) {
    let relativeFolder = url.substring(this._fileSystemBaseURL.length);
    if (!relativeFolder.startsWith('/'))
      relativeFolder = '/' + relativeFolder;
    if (!relativeFolder.endsWith('/'))
      relativeFolder += '/';
    this._fileSystem.addExcludedFolder(relativeFolder);

    const uiSourceCodes = this.uiSourceCodes().slice();
    for (let i = 0; i < uiSourceCodes.length; ++i) {
      const uiSourceCode = uiSourceCodes[i];
      if (uiSourceCode.url().startsWith(url))
        this.removeUISourceCode(uiSourceCode.url());
    }
  }

  /**
   * @override
   * @param {string} path
   * @return {boolean}
   */
  canExcludeFolder(path) {
    return this._fileSystem.canExcludeFolder(path);
  }

  /**
   * @override
   * @return {boolean}
   */
  canCreateFile() {
    return true;
  }

  /**
   * @override
   * @param {string} path
   * @param {?string} name
   * @param {string} content
   * @param {boolean=} isBase64
   * @return {!Promise<?Workspace.UISourceCode>}
   */
  async createFile(path, name, content, isBase64) {
    const guardFileName = this._fileSystemPath + path + (!path.endsWith('/') ? '/' : '') + name;
    this._creatingFilesGuard.add(guardFileName);
    const filePath = await this._fileSystem.createFile(path, name);
    if (!filePath)
      return null;
    const uiSourceCode = this._addFile(filePath);
    uiSourceCode.setContent(content, !!isBase64);
    this._creatingFilesGuard.delete(guardFileName);
    return uiSourceCode;
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  deleteFile(uiSourceCode) {
    const relativePath = this._filePathForUISourceCode(uiSourceCode);
    this._fileSystem.deleteFile(relativePath).then(success => {
      if (success)
        this.removeUISourceCode(uiSourceCode.url());
    });
  }

  /**
   * @override
   */
  remove() {
    this._fileSystemWorkspaceBinding._isolatedFileSystemManager.removeFileSystem(this._fileSystem);
  }

  /**
   * @param {string} filePath
   * @return {!Workspace.UISourceCode}
   */
  _addFile(filePath) {
    const contentType = this._fileSystem.contentType(filePath);
    const uiSourceCode = this.createUISourceCode(this._fileSystemBaseURL + filePath, contentType);
    this.addUISourceCode(uiSourceCode);
    return uiSourceCode;
  }

  /**
   * @param {string} path
   */
  _fileChanged(path) {
    // Ignore files that are being created but do not have content yet.
    if (this._creatingFilesGuard.has(path))
      return;
    const uiSourceCode = this.uiSourceCodeForURL(path);
    if (!uiSourceCode) {
      const contentType = this._fileSystem.contentType(path);
      this.addUISourceCode(this.createUISourceCode(path, contentType));
      return;
    }
    uiSourceCode[Persistence.FileSystemWorkspaceBinding._metadata] = null;
    uiSourceCode.checkContentUpdated();
  }

  /**
   * @param {string} url
   * @return {string}
   */
  tooltipForURL(url) {
    return this._fileSystem.tooltipForURL(url);
  }

  dispose() {
    this.removeProject();
  }
};

Persistence.FileSystemWorkspaceBinding._metadata = Symbol('FileSystemWorkspaceBinding.Metadata');
