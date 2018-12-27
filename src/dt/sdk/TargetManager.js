/*
 * Copyright 2014 The Chromium Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

SDK.TargetManager = class extends Common.Object {
  constructor() {
    super();
    /** @type {!Array.<!SDK.Target>} */
    this._targets = [];
    /** @type {!Array.<!SDK.TargetManager.Observer>} */
    this._observers = [];
    /** @type {!Multimap<symbol, !{modelClass: !Function, thisObject: (!Object|undefined), listener: function(!Common.Event)}>} */
    this._modelListeners = new Multimap();
    /** @type {!Multimap<function(new:SDK.SDKModel, !SDK.Target), !SDK.SDKModelObserver>} */
    this._modelObservers = new Multimap();
    this._isSuspended = false;
  }

  /**
   * @return {!Promise}
   */
  suspendAllTargets() {
    if (this._isSuspended)
      return Promise.resolve();
    this._isSuspended = true;
    this.dispatchEventToListeners(SDK.TargetManager.Events.SuspendStateChanged);
    return Promise.all(this._targets.map(target => target.suspend()));
  }

  /**
   * @return {!Promise}
   */
  resumeAllTargets() {
    if (!this._isSuspended)
      return Promise.resolve();
    this._isSuspended = false;
    this.dispatchEventToListeners(SDK.TargetManager.Events.SuspendStateChanged);
    return Promise.all(this._targets.map(target => target.resume()));
  }

  /**
   * @return {boolean}
   */
  allTargetsSuspended() {
    return this._isSuspended;
  }

  /**
   * @param {function(new:T,!SDK.Target)} modelClass
   * @return {!Array<!T>}
   * @template T
   */
  models(modelClass) {
    const result = [];
    for (let i = 0; i < this._targets.length; ++i) {
      const model = this._targets[i].model(modelClass);
      if (model)
        result.push(model);
    }
    return result;
  }

  /**
   * @return {string}
   */
  inspectedURL() {
    return this._targets[0] ? this._targets[0].inspectedURL() : '';
  }

  /**
   * @param {function(new:T,!SDK.Target)} modelClass
   * @param {!SDK.SDKModelObserver<T>} observer
   * @template T
   */
  observeModels(modelClass, observer) {
    const models = this.models(modelClass);
    this._modelObservers.set(modelClass, observer);
    for (const model of models)
      observer.modelAdded(model);
  }

  /**
   * @param {function(new:T,!SDK.Target)} modelClass
   * @param {!SDK.SDKModelObserver<T>} observer
   * @template T
   */
  unobserveModels(modelClass, observer) {
    this._modelObservers.delete(modelClass, observer);
  }

  /**
   * @param {!SDK.Target} target
   * @param {function(new:SDK.SDKModel,!SDK.Target)} modelClass
   * @param {!SDK.SDKModel} model
   */
  modelAdded(target, modelClass, model) {
    for (const observer of this._modelObservers.get(modelClass).valuesArray())
      observer.modelAdded(model);
  }

  /**
   * @param {!SDK.Target} target
   * @param {function(new:SDK.SDKModel,!SDK.Target)} modelClass
   * @param {!SDK.SDKModel} model
   */
  _modelRemoved(target, modelClass, model) {
    for (const observer of this._modelObservers.get(modelClass).valuesArray())
      observer.modelRemoved(model);
  }

  /**
   * @param {!Function} modelClass
   * @param {symbol} eventType
   * @param {function(!Common.Event)} listener
   * @param {!Object=} thisObject
   */
  addModelListener(modelClass, eventType, listener, thisObject) {
    for (let i = 0; i < this._targets.length; ++i) {
      const model = this._targets[i].model(modelClass);
      if (model)
        model.addEventListener(eventType, listener, thisObject);
    }
    this._modelListeners.set(eventType, {modelClass: modelClass, thisObject: thisObject, listener: listener});
  }

  /**
   * @param {!Function} modelClass
   * @param {symbol} eventType
   * @param {function(!Common.Event)} listener
   * @param {!Object=} thisObject
   */
  removeModelListener(modelClass, eventType, listener, thisObject) {
    if (!this._modelListeners.has(eventType))
      return;

    for (let i = 0; i < this._targets.length; ++i) {
      const model = this._targets[i].model(modelClass);
      if (model)
        model.removeEventListener(eventType, listener, thisObject);
    }

    for (const info of this._modelListeners.get(eventType)) {
      if (info.modelClass === modelClass && info.listener === listener && info.thisObject === thisObject)
        this._modelListeners.delete(eventType, info);
    }
  }

  /**
   * @param {!SDK.TargetManager.Observer} targetObserver
   */
  observeTargets(targetObserver) {
    if (this._observers.indexOf(targetObserver) !== -1)
      throw new Error('Observer can only be registered once');
    for (const target of this._targets)
      targetObserver.targetAdded(target);
    this._observers.push(targetObserver);
  }

  /**
   * @param {!SDK.TargetManager.Observer} targetObserver
   */
  unobserveTargets(targetObserver) {
    this._observers.remove(targetObserver);
  }

  /**
   * @param {string} id
   * @param {string} name
   * @param {!SDK.Target.Type} type
   * @param {?SDK.Target} parentTarget
   * @param {string=} sessionId
   * @param {boolean=} waitForDebuggerInPage
   * @return {!SDK.Target}
   */
  createTarget(id, name, type, parentTarget, sessionId, waitForDebuggerInPage) {
    const target = new SDK.Target(this, id, name, type, parentTarget, sessionId || '', this._isSuspended);
    if (waitForDebuggerInPage)
      target.pageAgent().waitForDebugger();
    target.createModels(new Set(this._modelObservers.keysArray()));
    this._targets.push(target);

    const copy = this._observers.slice(0);
    for (const observer of copy)
      observer.targetAdded(target);

    for (const modelClass of target.models().keys())
      this.modelAdded(target, modelClass, target.models().get(modelClass));

    for (const key of this._modelListeners.keysArray()) {
      for (const info of this._modelListeners.get(key)) {
        const model = target.model(info.modelClass);
        if (model)
          model.addEventListener(key, info.listener, info.thisObject);
      }
    }

    return target;
  }

  /**
   * @param {!SDK.Target} target
   */
  removeTarget(target) {
    if (!this._targets.includes(target))
      return;

    this._targets.remove(target);
    for (const modelClass of target.models().keys())
      this._modelRemoved(target, modelClass, target.models().get(modelClass));

    const copy = this._observers.slice(0);
    for (const observer of copy)
      observer.targetRemoved(target);

    for (const key of this._modelListeners.keysArray()) {
      for (const info of this._modelListeners.get(key)) {
        const model = target.model(info.modelClass);
        if (model)
          model.removeEventListener(key, info.listener, info.thisObject);
      }
    }
  }

  /**
   * @return {!Array.<!SDK.Target>}
   */
  targets() {
    return this._targets.slice();
  }

  /**
   * @param {string} id
   * @return {?SDK.Target}
   */
  targetById(id) {
    // TODO(dgozman): add a map id -> target.
    for (let i = 0; i < this._targets.length; ++i) {
      if (this._targets[i].id() === id)
        return this._targets[i];
    }
    return null;
  }

  /**
   * @return {?SDK.Target}
   */
  mainTarget() {
    return this._targets[0] || null;
  }
};

/** @enum {symbol} */
SDK.TargetManager.Events = {
  AvailableTargetsChanged: Symbol('AvailableTargetsChanged'),
  InspectedURLChanged: Symbol('InspectedURLChanged'),
  NameChanged: Symbol('NameChanged'),
  SuspendStateChanged: Symbol('SuspendStateChanged')
};

/**
 * @interface
 */
SDK.TargetManager.Observer = function() {};

SDK.TargetManager.Observer.prototype = {
  /**
   * @param {!SDK.Target} target
   */
  targetAdded(target) {},

  /**
   * @param {!SDK.Target} target
   */
  targetRemoved(target) {},
};

/**
 * @interface
 * @template T
 */
SDK.SDKModelObserver = function() {};

SDK.SDKModelObserver.prototype = {
  /**
   * @param {!T} model
   */
  modelAdded(model) {},

  /**
   * @param {!T} model
   */
  modelRemoved(model) {},
};

/**
 * @type {!SDK.TargetManager}
 */
SDK.targetManager = new SDK.TargetManager();
