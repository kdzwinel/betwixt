// Copyright (c) 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Persistence.NetworkPersistenceManager = class extends Common.Object {
  /**
   * @param {!Workspace.Workspace} workspace
   */
  constructor(workspace) {
    super();
    this._bindingSymbol = Symbol('NetworkPersistenceBinding');
    this._originalResponseContentPromiseSymbol = Symbol('OriginalResponsePromise');
    this._savingSymbol = Symbol('SavingForOverrides');

    this._enabledSetting = Common.settings.moduleSetting('persistenceNetworkOverridesEnabled');
    this._enabledSetting.addChangeListener(this._enabledChanged, this);

    this._workspace = workspace;

    /** @type {!Map<string, !Workspace.UISourceCode>} */
    this._networkUISourceCodeForEncodedPath = new Map();
    this._interceptionHandlerBound = this._interceptionHandler.bind(this);
    this._updateInterceptionThrottler = new Common.Throttler(50);

    /** @type {?Workspace.Project} */
    this._project = null;
    /** @type {?Workspace.Project} */
    this._activeProject = null;

    this._active = false;
    this._enabled = false;

    this._workspace.addEventListener(
        Workspace.Workspace.Events.ProjectAdded,
        event => this._onProjectAdded(/** @type {!Workspace.Project} */ (event.data)));
    this._workspace.addEventListener(
        Workspace.Workspace.Events.ProjectRemoved,
        event => this._onProjectRemoved(/** @type {!Workspace.Project} */ (event.data)));

    /** @type {!Array<!Common.EventTarget.EventDescriptor>} */
    this._eventDescriptors = [];
    this._enabledChanged();
  }

  /**
   * @return {boolean}
   */
  active() {
    return this._active;
  }

  /**
   * @return {?Workspace.Project}
   */
  project() {
    return this._project;
  }


  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {?Promise<?string>}
   */
  originalContentForUISourceCode(uiSourceCode) {
    if (!uiSourceCode[this._bindingSymbol])
      return null;
    const fileSystemUISourceCode = uiSourceCode[this._bindingSymbol].fileSystem;
    return fileSystemUISourceCode[this._originalResponseContentPromiseSymbol] || null;
  }

  _enabledChanged() {
    if (this._enabled === this._enabledSetting.get())
      return;
    this._enabled = this._enabledSetting.get();
    if (this._enabled) {
      this._eventDescriptors = [
        Workspace.workspace.addEventListener(
            Workspace.Workspace.Events.UISourceCodeRenamed,
            event => {
              const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data.uiSourceCode);
              this._onUISourceCodeRemoved(uiSourceCode);
              this._onUISourceCodeAdded(uiSourceCode);
            }),
        Workspace.workspace.addEventListener(
            Workspace.Workspace.Events.UISourceCodeAdded,
            event => this._onUISourceCodeAdded(/** @type {!Workspace.UISourceCode} */ (event.data))),
        Workspace.workspace.addEventListener(
            Workspace.Workspace.Events.UISourceCodeRemoved,
            event => this._onUISourceCodeRemoved(/** @type {!Workspace.UISourceCode} */ (event.data))),
        Workspace.workspace.addEventListener(
            Workspace.Workspace.Events.WorkingCopyCommitted,
            event => this._onUISourceCodeWorkingCopyCommitted(
                /** @type {!Workspace.UISourceCode} */ (event.data.uiSourceCode)))
      ];
      this._updateActiveProject();
    } else {
      Common.EventTarget.removeEventListeners(this._eventDescriptors);
      this._updateActiveProject();
    }
  }

  _updateActiveProject() {
    const wasActive = this._active;
    this._active = !!(this._enabledSetting.get() && SDK.targetManager.mainTarget() && this._project);
    if (this._active === wasActive)
      return;

    if (this._active) {
      this._project.uiSourceCodes().forEach(this._filesystemUISourceCodeAdded.bind(this));
      const networkProjects = this._workspace.projectsForType(Workspace.projectTypes.Network);
      for (const networkProject of networkProjects)
        networkProject.uiSourceCodes().forEach(this._networkUISourceCodeAdded.bind(this));
    } else if (this._project) {
      this._project.uiSourceCodes().forEach(this._filesystemUISourceCodeRemoved.bind(this));
      this._networkUISourceCodeForEncodedPath.clear();
    }
    Persistence.persistence.setAutomappingEnabled(!this._active);
  }

  /**
   * @param {string} url
   * @return {string}
   */
  _encodedPathFromUrl(url) {
    if (!this._active)
      return '';
    let urlPath = Common.ParsedURL.urlWithoutHash(url.replace(/^https?:\/\//, ''));
    if (urlPath.endsWith('/') && urlPath.indexOf('?') === -1)
      urlPath = urlPath + 'index.html';
    let encodedPathParts = encodeUrlPathToLocalPathParts(urlPath);
    const projectPath = Persistence.FileSystemWorkspaceBinding.fileSystemPath(this._project.id());
    const encodedPath = encodedPathParts.join('/');
    if (projectPath.length + encodedPath.length > 200) {
      const domain = encodedPathParts[0];
      const encodedFileName = encodedPathParts[encodedPathParts.length - 1];
      const shortFileName = encodedFileName ? encodedFileName.substr(0, 10) + '-' : '';
      const extension = Common.ParsedURL.extractExtension(urlPath);
      const extensionPart = extension ? '.' + extension.substr(0, 10) : '';
      encodedPathParts =
          [domain, 'longurls', shortFileName + String.hashCode(encodedPath).toString(16) + extensionPart];
    }
    return encodedPathParts.join('/');

    /**
     * @param {string} urlPath
     * @return {!Array<string>}
     */
    function encodeUrlPathToLocalPathParts(urlPath) {
      const encodedParts = [];
      for (const pathPart of fileNamePartsFromUrlPath(urlPath)) {
        if (!pathPart)
          continue;
        // encodeURI() escapes all the unsafe filename characters except /:?*
        let encodedName = encodeURI(pathPart).replace(/[\/:\?\*]/g, match => '%' + match[0].charCodeAt(0).toString(16));
        // Windows does not allow a small set of filenames.
        if (Persistence.NetworkPersistenceManager._reservedFileNames.has(encodedName.toLowerCase()))
          encodedName = encodedName.split('').map(char => '%' + char.charCodeAt(0).toString(16)).join('');
        // Windows does not allow the file to end in a space or dot (space should already be encoded).
        const lastChar = encodedName.charAt(encodedName.length - 1);
        if (lastChar === '.')
          encodedName = encodedName.substr(0, encodedName.length - 1) + '%2e';
        encodedParts.push(encodedName);
      }
      return encodedParts;
    }

    /**
     * @param {string} urlPath
     * @return {!Array<string>}
     */
    function fileNamePartsFromUrlPath(urlPath) {
      urlPath = Common.ParsedURL.urlWithoutHash(urlPath);
      const queryIndex = urlPath.indexOf('?');
      if (queryIndex === -1)
        return urlPath.split('/');
      if (queryIndex === 0)
        return [urlPath];
      const endSection = urlPath.substr(queryIndex);
      const parts = urlPath.substr(0, urlPath.length - endSection.length).split('/');
      parts[parts.length - 1] += endSection;
      return parts;
    }
  }

  /**
   * @param {string} path
   * @return {string}
   */
  _decodeLocalPathToUrlPath(path) {
    try {
      return unescape(path);
    } catch (e) {
      console.error(e);
    }
    return path;
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _unbind(uiSourceCode) {
    const binding = uiSourceCode[this._bindingSymbol];
    if (!binding)
      return;
    delete binding.network[this._bindingSymbol];
    delete binding.fileSystem[this._bindingSymbol];
    Persistence.persistence.removeBinding(binding);
  }

  /**
   * @param {!Workspace.UISourceCode} networkUISourceCode
   * @param {!Workspace.UISourceCode} fileSystemUISourceCode
   */
  async _bind(networkUISourceCode, fileSystemUISourceCode) {
    if (networkUISourceCode[this._bindingSymbol])
      this._unbind(networkUISourceCode);
    if (fileSystemUISourceCode[this._bindingSymbol])
      this._unbind(fileSystemUISourceCode);
    const binding = new Persistence.PersistenceBinding(networkUISourceCode, fileSystemUISourceCode);
    networkUISourceCode[this._bindingSymbol] = binding;
    fileSystemUISourceCode[this._bindingSymbol] = binding;
    Persistence.persistence.addBinding(binding);
    const uiSourceCodeOfTruth = networkUISourceCode[this._savingSymbol] ? networkUISourceCode : fileSystemUISourceCode;
    const [content, encoded] =
        await Promise.all([uiSourceCodeOfTruth.requestContent(), uiSourceCodeOfTruth.contentEncoded()]);
    Persistence.persistence.syncContent(uiSourceCodeOfTruth, content, encoded);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _onUISourceCodeWorkingCopyCommitted(uiSourceCode) {
    this.saveUISourceCodeForOverrides(uiSourceCode);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  canSaveUISourceCodeForOverrides(uiSourceCode) {
    return this._active && uiSourceCode.project().type() === Workspace.projectTypes.Network &&
        !uiSourceCode[this._bindingSymbol] && !uiSourceCode[this._savingSymbol];
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  async saveUISourceCodeForOverrides(uiSourceCode) {
    if (!this.canSaveUISourceCodeForOverrides(uiSourceCode))
      return;
    uiSourceCode[this._savingSymbol] = true;
    let encodedPath = this._encodedPathFromUrl(uiSourceCode.url());
    const content = await uiSourceCode.requestContent();
    const encoded = await uiSourceCode.contentEncoded();
    const lastIndexOfSlash = encodedPath.lastIndexOf('/');
    const encodedFileName = encodedPath.substr(lastIndexOfSlash + 1);
    encodedPath = encodedPath.substr(0, lastIndexOfSlash);
    await this._project.createFile(encodedPath, encodedFileName, content, encoded);
    this._fileCreatedForTest(encodedPath, encodedFileName);
    uiSourceCode[this._savingSymbol] = false;
  }

  /**
   * @param {string} path
   * @param {string} fileName
   */
  _fileCreatedForTest(path, fileName) {
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {string}
   */
  _patternForFileSystemUISourceCode(uiSourceCode) {
    const relativePathParts = Persistence.FileSystemWorkspaceBinding.relativePath(uiSourceCode);
    if (relativePathParts.length < 2)
      return '';
    if (relativePathParts[1] === 'longurls' && relativePathParts.length !== 2)
      return 'http?://' + relativePathParts[0] + '/*';
    return 'http?://' + this._decodeLocalPathToUrlPath(relativePathParts.join('/'));
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _onUISourceCodeAdded(uiSourceCode) {
    this._networkUISourceCodeAdded(uiSourceCode);
    this._filesystemUISourceCodeAdded(uiSourceCode);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _networkUISourceCodeAdded(uiSourceCode) {
    if (!this._active || uiSourceCode.project().type() !== Workspace.projectTypes.Network)
      return;
    const url = Common.ParsedURL.urlWithoutHash(uiSourceCode.url());
    this._networkUISourceCodeForEncodedPath.set(this._encodedPathFromUrl(url), uiSourceCode);

    const fileSystemUISourceCode =
        this._project.uiSourceCodeForURL(this._project.fileSystemPath() + '/' + this._encodedPathFromUrl(url));
    if (!fileSystemUISourceCode)
      return;
    this._bind(uiSourceCode, fileSystemUISourceCode);
  }

  /**
    * @param {!Workspace.UISourceCode} uiSourceCode
    */
  _filesystemUISourceCodeAdded(uiSourceCode) {
    if (!this._active || uiSourceCode.project() !== this._project)
      return;
    this._updateInterceptionPatterns();

    const relativePath = Persistence.FileSystemWorkspaceBinding.relativePath(uiSourceCode);
    const networkUISourceCode = this._networkUISourceCodeForEncodedPath.get(relativePath.join('/'));
    if (networkUISourceCode)
      this._bind(networkUISourceCode, uiSourceCode);
  }

  _updateInterceptionPatterns() {
    this._updateInterceptionThrottler.schedule(innerUpdateInterceptionPatterns.bind(this));

    /**
     * @this {Persistence.NetworkPersistenceManager}
     * @return {!Promise}
     */
    function innerUpdateInterceptionPatterns() {
      if (!this._active)
        return SDK.multitargetNetworkManager.setInterceptionHandlerForPatterns([], this._interceptionHandlerBound);
      const patterns = new Set();
      const indexFileName = 'index.html';
      for (const uiSourceCode of this._project.uiSourceCodes()) {
        const pattern = this._patternForFileSystemUISourceCode(uiSourceCode);
        patterns.add(pattern);
        if (pattern.endsWith('/' + indexFileName))
          patterns.add(pattern.substr(0, pattern.length - indexFileName.length));
      }

      return SDK.multitargetNetworkManager.setInterceptionHandlerForPatterns(
          Array.from(patterns).map(
              pattern =>
                  ({urlPattern: pattern, interceptionStage: Protocol.Network.InterceptionStage.HeadersReceived})),
          this._interceptionHandlerBound);
    }
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _onUISourceCodeRemoved(uiSourceCode) {
    this._networkUISourceCodeRemoved(uiSourceCode);
    this._filesystemUISourceCodeRemoved(uiSourceCode);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _networkUISourceCodeRemoved(uiSourceCode) {
    if (uiSourceCode.project().type() !== Workspace.projectTypes.Network)
      return;
    this._unbind(uiSourceCode);
    this._networkUISourceCodeForEncodedPath.delete(this._encodedPathFromUrl(uiSourceCode.url()));
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _filesystemUISourceCodeRemoved(uiSourceCode) {
    if (uiSourceCode.project() !== this._project)
      return;
    this._updateInterceptionPatterns();
    delete uiSourceCode[this._originalResponseContentPromiseSymbol];
    this._unbind(uiSourceCode);
  }

  _setProject(project) {
    if (project === this._project)
      return;

    if (this._project)
      this._project.uiSourceCodes().forEach(this._filesystemUISourceCodeRemoved.bind(this));

    this._project = project;

    if (this._project)
      this._project.uiSourceCodes().forEach(this._filesystemUISourceCodeAdded.bind(this));

    this._updateActiveProject();
    this.dispatchEventToListeners(Persistence.NetworkPersistenceManager.Events.ProjectChanged, this._project);
  }

  /**
   * @param {!Workspace.Project} project
   */
  _onProjectAdded(project) {
    if (project.type() !== Workspace.projectTypes.FileSystem ||
        Persistence.FileSystemWorkspaceBinding.fileSystemType(project) !== 'overrides')
      return;
    const fileSystemPath = Persistence.FileSystemWorkspaceBinding.fileSystemPath(project.id());
    if (!fileSystemPath)
      return;
    if (this._project)
      this._project.remove();

    this._setProject(project);
  }

  /**
   * @param {!Workspace.Project} project
   */
  _onProjectRemoved(project) {
    if (project !== this._project)
      return;
    this._setProject(null);
  }

  /**
   * @param {!SDK.MultitargetNetworkManager.InterceptedRequest} interceptedRequest
   * @return {!Promise}
   */
  async _interceptionHandler(interceptedRequest) {
    const method = interceptedRequest.request.method;
    if (!this._active || (method !== 'GET' && method !== 'POST'))
      return;
    const path = this._project.fileSystemPath() + '/' + this._encodedPathFromUrl(interceptedRequest.request.url);
    const fileSystemUISourceCode = this._project.uiSourceCodeForURL(path);
    if (!fileSystemUISourceCode)
      return;

    let mimeType = '';
    if (interceptedRequest.responseHeaders) {
      const responseHeaders = SDK.NetworkManager.lowercaseHeaders(interceptedRequest.responseHeaders);
      mimeType = responseHeaders['content-type'];
    }

    if (!mimeType) {
      const expectedResourceType = Common.resourceTypes[interceptedRequest.resourceType] || Common.resourceTypes.Other;
      mimeType = fileSystemUISourceCode.mimeType();
      if (Common.ResourceType.fromMimeType(mimeType) !== expectedResourceType)
        mimeType = expectedResourceType.canonicalMimeType();
    }
    const project =
        /** @type {!Persistence.FileSystemWorkspaceBinding.FileSystem} */ (fileSystemUISourceCode.project());

    fileSystemUISourceCode[this._originalResponseContentPromiseSymbol] =
        interceptedRequest.responseBody().then(response => {
          if (response.error || response.content === null)
            return null;
          return response.encoded ? atob(response.content) : response.content;
        });

    const blob = await project.requestFileBlob(fileSystemUISourceCode);
    interceptedRequest.continueRequestWithContent(new Blob([blob], {type: mimeType}));
  }
};

Persistence.NetworkPersistenceManager._reservedFileNames = new Set([
  'con',  'prn',  'aux',  'nul',  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7',
  'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);

Persistence.NetworkPersistenceManager.Events = {
  ProjectChanged: Symbol('ProjectChanged')
};

/** @type {!Persistence.NetworkPersistenceManager} */
Persistence.networkPersistenceManager;
