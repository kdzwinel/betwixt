/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @unrestricted
 */
SDK.Target = class extends Protocol.TargetBase {
  /**
   * @param {!SDK.TargetManager} targetManager
   * @param {string} id
   * @param {string} name
   * @param {!SDK.Target.Type} type
   * @param {?SDK.Target} parentTarget
   * @param {string} sessionId
   * @param {boolean} suspended
   */
  constructor(targetManager, id, name, type, parentTarget, sessionId, suspended) {
    const needsNodeJSPatching = type === SDK.Target.Type.Node;
    super(needsNodeJSPatching, parentTarget, sessionId);
    this._targetManager = targetManager;
    this._name = name;
    this._inspectedURL = '';
    this._capabilitiesMask = 0;
    switch (type) {
      case SDK.Target.Type.Frame:
        this._capabilitiesMask = SDK.Target.Capability.Browser | SDK.Target.Capability.DOM | SDK.Target.Capability.JS |
            SDK.Target.Capability.Log | SDK.Target.Capability.Network | SDK.Target.Capability.Target |
            SDK.Target.Capability.Tracing | SDK.Target.Capability.Emulation | SDK.Target.Capability.Input;
        if (!parentTarget) {
          this._capabilitiesMask |= SDK.Target.Capability.DeviceEmulation | SDK.Target.Capability.ScreenCapture |
              SDK.Target.Capability.Security | SDK.Target.Capability.Inspector;
        }
        break;
      case SDK.Target.Type.ServiceWorker:
        this._capabilitiesMask =
            SDK.Target.Capability.Log | SDK.Target.Capability.Network | SDK.Target.Capability.Target;
        if (!parentTarget)
          this._capabilitiesMask |= SDK.Target.Capability.Browser | SDK.Target.Capability.Inspector;
        break;
      case SDK.Target.Type.Worker:
        this._capabilitiesMask = SDK.Target.Capability.JS | SDK.Target.Capability.Log | SDK.Target.Capability.Network |
            SDK.Target.Capability.Target;
        break;
      case SDK.Target.Type.Node:
        this._capabilitiesMask = SDK.Target.Capability.JS;
        break;
      case SDK.Target.Type.Browser:
        this._capabilitiesMask = SDK.Target.Capability.Target;
        break;
    }
    this._type = type;
    this._parentTarget = parentTarget;
    this._id = id;
    this._modelByConstructor = new Map();
    this._isSuspended = suspended;
  }

  createModels(required) {
    this._creatingModels = true;
    // TODO(dgozman): fix this in bindings layer.
    this.model(SDK.ResourceTreeModel);
    const registered = Array.from(SDK.SDKModel._registeredModels.keys());
    for (const modelClass of registered) {
      const info = SDK.SDKModel._registeredModels.get(modelClass);
      if (info.autostart || required.has(modelClass))
        this.model(modelClass);
    }
    this._creatingModels = false;
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
  name() {
    return this._name || this._inspectedURLName;
  }

  /**
   * @return {!SDK.Target.Type}
   */
  type() {
    return this._type;
  }

  /**
   * @override
   */
  markAsNodeJSForTest() {
    super.markAsNodeJSForTest();
    this._type = SDK.Target.Type.Node;
  }

  /**
   * @return {!SDK.TargetManager}
   */
  targetManager() {
    return this._targetManager;
  }

  /**
   * @param {number} capabilitiesMask
   * @return {boolean}
   */
  hasAllCapabilities(capabilitiesMask) {
    // TODO(dgozman): get rid of this method, once we never observe targets with
    // capability mask.
    return (this._capabilitiesMask & capabilitiesMask) === capabilitiesMask;
  }

  /**
   * @param {string} label
   * @return {string}
   */
  decorateLabel(label) {
    return (this._type === SDK.Target.Type.Worker || this._type === SDK.Target.Type.ServiceWorker) ? '\u2699 ' + label :
                                                                                                     label;
  }

  /**
   * @return {?SDK.Target}
   */
  parentTarget() {
    return this._parentTarget;
  }

  /**
   * @override
   * @param {string} reason
   */
  dispose(reason) {
    super.dispose(reason);
    this._targetManager.removeTarget(this);
    for (const model of this._modelByConstructor.valuesArray())
      model.dispose();
  }

  /**
   * @param {function(new:T, !SDK.Target)} modelClass
   * @return {?T}
   * @template T
   */
  model(modelClass) {
    if (!this._modelByConstructor.get(modelClass)) {
      const info = SDK.SDKModel._registeredModels.get(modelClass);
      if (info === undefined)
        throw 'Model class is not registered @' + new Error().stack;
      if ((this._capabilitiesMask & info.capabilities) === info.capabilities) {
        const model = new modelClass(this);
        this._modelByConstructor.set(modelClass, model);
        if (!this._creatingModels)
          this._targetManager.modelAdded(this, modelClass, model);
      }
    }
    return this._modelByConstructor.get(modelClass) || null;
  }

  /**
   * @return {!Map<function(new:SDK.SDKModel, !SDK.Target), !SDK.SDKModel>}
   */
  models() {
    return this._modelByConstructor;
  }

  /**
   * @return {string}
   */
  inspectedURL() {
    return this._inspectedURL;
  }

  /**
   * @param {string} inspectedURL
   */
  setInspectedURL(inspectedURL) {
    this._inspectedURL = inspectedURL;
    const parsedURL = inspectedURL.asParsedURL();
    this._inspectedURLName = parsedURL ? parsedURL.lastPathComponentWithFragment() : '#' + this._id;
    if (!this.parentTarget())
      InspectorFrontendHost.inspectedURLChanged(inspectedURL || '');
    this._targetManager.dispatchEventToListeners(SDK.TargetManager.Events.InspectedURLChanged, this);
    if (!this._name)
      this._targetManager.dispatchEventToListeners(SDK.TargetManager.Events.NameChanged, this);
  }

  /**
   * @return {!Promise}
   */
  suspend() {
    if (this._isSuspended)
      return Promise.resolve();
    this._isSuspended = true;

    const promises = [];
    for (const model of this.models().values())
      promises.push(model.suspendModel());
    return Promise.all(promises);
  }

  /**
   * @return {!Promise}
   */
  resume() {
    if (!this._isSuspended)
      return Promise.resolve();
    this._isSuspended = false;

    const promises = [];
    for (const model of this.models().values())
      promises.push(model.resumeModel());
    return Promise.all(promises);
  }

  /**
   * @return {boolean}
   */
  suspended() {
    return this._isSuspended;
  }
};

/**
 * @enum {number}
 */
SDK.Target.Capability = {
  Browser: 1 << 0,
  DOM: 1 << 1,
  JS: 1 << 2,
  Log: 1 << 3,
  Network: 1 << 4,
  Target: 1 << 5,
  ScreenCapture: 1 << 6,
  Tracing: 1 << 7,
  Emulation: 1 << 8,
  Security: 1 << 9,
  Input: 1 << 10,
  Inspector: 1 << 11,
  DeviceEmulation: 1 << 12,

  None: 0,
};

/**
 * @enum {string}
 */
SDK.Target.Type = {
  Frame: 'frame',
  ServiceWorker: 'service-worker',
  Worker: 'worker',
  Node: 'node',
  Browser: 'browser',
};

/**
 * @unrestricted
 */
SDK.SDKModel = class extends Common.Object {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super();
    this._target = target;
  }

  /**
   * @return {!SDK.Target}
   */
  target() {
    return this._target;
  }

  /**
   * @return {!Promise}
   */
  suspendModel() {
    return Promise.resolve();
  }

  /**
   * @return {!Promise}
   */
  resumeModel() {
    return Promise.resolve();
  }

  dispose() {
  }
};


/**
 * @param {function(new:SDK.SDKModel, !SDK.Target)} modelClass
 * @param {number} capabilities
 * @param {boolean} autostart
 */
SDK.SDKModel.register = function(modelClass, capabilities, autostart) {
  if (!SDK.SDKModel._registeredModels)
    SDK.SDKModel._registeredModels = new Map();
  SDK.SDKModel._registeredModels.set(modelClass, {capabilities: capabilities, autostart: autostart});
};

/** @type {!Map<function(new:SDK.SDKModel, !SDK.Target), !{capabilities: number, autostart: boolean}>} */
SDK.SDKModel._registeredModels;
