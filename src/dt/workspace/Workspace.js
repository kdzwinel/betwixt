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
 * @interface
 */
Workspace.ProjectSearchConfig = function() {};

Workspace.ProjectSearchConfig.prototype = {
  /**
   * @return {string}
   */
  query() {},

  /**
   * @return {boolean}
   */
  ignoreCase() {},

  /**
   * @return {boolean}
   */
  isRegex() {},

  /**
   * @return {!Array.<string>}
   */
  queries() {},

  /**
   * @param {string} filePath
   * @return {boolean}
   */
  filePathMatchesFileQuery(filePath) {}
};

/**
 * @interface
 */
Workspace.Project = function() {};

Workspace.Project.prototype = {
  /**
   * @return {!Workspace.Workspace}
   */
  workspace() {},

  /**
   * @return {string}
   */
  id() {},

  /**
   * @return {string}
   */
  type() {},

  /**
   * @return {boolean}
   */
  isServiceProject() {},

  /**
   * @return {string}
   */
  displayName() {},

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {!Promise<?Workspace.UISourceCodeMetadata>}
   */
  requestMetadata(uiSourceCode) {},

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {function(?string,boolean)} callback
   */
  requestFileContent(uiSourceCode, callback) {},

  /**
   * @return {boolean}
   */
  canSetFileContent() {},

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} newContent
   * @param {boolean} isBase64
   * @return {!Promise}
   */
  setFileContent(uiSourceCode, newContent, isBase64) {},

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {string}
   */
  fullDisplayName(uiSourceCode) {},

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {string}
   */
  mimeType(uiSourceCode) {},

  /**
   * @return {boolean}
   */
  canRename() {},

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} newName
   * @param {function(boolean, string=, string=, !Common.ResourceType=)} callback
   */
  rename(uiSourceCode, newName, callback) {},

  /**
   * @param {string} path
   */
  excludeFolder(path) {},

  /**
   * @param {string} path
   * @return {boolean}
   */
  canExcludeFolder(path) {},

  /**
   * @param {string} path
   * @param {?string} name
   * @param {string} content
   * @param {boolean=} isBase64
   * @return {!Promise<?Workspace.UISourceCode>}
   */
  createFile(path, name, content, isBase64) {},

  /**
   * @return {boolean}
   */
  canCreateFile() {},

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  deleteFile(uiSourceCode) {},

  remove() {},

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} query
   * @param {boolean} caseSensitive
   * @param {boolean} isRegex
   * @return {!Promise<!Array<!Common.ContentProvider.SearchMatch>>}
   */
  searchInFileContent(uiSourceCode, query, caseSensitive, isRegex) {},

  /**
   * @param {!Workspace.ProjectSearchConfig} searchConfig
   * @param {!Array.<string>} filesMathingFileQuery
   * @param {!Common.Progress} progress
   * @return {!Promise<!Array<string>>}
   */
  findFilesMatchingSearchRequest(searchConfig, filesMathingFileQuery, progress) {},

  /**
   * @param {!Common.Progress} progress
   */
  indexContent(progress) {},

  /**
   * @param {string} url
   * @return {?Workspace.UISourceCode}
   */
  uiSourceCodeForURL(url) {},

  /**
   * @return {!Array.<!Workspace.UISourceCode>}
   */
  uiSourceCodes() {}
};

/**
 * @enum {string}
 */
Workspace.projectTypes = {
  Debugger: 'debugger',
  Formatter: 'formatter',
  Network: 'network',
  FileSystem: 'filesystem',
  ContentScripts: 'contentscripts',
  Service: 'service'
};

/**
 * @unrestricted
 */
Workspace.ProjectStore = class {
  /**
   * @param {!Workspace.Workspace} workspace
   * @param {string} id
   * @param {!Workspace.projectTypes} type
   * @param {string} displayName
   */
  constructor(workspace, id, type, displayName) {
    this._workspace = workspace;
    this._id = id;
    this._type = type;
    this._displayName = displayName;

    /** @type {!Map.<string, !{uiSourceCode: !Workspace.UISourceCode, index: number}>} */
    this._uiSourceCodesMap = new Map();
    /** @type {!Array.<!Workspace.UISourceCode>} */
    this._uiSourceCodesList = [];

    this._project = /** @type {!Workspace.Project} */ (this);
  }

  /**
   * @return {string}
   */
  id() {
    return this._id;
  }

  /**
   * @return {string}
   */
  type() {
    return this._type;
  }

  /**
   * @return {string}
   */
  displayName() {
    return this._displayName;
  }

  /**
   * @return {!Workspace.Workspace}
   */
  workspace() {
    return this._workspace;
  }

  /**
   * @param {string} url
   * @param {!Common.ResourceType} contentType
   * @return {!Workspace.UISourceCode}
   */
  createUISourceCode(url, contentType) {
    return new Workspace.UISourceCode(this._project, url, contentType);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {boolean}
   */
  addUISourceCode(uiSourceCode) {
    const url = uiSourceCode.url();
    if (this.uiSourceCodeForURL(url))
      return false;
    this._uiSourceCodesMap.set(url, {uiSourceCode: uiSourceCode, index: this._uiSourceCodesList.length});
    this._uiSourceCodesList.push(uiSourceCode);
    this._workspace.dispatchEventToListeners(Workspace.Workspace.Events.UISourceCodeAdded, uiSourceCode);
    return true;
  }

  /**
   * @param {string} url
   */
  removeUISourceCode(url) {
    const uiSourceCode = this.uiSourceCodeForURL(url);
    if (!uiSourceCode)
      return;

    const entry = this._uiSourceCodesMap.get(url);
    const movedUISourceCode = this._uiSourceCodesList[this._uiSourceCodesList.length - 1];
    this._uiSourceCodesList[entry.index] = movedUISourceCode;
    const movedEntry = this._uiSourceCodesMap.get(movedUISourceCode.url());
    movedEntry.index = entry.index;
    this._uiSourceCodesList.splice(this._uiSourceCodesList.length - 1, 1);
    this._uiSourceCodesMap.delete(url);
    this._workspace.dispatchEventToListeners(Workspace.Workspace.Events.UISourceCodeRemoved, entry.uiSourceCode);
  }

  removeProject() {
    this._workspace._removeProject(this._project);
    this._uiSourceCodesMap = new Map();
    this._uiSourceCodesList = [];
  }

  /**
   * @param {string} url
   * @return {?Workspace.UISourceCode}
   */
  uiSourceCodeForURL(url) {
    const entry = this._uiSourceCodesMap.get(url);
    return entry ? entry.uiSourceCode : null;
  }

  /**
   * @return {!Array.<!Workspace.UISourceCode>}
   */
  uiSourceCodes() {
    return this._uiSourceCodesList;
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} newName
   */
  renameUISourceCode(uiSourceCode, newName) {
    const oldPath = uiSourceCode.url();
    const newPath = uiSourceCode.parentURL() ? uiSourceCode.parentURL() + '/' + newName : newName;
    const value =
        /** @type {!{uiSourceCode: !Workspace.UISourceCode, index: number}} */ (this._uiSourceCodesMap.get(oldPath));
    this._uiSourceCodesMap.set(newPath, value);
    this._uiSourceCodesMap.delete(oldPath);
  }
};

/**
 * @unrestricted
 */
Workspace.Workspace = class extends Common.Object {
  constructor() {
    super();
    /** @type {!Map<string, !Workspace.Project>} */
    this._projects = new Map();
    this._hasResourceContentTrackingExtensions = false;
  }

  /**
   * @param {string} projectId
   * @param {string} url
   * @return {?Workspace.UISourceCode}
   */
  uiSourceCode(projectId, url) {
    const project = this._projects.get(projectId);
    return project ? project.uiSourceCodeForURL(url) : null;
  }

  /**
   * @param {string} url
   * @return {?Workspace.UISourceCode}
   */
  uiSourceCodeForURL(url) {
    for (const project of this._projects.values()) {
      const uiSourceCode = project.uiSourceCodeForURL(url);
      if (uiSourceCode)
        return uiSourceCode;
    }
    return null;
  }

  /**
   * @param {string} type
   * @return {!Array.<!Workspace.UISourceCode>}
   */
  uiSourceCodesForProjectType(type) {
    let result = [];
    for (const project of this._projects.values()) {
      if (project.type() === type)
        result = result.concat(project.uiSourceCodes());
    }
    return result;
  }

  /**
   * @param {!Workspace.Project} project
   */
  addProject(project) {
    console.assert(!this._projects.has(project.id()), `A project with id ${project.id()} already exists!`);
    this._projects.set(project.id(), project);
    this.dispatchEventToListeners(Workspace.Workspace.Events.ProjectAdded, project);
  }

  /**
   * @param {!Workspace.Project} project
   */
  _removeProject(project) {
    this._projects.delete(project.id());
    this.dispatchEventToListeners(Workspace.Workspace.Events.ProjectRemoved, project);
  }

  /**
   * @param {string} projectId
   * @return {?Workspace.Project}
   */
  project(projectId) {
    return this._projects.get(projectId) || null;
  }

  /**
   * @return {!Array.<!Workspace.Project>}
   */
  projects() {
    return this._projects.valuesArray();
  }

  /**
   * @param {string} type
   * @return {!Array.<!Workspace.Project>}
   */
  projectsForType(type) {
    function filterByType(project) {
      return project.type() === type;
    }
    return this.projects().filter(filterByType);
  }

  /**
   * @return {!Array.<!Workspace.UISourceCode>}
   */
  uiSourceCodes() {
    let result = [];
    for (const project of this._projects.values())
      result = result.concat(project.uiSourceCodes());
    return result;
  }

  /**
   * @param {boolean} hasExtensions
   */
  setHasResourceContentTrackingExtensions(hasExtensions) {
    this._hasResourceContentTrackingExtensions = hasExtensions;
  }

  /**
   * @return {boolean}
   */
  hasResourceContentTrackingExtensions() {
    return this._hasResourceContentTrackingExtensions;
  }
};

/** @enum {symbol} */
Workspace.Workspace.Events = {
  UISourceCodeAdded: Symbol('UISourceCodeAdded'),
  UISourceCodeRemoved: Symbol('UISourceCodeRemoved'),
  UISourceCodeRenamed: Symbol('UISourceCodeRenamed'),
  WorkingCopyChanged: Symbol('WorkingCopyChanged'),
  WorkingCopyCommitted: Symbol('WorkingCopyCommitted'),
  WorkingCopyCommittedByUser: Symbol('WorkingCopyCommittedByUser'),
  ProjectAdded: Symbol('ProjectAdded'),
  ProjectRemoved: Symbol('ProjectRemoved')
};

/**
 * @type {!Workspace.Workspace}
 */
Workspace.workspace;
