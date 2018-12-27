// Copyright 2017 The Chromium Authors. All
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview using private properties isn't a Closure violation in tests.
 * @suppress {accessControls}
 */

InspectorFrontendHost.isolatedFileSystem = function(name) {
  return BindingsTestRunner.TestFileSystem._instances[name];
};

BindingsTestRunner.TestFileSystem = function(fileSystemPath) {
  this.root = new BindingsTestRunner.TestFileSystem.Entry(this, '', true, null);
  this.fileSystemPath = fileSystemPath;
};

BindingsTestRunner.TestFileSystem._instances = {};

BindingsTestRunner.TestFileSystem.prototype = {
  dumpAsText: function() {
    const result = [];
    dfs(this.root, '');
    result[0] = this.fileSystemPath;
    return result.join('\n');

    function dfs(node, indent) {
      result.push(indent + node.name);
      const newIndent = indent + '    ';

      for (const child of node._children)
        dfs(child, newIndent);
    }
  },

  reportCreatedPromise: function(type) {
    return new Promise(fulfill => this.reportCreated(fulfill, type));
  },

  reportCreated: function(callback, type) {
    const fileSystemPath = this.fileSystemPath;
    BindingsTestRunner.TestFileSystem._instances[this.fileSystemPath] = this;

    InspectorFrontendHost.events.dispatchEventToListeners(
        InspectorFrontendHostAPI.Events.FileSystemAdded,
        {fileSystem: {fileSystemPath: this.fileSystemPath, fileSystemName: this.fileSystemPath, type}});

    Persistence.isolatedFileSystemManager.addEventListener(
        Persistence.IsolatedFileSystemManager.Events.FileSystemAdded, created);

    function created(event) {
      const fileSystem = event.data;

      if (fileSystem.path() !== fileSystemPath)
        return;

      Persistence.isolatedFileSystemManager.removeEventListener(
          Persistence.IsolatedFileSystemManager.Events.FileSystemAdded, created);
      callback(fileSystem);
    }
  },

  reportRemoved: function() {
    delete BindingsTestRunner.TestFileSystem._instances[this.fileSystemPath];
    InspectorFrontendHost.events.dispatchEventToListeners(
        InspectorFrontendHostAPI.Events.FileSystemRemoved, this.fileSystemPath);
  },

  addFile: function(path, content, lastModified) {
    const pathTokens = path.split('/');
    let node = this.root;
    const folders = pathTokens.slice(0, pathTokens.length - 1);
    const fileName = pathTokens.peekLast();

    for (const folder of folders) {
      let dir = node._childrenMap[folder];

      if (!dir)
        dir = node.mkdir(folder);

      node = dir;
    }

    const file = node.addFile(fileName, content);

    if (lastModified)
      file._timestamp = lastModified;

    return file;
  }
};

BindingsTestRunner.TestFileSystem.Entry = function(fileSystem, name, isDirectory, parent) {
  this._fileSystem = fileSystem;
  this.name = name;
  this._children = [];
  this._childrenMap = {};
  this.isDirectory = isDirectory;
  this._timestamp = 1000000;
  this._parent = parent;
};

BindingsTestRunner.TestFileSystem.Entry.prototype = {
  get fullPath() {
    return (this.parent ? this.parent.fullPath + '/' + this.name : '');
  },

  remove: function(success, failure) {
    this._parent._removeChild(this, success, failure);
  },

  _removeChild: function(child, success, failure) {
    const index = this._children.indexOf(child);

    if (index === -1) {
      failure('Failed to remove file: file not found.');
      return;
    }

    const fullPath = this._fileSystem.fileSystemPath + child.fullPath;
    this._children.splice(index, 1);
    delete this._childrenMap[child.name];
    child.parent = null;

    InspectorFrontendHost.events.dispatchEventToListeners(
        InspectorFrontendHostAPI.Events.FileSystemFilesChangedAddedRemoved,
        {changed: [], added: [], removed: [fullPath]});

    success();
  },

  mkdir: function(name) {
    const child = new BindingsTestRunner.TestFileSystem.Entry(this._fileSystem, name, true, this);
    this._childrenMap[name] = child;
    this._children.push(child);
    child.parent = this;
    return child;
  },

  addFile: function(name, content) {
    const child = new BindingsTestRunner.TestFileSystem.Entry(this._fileSystem, name, false, this);
    this._childrenMap[name] = child;
    this._children.push(child);
    child.parent = this;

    child.content = new Blob([content], {type: 'text/plain'});

    const fullPath = this._fileSystem.fileSystemPath + child.fullPath;

    InspectorFrontendHost.events.dispatchEventToListeners(
        InspectorFrontendHostAPI.Events.FileSystemFilesChangedAddedRemoved,
        {changed: [], added: [fullPath], removed: []});

    return child;
  },

  setContent: function(content) {
    this.content = new Blob([content], {type: 'text/plain'});

    this._timestamp += 1000;
    const fullPath = this._fileSystem.fileSystemPath + this.fullPath;

    InspectorFrontendHost.events.dispatchEventToListeners(
        InspectorFrontendHostAPI.Events.FileSystemFilesChangedAddedRemoved,
        {changed: [fullPath], added: [], removed: []});
  },

  createReader: function() {
    return new BindingsTestRunner.TestFileSystem.Reader(this._children);
  },

  createWriter: function(success, failure) {
    success(new BindingsTestRunner.TestFileSystem.Writer(this));
  },

  file: function(callback) {
    callback(this.content);
  },

  getDirectory: function(path, noop, callback, errorCallback) {
    this.getEntry(path, noop, callback, errorCallback);
  },

  getFile: function(path, noop, callback, errorCallback) {
    this.getEntry(path, noop, callback, errorCallback);
  },

  _createEntry: function(path, options, callback, errorCallback) {
    const tokens = path.split('/');
    const name = tokens.pop();
    let parentEntry = this;

    for (const token of tokens)
      parentEntry = parentEntry._childrenMap[token];

    let entry = parentEntry._childrenMap[name];

    if (entry && options.exclusive) {
      errorCallback(new DOMException('File exists: ' + path, 'InvalidModificationError'));
      return;
    }

    if (!entry)
      entry = parentEntry.addFile(name, '');

    callback(entry);
  },

  getEntry: function(path, options, callback, errorCallback) {
    if (path.startsWith('/'))
      path = path.substring(1);

    if (options && options.create) {
      this._createEntry(path, options, callback, errorCallback);
      return;
    }

    if (!path) {
      callback(this);
      return;
    }

    let entry = this;

    for (const token of path.split('/')) {
      entry = entry._childrenMap[token];
      if (!entry)
        break;
    }

    (entry ? callback(entry) : errorCallback(new DOMException('Path not found: ' + path, 'NotFoundError')));
  },

  getMetadata: function(success, failure) {
    success({modificationTime: new Date(this._timestamp), size: (this.isDirectory ? 0 : this.content.size)});
  },

  moveTo: function(parent, newName, callback, errorCallback) {
    this._parent._children.remove(this);
    delete this._parent._childrenMap[this.name];
    this._parent = parent;
    this._parent._children.push(this);
    this.name = newName;
    this._parent._childrenMap[this.name] = this;
    callback(this);
  },

  getParent: function(callback, errorCallback) {
    callback(this._parent);
  }
};

BindingsTestRunner.TestFileSystem.Reader = function(children) {
  this._children = children;
};

BindingsTestRunner.TestFileSystem.Reader.prototype = {
  readEntries: function(callback) {
    const children = this._children;
    this._children = [];
    callback(children);
  }
};

BindingsTestRunner.TestFileSystem.Writer = function(entry) {
  this._entry = entry;
  this._modificationTimesDelta = 500;
};

BindingsTestRunner.TestFileSystem.Writer.prototype = {
  write: function(blob) {
    this._entry._timestamp += this._modificationTimesDelta;
    this._entry.content = blob;

    if (this.onwriteend)
      this.onwriteend();
  },

  truncate: function(num) {
    this._entry._timestamp += this._modificationTimesDelta;
    this._entry.content = this._entry.content.slice(0, num);

    if (this.onwriteend)
      this.onwriteend();
  }
};
