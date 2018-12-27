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
 * @implements {Workspace.Project}
 * @unrestricted
 */
Bindings.ContentProviderBasedProject = class extends Workspace.ProjectStore {
  /**
   * @param {!Workspace.Workspace} workspace
   * @param {string} id
   * @param {!Workspace.projectTypes} type
   * @param {string} displayName
   * @param {boolean} isServiceProject
   */
  constructor(workspace, id, type, displayName, isServiceProject) {
    super(workspace, id, type, displayName);
    /** @type {!Object.<string, !Common.ContentProvider>} */
    this._contentProviders = {};
    this._isServiceProject = isServiceProject;
    workspace.addProject(this);
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {function(?string,boolean)} callback
   */
  requestFileContent(uiSourceCode, callback) {
    const contentProvider = this._contentProviders[uiSourceCode.url()];
    (async () => {
      callback(await contentProvider.requestContent(), await contentProvider.contentEncoded());
    })();
  }

  /**
   * @override
   * @return {boolean}
   */
  isServiceProject() {
    return this._isServiceProject;
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!Promise<?Workspace.UISourceCodeMetadata>}
   */
  requestMetadata(uiSourceCode) {
    return Promise.resolve(uiSourceCode[Bindings.ContentProviderBasedProject._metadata]);
  }

  /**
   * @override
   * @return {boolean}
   */
  canSetFileContent() {
    return false;
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} newContent
   * @param {boolean} isBase64
   * @return {!Promise}
   */
  async setFileContent(uiSourceCode, newContent, isBase64) {
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {string}
   */
  fullDisplayName(uiSourceCode) {
    let parentPath = uiSourceCode.parentURL().replace(/^(?:https?|file)\:\/\//, '');
    try {
      parentPath = decodeURI(parentPath);
    } catch (e) {
    }
    return parentPath + '/' + uiSourceCode.displayName(true);
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {string}
   */
  mimeType(uiSourceCode) {
    return /** @type {string} */ (uiSourceCode[Bindings.ContentProviderBasedProject._mimeType]);
  }

  /**
   * @override
   * @return {boolean}
   */
  canRename() {
    return false;
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} newName
   * @param {function(boolean, string=, string=, !Common.ResourceType=)} callback
   */
  rename(uiSourceCode, newName, callback) {
    const path = uiSourceCode.url();
    this.performRename(path, newName, innerCallback.bind(this));

    /**
     * @param {boolean} success
     * @param {string=} newName
     * @this {Bindings.ContentProviderBasedProject}
     */
    function innerCallback(success, newName) {
      if (success && newName) {
        const copyOfPath = path.split('/');
        copyOfPath[copyOfPath.length - 1] = newName;
        const newPath = copyOfPath.join('/');
        this._contentProviders[newPath] = this._contentProviders[path];
        delete this._contentProviders[path];
        this.renameUISourceCode(uiSourceCode, newName);
      }
      callback(success, newName);
    }
  }

  /**
   * @override
   * @param {string} path
   */
  excludeFolder(path) {
  }

  /**
   * @override
   * @param {string} path
   * @return {boolean}
   */
  canExcludeFolder(path) {
    return false;
  }

  /**
   * @override
   * @param {string} path
   * @param {?string} name
   * @param {string} content
   * @param {boolean=} isBase64
   * @return {!Promise<?Workspace.UISourceCode>}
   */
  createFile(path, name, content, isBase64) {
  }

  /**
   * @override
   * @return {boolean}
   */
  canCreateFile() {
    return false;
  }

  /**
   * @override
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  deleteFile(uiSourceCode) {
  }

  /**
   * @override
   */
  remove() {
  }

  /**
   * @param {string} path
   * @param {string} newName
   * @param {function(boolean, string=)} callback
   */
  performRename(path, newName, callback) {
    callback(false);
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
    const contentProvider = this._contentProviders[uiSourceCode.url()];
    return contentProvider.searchInContent(query, caseSensitive, isRegex);
  }

  /**
   * @override
   * @param {!Workspace.ProjectSearchConfig} searchConfig
   * @param {!Array<string>} filesMathingFileQuery
   * @param {!Common.Progress} progress
   * @return {!Promise<!Array<string>>}
   */
  async findFilesMatchingSearchRequest(searchConfig, filesMathingFileQuery, progress) {
    const result = [];
    progress.setTotalWork(filesMathingFileQuery.length);
    await Promise.all(filesMathingFileQuery.map(searchInContent.bind(this)));
    progress.done();
    return result;

    /**
     * @param {string} path
     * @this {Bindings.ContentProviderBasedProject}
     */
    async function searchInContent(path) {
      const provider = this._contentProviders[path];
      let allMatchesFound = true;
      for (const query of searchConfig.queries().slice()) {
        const searchMatches = await provider.searchInContent(query, !searchConfig.ignoreCase(), searchConfig.isRegex());
        if (!searchMatches.length) {
          allMatchesFound = false;
          break;
        }
      }
      if (allMatchesFound)
        result.push(path);
      progress.worked(1);
    }
  }

  /**
   * @override
   * @param {!Common.Progress} progress
   */
  indexContent(progress) {
    setImmediate(progress.done.bind(progress));
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {!Common.ContentProvider} contentProvider
   * @param {?Workspace.UISourceCodeMetadata} metadata
   * @param {string} mimeType
   */
  addUISourceCodeWithProvider(uiSourceCode, contentProvider, metadata, mimeType) {
    uiSourceCode[Bindings.ContentProviderBasedProject._mimeType] = mimeType;
    this._contentProviders[uiSourceCode.url()] = contentProvider;
    uiSourceCode[Bindings.ContentProviderBasedProject._metadata] = metadata;
    this.addUISourceCode(uiSourceCode);
  }

  /**
   * @param {string} url
   * @param {!Common.ContentProvider} contentProvider
   * @param {string} mimeType
   * @return {!Workspace.UISourceCode}
   */
  addContentProvider(url, contentProvider, mimeType) {
    const uiSourceCode = this.createUISourceCode(url, contentProvider.contentType());
    this.addUISourceCodeWithProvider(uiSourceCode, contentProvider, null, mimeType);
    return uiSourceCode;
  }

  /**
   * @param {string} path
   */
  removeFile(path) {
    delete this._contentProviders[path];
    this.removeUISourceCode(path);
  }

  reset() {
    this._contentProviders = {};
    this.removeProject();
    this.workspace().addProject(this);
  }

  dispose() {
    this._contentProviders = {};
    this.removeProject();
  }
};

Bindings.ContentProviderBasedProject._metadata = Symbol('ContentProviderBasedProject.Metadata');
Bindings.ContentProviderBasedProject._mimeType = Symbol('Bindings.ContentProviderBasedProject._mimeType');
