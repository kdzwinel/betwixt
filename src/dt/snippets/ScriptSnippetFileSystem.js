// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Snippets.SnippetFileSystem = class extends Persistence.PlatformFileSystem {
  constructor() {
    super('snippet://', 'snippets');
    this._lastSnippetIdentifierSetting = Common.settings.createSetting('scriptSnippets_lastIdentifier', 0);
    this._snippetsSetting = Common.settings.createSetting('scriptSnippets', []);
  }

  /**
   * @override
   * @return {!Array<string>}
   */
  initialFilePaths() {
    const savedSnippets = this._snippetsSetting.get();
    return savedSnippets.map(snippet => escape(snippet.name));
  }

  /**
   * @override
   * @param {string} path
   * @param {?string} name
   * @return {!Promise<?string>}
   */
  async createFile(path, name) {
    const nextId = this._lastSnippetIdentifierSetting.get() + 1;
    this._lastSnippetIdentifierSetting.set(nextId);

    const snippetName = `Script snippet #${nextId}`;
    const snippets = this._snippetsSetting.get();
    snippets.push({name: snippetName, content: ''});
    this._snippetsSetting.set(snippets);

    return escape(snippetName);
  }

  /**
   * @override
   * @param {string} path
   * @return {!Promise<boolean>}
   */
  async deleteFile(path) {
    const name = unescape(path.substring(1));
    const allSnippets = this._snippetsSetting.get();
    const snippets = allSnippets.filter(snippet => snippet.name !== name);
    if (allSnippets.length !== snippets.length) {
      this._snippetsSetting.set(snippets);
      return true;
    }
    return false;
  }

  /**
   * @override
   * @param {string} path
   * @param {function(?string,boolean)} callback
   */
  requestFileContent(path, callback) {
    const name = unescape(path.substring(1));
    const snippet = this._snippetsSetting.get().find(snippet => snippet.name === name);
    callback(snippet ? snippet.content : null, /* encoded */ false);
  }

  /**
   * @override
   * @param {string} path
   * @param {string} content
   * @param {boolean} isBase64
   */
  async setFileContent(path, content, isBase64) {
    const name = unescape(path.substring(1));
    const snippets = this._snippetsSetting.get();
    const snippet = snippets.find(snippet => snippet.name === name);
    if (snippet) {
      snippet.content = content;
      this._snippetsSetting.set(snippets);
      return true;
    }
    return false;
  }

  /**
   * @override
   * @param {string} path
   * @param {string} newName
   * @param {function(boolean, string=)} callback
   */
  renameFile(path, newName, callback) {
    const name = unescape(path.substring(1));
    const snippets = this._snippetsSetting.get();
    const snippet = snippets.find(snippet => snippet.name === name);
    newName = newName.trim();
    if (!snippet || newName.length === 0 || snippets.find(snippet => snippet.name === newName)) {
      callback(false);
      return;
    }
    snippet.name = newName;
    this._snippetsSetting.set(snippets);
    callback(true, newName);
  }

  /**
   * @override
   * @param {string} query
   * @param {!Common.Progress} progress
   * @return {!Promise<!Array<string>>}
   */
  async searchInPath(query, progress) {
    const re = new RegExp(query.escapeForRegExp(), 'i');
    const snippets = this._snippetsSetting.get().filter(snippet => snippet.content.match(re));
    return snippets.map(snippet => escape(snippet.name));
  }

  /**
   * @override
   * @param {string} path
   * @return {string}
   */
  mimeFromPath(path) {
    return 'text/javascript';
  }

  /**
   * @override
   * @param {string} path
   * @return {!Common.ResourceType}
   */
  contentType(path) {
    return Common.resourceTypes.Script;
  }

  /**
   * @override
   * @param {string} url
   * @return {string}
   */
  tooltipForURL(url) {
    return ls`Linked to ${unescape(url.substring(this.path().length))}`;
  }

  /**
   * @override
   * @return {boolean}
   */
  supportsAutomapping() {
    return true;
  }
};

/**
 * @param {!Workspace.UISourceCode} uiSourceCode
 */
Snippets.evaluateScriptSnippet = async function(uiSourceCode) {
  if (!uiSourceCode.url().startsWith('snippet://'))
    return;

  const executionContext = UI.context.flavor(SDK.ExecutionContext);
  if (!executionContext)
    return;

  const runtimeModel = executionContext.runtimeModel;

  await uiSourceCode.requestContent();
  uiSourceCode.commitWorkingCopy();
  const expression = uiSourceCode.workingCopy();
  Common.console.show();

  const url = uiSourceCode.url();

  const result = await executionContext.evaluate(
      {
        expression: `${expression}\n//# sourceURL=${url}`,
        objectGroup: 'console',
        silent: false,
        includeCommandLineAPI: true,
        returnByValue: false,
        generatePreview: true,
      },
      /* userGesture */ false,
      /* awaitPromise */ true);

  if (result.exceptionDetails) {
    SDK.consoleModel.addMessage(SDK.ConsoleMessage.fromException(
        runtimeModel, result.exceptionDetails, /* messageType */ undefined, /* timestamp */ undefined, url));
    return;
  }
  if (!result.object)
    return;

  const scripts = executionContext.debuggerModel.scriptsForSourceURL(url);
  const scriptId = scripts[scripts.length - 1].scriptId;
  SDK.consoleModel.addMessage(new SDK.ConsoleMessage(
      runtimeModel, SDK.ConsoleMessage.MessageSource.JS, SDK.ConsoleMessage.MessageLevel.Info, '',
      SDK.ConsoleMessage.MessageType.Result, url, undefined, undefined, [result.object], undefined, undefined,
      executionContext.id, scriptId));
};

/**
 * @param {!Workspace.UISourceCode} uiSourceCode
 * @return {boolean}
 */
Snippets.isSnippetsUISourceCode = function(uiSourceCode) {
  return uiSourceCode.url().startsWith('snippet://');
};

/**
 * @param {!Workspace.Project} project
 * @return {boolean}
 */
Snippets.isSnippetsProject = function(project) {
  return project.type() === Workspace.projectTypes.FileSystem &&
      Persistence.FileSystemWorkspaceBinding.fileSystemType(project) === 'snippets';
};

Persistence.isolatedFileSystemManager.addPlatformFileSystem('snippet://', new Snippets.SnippetFileSystem());
Snippets.project = /** @type {!Workspace.Project} */ (
    Workspace.workspace.projectsForType(Workspace.projectTypes.FileSystem)
        .find(project => Persistence.FileSystemWorkspaceBinding.fileSystemType(project) === 'snippets'));
