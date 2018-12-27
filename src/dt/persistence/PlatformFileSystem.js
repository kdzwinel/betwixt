// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Persistence.PlatformFileSystem = class {
  /**
   * @param {string} path
   * @param {string} type
   */
  constructor(path, type) {
    this._path = path;
    this._type = type;
  }

  /**
   * @param {string} path
   * @return {!Promise<?{modificationTime: !Date, size: number}>}
   */
  getMetadata(path) {
    return Promise.resolve(/** @type ?{modificationTime: !Date, size: number} */ (null));
  }

  /**
   * @return {!Array<string>}
   */
  initialFilePaths() {
    return [];
  }

  /**
   * @return {!Array<string>}
   */
  initialGitFolders() {
    return [];
  }

  /**
   * @return {string}
   */
  path() {
    return this._path;
  }

  /**
   * @return {string}
   */
  embedderPath() {
    throw new Error('Not implemented');
  }

  /**
   * @return {string}
   */
  type() {
    // TODO(kozyatinskiy): remove type, overrides should implement this interface.
    return this._type;
  }

  /**
   * @param {string} path
   * @param {?string} name
   * @return {!Promise<?string>}
   */
  async createFile(path, name) {
    return Promise.resolve(null);
  }

  /**
   * @param {string} path
   * @return {!Promise<boolean>}
   */
  deleteFile(path) {
    return Promise.resolve(false);
  }

  /**
   * @param {string} path
   * @return {!Promise<?Blob>}
   */
  requestFileBlob(path) {
    return Promise.resolve(/** @type {?Blob} */ (null));
  }

  /**
   * @param {string} path
   * @param {function(?string,boolean)} callback
   */
  requestFileContent(path, callback) {
    callback(null, false);
  }

  /**
   * @param {string} path
   * @param {string} content
   * @param {boolean} isBase64
   */
  setFileContent(path, content, isBase64) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} path
   * @param {string} newName
   * @param {function(boolean, string=)} callback
   */
  renameFile(path, newName, callback) {
    callback(false);
  }

  /**
   * @param {string} path
   */
  addExcludedFolder(path) {
  }

  /**
   * @param {string} path
   */
  removeExcludedFolder(path) {
  }

  fileSystemRemoved() {
  }

  /**
   * @param {string} folderPath
   * @return {boolean}
   */
  isFileExcluded(folderPath) {
    return false;
  }

  /**
   * @return {!Set<string>}
   */
  excludedFolders() {
    return new Set();
  }

  /**
   * @param {string} query
   * @param {!Common.Progress} progress
   * @return {!Promise<!Array<string>>}
   */
  searchInPath(query, progress) {
    return Promise.resolve([]);
  }

  /**
   * @param {!Common.Progress} progress
   */
  indexContent(progress) {
    setImmediate(() => progress.done());
  }

  /**
   * @param {string} path
   * @return {string}
   */
  mimeFromPath(path) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} path
   * @return {boolean}
   */
  canExcludeFolder(path) {
    return false;
  }

  /**
   * @param {string} path
   * @return {!Common.ResourceType}
   */
  contentType(path) {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} url
   * @return {string}
   */
  tooltipForURL(url) {
    throw new Error('Not implemented');
  }

  /**
   * @return {boolean}
   */
  supportsAutomapping() {
    throw new Error('Not implemented');
  }
};
