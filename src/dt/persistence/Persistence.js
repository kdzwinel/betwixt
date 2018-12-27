// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @unrestricted
 */
Persistence.Persistence = class extends Common.Object {
  /**
   * @param {!Workspace.Workspace} workspace
   * @param {!Bindings.BreakpointManager} breakpointManager
   */
  constructor(workspace, breakpointManager) {
    super();
    this._workspace = workspace;
    this._breakpointManager = breakpointManager;
    /** @type {!Map<string, number>} */
    this._filePathPrefixesToBindingCount = new Map();

    /** @type {!Multimap<!Workspace.UISourceCode, function()>} */
    this._subscribedBindingEventListeners = new Multimap();

    const linkDecorator = new Persistence.PersistenceUtils.LinkDecorator(this);
    Components.Linkifier.setLinkDecorator(linkDecorator);
    this._mapping = null;
    this.setAutomappingEnabled(true);
  }

  /**
   * @param {boolean} enabled
   */
  setAutomappingEnabled(enabled) {
    if (enabled === !!this._mapping)
      return;
    if (!enabled) {
      this._mapping.dispose();
      this._mapping = null;
    } else {
      this._mapping = new Persistence.Automapping(
          this._workspace, this._onStatusAdded.bind(this), this._onStatusRemoved.bind(this));
    }
  }

  /**
   * @param {!Persistence.PersistenceBinding} binding
   */
  addBinding(binding) {
    this._innerAddBinding(binding);
  }

  /**
   * @param {!Persistence.PersistenceBinding} binding
   */
  addBindingForTest(binding) {
    this._innerAddBinding(binding);
  }

  /**
   * @param {!Persistence.PersistenceBinding} binding
   */
  removeBinding(binding) {
    this._innerRemoveBinding(binding);
  }

  /**
   * @param {!Persistence.PersistenceBinding} binding
   */
  removeBindingForTest(binding) {
    this._innerRemoveBinding(binding);
  }

  /**
   * @param {!Persistence.PersistenceBinding} binding
   */
  _innerAddBinding(binding) {
    binding.network[Persistence.Persistence._binding] = binding;
    binding.fileSystem[Persistence.Persistence._binding] = binding;

    binding.fileSystem.forceLoadOnCheckContent();

    binding.network.addEventListener(
        Workspace.UISourceCode.Events.WorkingCopyCommitted, this._onWorkingCopyCommitted, this);
    binding.fileSystem.addEventListener(
        Workspace.UISourceCode.Events.WorkingCopyCommitted, this._onWorkingCopyCommitted, this);
    binding.network.addEventListener(
        Workspace.UISourceCode.Events.WorkingCopyChanged, this._onWorkingCopyChanged, this);
    binding.fileSystem.addEventListener(
        Workspace.UISourceCode.Events.WorkingCopyChanged, this._onWorkingCopyChanged, this);

    this._addFilePathBindingPrefixes(binding.fileSystem.url());

    this._moveBreakpoints(binding.fileSystem, binding.network);

    console.assert(!binding.fileSystem.isDirty() || !binding.network.isDirty());
    if (binding.fileSystem.isDirty()) {
      this._syncWorkingCopy(binding.fileSystem);
    } else if (binding.network.isDirty()) {
      this._syncWorkingCopy(binding.network);
    } else if (binding.network.hasCommits() && binding.network.content() !== binding.fileSystem.content()) {
      binding.network.setWorkingCopy(binding.network.content());
      this._syncWorkingCopy(binding.network);
    }

    this._notifyBindingEvent(binding.network);
    this._notifyBindingEvent(binding.fileSystem);
    this.dispatchEventToListeners(Persistence.Persistence.Events.BindingCreated, binding);
  }

  /**
   * @param {!Persistence.PersistenceBinding} binding
   */
  _innerRemoveBinding(binding) {
    if (binding.network[Persistence.Persistence._binding] !== binding)
      return;
    console.assert(
        binding.network[Persistence.Persistence._binding] === binding.fileSystem[Persistence.Persistence._binding],
        'ERROR: inconsistent binding for networkURL ' + binding.network.url());

    binding.network[Persistence.Persistence._binding] = null;
    binding.fileSystem[Persistence.Persistence._binding] = null;

    binding.network.removeEventListener(
        Workspace.UISourceCode.Events.WorkingCopyCommitted, this._onWorkingCopyCommitted, this);
    binding.fileSystem.removeEventListener(
        Workspace.UISourceCode.Events.WorkingCopyCommitted, this._onWorkingCopyCommitted, this);
    binding.network.removeEventListener(
        Workspace.UISourceCode.Events.WorkingCopyChanged, this._onWorkingCopyChanged, this);
    binding.fileSystem.removeEventListener(
        Workspace.UISourceCode.Events.WorkingCopyChanged, this._onWorkingCopyChanged, this);

    this._removeFilePathBindingPrefixes(binding.fileSystem.url());
    this._breakpointManager.copyBreakpoints(binding.network.url(), binding.fileSystem);

    this._notifyBindingEvent(binding.network);
    this._notifyBindingEvent(binding.fileSystem);
    this.dispatchEventToListeners(Persistence.Persistence.Events.BindingRemoved, binding);
  }

  /**
   * @param {!Persistence.AutomappingStatus} status
   */
  _onStatusAdded(status) {
    const binding = new Persistence.PersistenceBinding(status.network, status.fileSystem);
    status[Persistence.Persistence._binding] = binding;
    this._innerAddBinding(binding);
  }

  /**
   * @param {!Persistence.AutomappingStatus} status
   */
  _onStatusRemoved(status) {
    const binding = /** @type {!Persistence.PersistenceBinding} */ (status[Persistence.Persistence._binding]);
    this._innerRemoveBinding(binding);
  }

  /**
   * @param {!Common.Event} event
   */
  _onWorkingCopyChanged(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data);
    this._syncWorkingCopy(uiSourceCode);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _syncWorkingCopy(uiSourceCode) {
    const binding = uiSourceCode[Persistence.Persistence._binding];
    if (!binding || binding[Persistence.Persistence._muteWorkingCopy])
      return;
    const other = binding.network === uiSourceCode ? binding.fileSystem : binding.network;
    if (!uiSourceCode.isDirty()) {
      binding[Persistence.Persistence._muteWorkingCopy] = true;
      other.resetWorkingCopy();
      binding[Persistence.Persistence._muteWorkingCopy] = false;
      this._contentSyncedForTest();
      return;
    }

    const target = Bindings.NetworkProject.targetForUISourceCode(binding.network);
    if (target.type() === SDK.Target.Type.Node) {
      const newContent = uiSourceCode.workingCopy();
      other.requestContent().then(() => {
        const nodeJSContent = Persistence.Persistence.rewrapNodeJSContent(other, other.workingCopy(), newContent);
        setWorkingCopy.call(this, () => nodeJSContent);
      });
      return;
    }

    setWorkingCopy.call(this, () => uiSourceCode.workingCopy());

    /**
     * @param {function():string} workingCopyGetter
     * @this {Persistence.Persistence}
     */
    function setWorkingCopy(workingCopyGetter) {
      binding[Persistence.Persistence._muteWorkingCopy] = true;
      other.setWorkingCopyGetter(workingCopyGetter);
      binding[Persistence.Persistence._muteWorkingCopy] = false;
      this._contentSyncedForTest();
    }
  }

  /**
   * @param {!Common.Event} event
   */
  _onWorkingCopyCommitted(event) {
    const uiSourceCode = /** @type {!Workspace.UISourceCode} */ (event.data.uiSourceCode);
    const newContent = /** @type {string} */ (event.data.content);
    this.syncContent(uiSourceCode, newContent, event.data.encoded);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} newContent
   * @param {boolean} encoded
   */
  syncContent(uiSourceCode, newContent, encoded) {
    const binding = uiSourceCode[Persistence.Persistence._binding];
    if (!binding || binding[Persistence.Persistence._muteCommit])
      return;
    const other = binding.network === uiSourceCode ? binding.fileSystem : binding.network;
    const target = Bindings.NetworkProject.targetForUISourceCode(binding.network);
    if (target.type() === SDK.Target.Type.Node) {
      other.requestContent().then(currentContent => {
        const nodeJSContent = Persistence.Persistence.rewrapNodeJSContent(other, currentContent, newContent);
        setContent.call(this, nodeJSContent);
      });
      return;
    }
    setContent.call(this, newContent);

    /**
     * @param {string} newContent
     * @this {Persistence.Persistence}
     */
    function setContent(newContent) {
      binding[Persistence.Persistence._muteCommit] = true;
      other.setContent(newContent, encoded);
      binding[Persistence.Persistence._muteCommit] = false;
      this._contentSyncedForTest();
    }
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {string} currentContent
   * @param {string} newContent
   * @return {string}
   */
  static rewrapNodeJSContent(uiSourceCode, currentContent, newContent) {
    if (uiSourceCode.project().type() === Workspace.projectTypes.FileSystem) {
      if (newContent.startsWith(Persistence.Persistence._NodePrefix) &&
          newContent.endsWith(Persistence.Persistence._NodeSuffix)) {
        newContent = newContent.substring(
            Persistence.Persistence._NodePrefix.length, newContent.length - Persistence.Persistence._NodeSuffix.length);
      }
      if (currentContent.startsWith(Persistence.Persistence._NodeShebang))
        newContent = Persistence.Persistence._NodeShebang + newContent;
    } else {
      if (newContent.startsWith(Persistence.Persistence._NodeShebang))
        newContent = newContent.substring(Persistence.Persistence._NodeShebang.length);
      if (currentContent.startsWith(Persistence.Persistence._NodePrefix) &&
          currentContent.endsWith(Persistence.Persistence._NodeSuffix))
        newContent = Persistence.Persistence._NodePrefix + newContent + Persistence.Persistence._NodeSuffix;
    }
    return newContent;
  }

  _contentSyncedForTest() {
  }

  /**
   * @param {!Workspace.UISourceCode} from
   * @param {!Workspace.UISourceCode} to
   */
  _moveBreakpoints(from, to) {
    const breakpoints = this._breakpointManager.breakpointLocationsForUISourceCode(from).map(
        breakpointLocation => breakpointLocation.breakpoint);
    for (const breakpoint of breakpoints) {
      breakpoint.remove(false /* keepInStorage */);
      this._breakpointManager.setBreakpoint(
          to, breakpoint.lineNumber(), breakpoint.columnNumber(), breakpoint.condition(), breakpoint.enabled());
    }
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {boolean}
   */
  hasUnsavedCommittedChanges(uiSourceCode) {
    if (this._workspace.hasResourceContentTrackingExtensions())
      return false;
    if (uiSourceCode.project().canSetFileContent())
      return false;
    if (uiSourceCode[Persistence.Persistence._binding])
      return false;
    return !!uiSourceCode.hasCommits();
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {?Persistence.PersistenceBinding}
   */
  binding(uiSourceCode) {
    return uiSourceCode[Persistence.Persistence._binding] || null;
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {function()} listener
   */
  subscribeForBindingEvent(uiSourceCode, listener) {
    this._subscribedBindingEventListeners.set(uiSourceCode, listener);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @param {function()} listener
   */
  unsubscribeFromBindingEvent(uiSourceCode, listener) {
    this._subscribedBindingEventListeners.delete(uiSourceCode, listener);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   */
  _notifyBindingEvent(uiSourceCode) {
    if (!this._subscribedBindingEventListeners.has(uiSourceCode))
      return;
    const listeners = Array.from(this._subscribedBindingEventListeners.get(uiSourceCode));
    for (const listener of listeners)
      listener.call(null);
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {?Workspace.UISourceCode}
   */
  fileSystem(uiSourceCode) {
    const binding = this.binding(uiSourceCode);
    return binding ? binding.fileSystem : null;
  }

  /**
   * @param {!Workspace.UISourceCode} uiSourceCode
   * @return {?Workspace.UISourceCode}
   */
  network(uiSourceCode) {
    const binding = this.binding(uiSourceCode);
    return binding ? binding.network : null;
  }

  /**
   * @param {string} filePath
   */
  _addFilePathBindingPrefixes(filePath) {
    let relative = '';
    for (const token of filePath.split('/')) {
      relative += token + '/';
      const count = this._filePathPrefixesToBindingCount.get(relative) || 0;
      this._filePathPrefixesToBindingCount.set(relative, count + 1);
    }
  }

  /**
   * @param {string} filePath
   */
  _removeFilePathBindingPrefixes(filePath) {
    let relative = '';
    for (const token of filePath.split('/')) {
      relative += token + '/';
      const count = this._filePathPrefixesToBindingCount.get(relative);
      if (count === 1)
        this._filePathPrefixesToBindingCount.delete(relative);
      else
        this._filePathPrefixesToBindingCount.set(relative, count - 1);
    }
  }

  /**
   * @param {string} filePath
   * @return {boolean}
   */
  filePathHasBindings(filePath) {
    if (!filePath.endsWith('/'))
      filePath += '/';
    return this._filePathPrefixesToBindingCount.has(filePath);
  }

  dispose() {
    if (this._mapping) {
      this._mapping.dispose();
      this._mapping = null;
    }
  }
};

Persistence.Persistence._binding = Symbol('Persistence.Binding');
Persistence.Persistence._muteCommit = Symbol('Persistence.MuteCommit');
Persistence.Persistence._muteWorkingCopy = Symbol('Persistence.MuteWorkingCopy');

Persistence.Persistence._NodePrefix = '(function (exports, require, module, __filename, __dirname) { ';
Persistence.Persistence._NodeSuffix = '\n});';
Persistence.Persistence._NodeShebang = '#!/usr/bin/env node';

Persistence.Persistence.Events = {
  BindingCreated: Symbol('BindingCreated'),
  BindingRemoved: Symbol('BindingRemoved')
};

/**
 * @unrestricted
 */
Persistence.PathEncoder = class {
  constructor() {
    /** @type {!Common.CharacterIdMap<string>} */
    this._encoder = new Common.CharacterIdMap();
  }

  /**
   * @param {string} path
   * @return {string}
   */
  encode(path) {
    return path.split('/').map(token => this._encoder.toChar(token)).join('');
  }

  /**
   * @param {string} path
   * @return {string}
   */
  decode(path) {
    return path.split('').map(token => this._encoder.fromChar(token)).join('/');
  }
};

/**
 * @unrestricted
 */
Persistence.PersistenceBinding = class {
  /**
   * @param {!Workspace.UISourceCode} network
   * @param {!Workspace.UISourceCode} fileSystem
   */
  constructor(network, fileSystem) {
    this.network = network;
    this.fileSystem = fileSystem;
  }
};

/**
 * @interface
 */
Persistence.MappingSystem = function() {};

Persistence.MappingSystem.prototype = {
  dispose: function() {}
};

/** @type {!Persistence.Persistence} */
Persistence.persistence;
