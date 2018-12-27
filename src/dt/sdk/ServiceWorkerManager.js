/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
SDK.ServiceWorkerManager = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    target.registerServiceWorkerDispatcher(new SDK.ServiceWorkerDispatcher(this));
    this._lastAnonymousTargetId = 0;
    this._agent = target.serviceWorkerAgent();
    /** @type {!Map.<string, !SDK.ServiceWorkerRegistration>} */
    this._registrations = new Map();
    this.enable();
    this._forceUpdateSetting = Common.settings.createSetting('serviceWorkerUpdateOnReload', false);
    if (this._forceUpdateSetting.get())
      this._forceUpdateSettingChanged();
    this._forceUpdateSetting.addChangeListener(this._forceUpdateSettingChanged, this);
    new SDK.ServiceWorkerContextNamer(target, this);
  }

  enable() {
    if (this._enabled)
      return;
    this._enabled = true;
    this._agent.enable();
  }

  disable() {
    if (!this._enabled)
      return;
    this._enabled = false;
    this._registrations.clear();
    this._agent.disable();
  }

  /**
   * @return {!Map.<string, !SDK.ServiceWorkerRegistration>}
   */
  registrations() {
    return this._registrations;
  }

  /**
   * @param {!Array<string>} urls
   * @return {boolean}
   */
  hasRegistrationForURLs(urls) {
    for (const registration of this._registrations.values()) {
      if (urls.filter(url => url && url.startsWith(registration.scopeURL)).length === urls.length)
        return true;
    }
    return false;
  }

  /**
   * @param {string} versionId
   * @return {?SDK.ServiceWorkerVersion}
   */
  findVersion(versionId) {
    for (const registration of this.registrations().values()) {
      const version = registration.versions.get(versionId);
      if (version)
        return version;
    }
    return null;
  }

  /**
   * @param {string} registrationId
   */
  deleteRegistration(registrationId) {
    const registration = this._registrations.get(registrationId);
    if (!registration)
      return;
    if (registration._isRedundant()) {
      this._registrations.delete(registrationId);
      this.dispatchEventToListeners(SDK.ServiceWorkerManager.Events.RegistrationDeleted, registration);
      return;
    }
    registration._deleting = true;
    for (const version of registration.versions.values())
      this.stopWorker(version.id);
    this._unregister(registration.scopeURL);
  }

  /**
   * @param {string} registrationId
   */
  updateRegistration(registrationId) {
    const registration = this._registrations.get(registrationId);
    if (!registration)
      return;
    this._agent.updateRegistration(registration.scopeURL);
  }

  /**
   * @param {string} registrationId
   * @param {string} data
   */
  deliverPushMessage(registrationId, data) {
    const registration = this._registrations.get(registrationId);
    if (!registration)
      return;
    const origin = Common.ParsedURL.extractOrigin(registration.scopeURL);
    this._agent.deliverPushMessage(origin, registrationId, data);
  }

  /**
   * @param {string} registrationId
   * @param {string} tag
   * @param {boolean} lastChance
   */
  dispatchSyncEvent(registrationId, tag, lastChance) {
    const registration = this._registrations.get(registrationId);
    if (!registration)
      return;
    const origin = Common.ParsedURL.extractOrigin(registration.scopeURL);
    this._agent.dispatchSyncEvent(origin, registrationId, tag, lastChance);
  }

  /**
   * @param {string} scope
   */
  _unregister(scope) {
    this._agent.unregister(scope);
  }

  /**
   * @param {string} scope
   */
  startWorker(scope) {
    this._agent.startWorker(scope);
  }

  /**
   * @param {string} scope
   */
  skipWaiting(scope) {
    this._agent.skipWaiting(scope);
  }

  /**
   * @param {string} versionId
   */
  stopWorker(versionId) {
    this._agent.stopWorker(versionId);
  }

  /**
   * @param {string} versionId
   */
  inspectWorker(versionId) {
    this._agent.inspectWorker(versionId);
  }

  /**
   * @param {!Array.<!Protocol.ServiceWorker.ServiceWorkerRegistration>} registrations
   */
  _workerRegistrationUpdated(registrations) {
    for (const payload of registrations) {
      let registration = this._registrations.get(payload.registrationId);
      if (!registration) {
        registration = new SDK.ServiceWorkerRegistration(payload);
        this._registrations.set(payload.registrationId, registration);
        this.dispatchEventToListeners(SDK.ServiceWorkerManager.Events.RegistrationUpdated, registration);
        continue;
      }
      registration._update(payload);

      if (registration._shouldBeRemoved()) {
        this._registrations.delete(registration.id);
        this.dispatchEventToListeners(SDK.ServiceWorkerManager.Events.RegistrationDeleted, registration);
      } else {
        this.dispatchEventToListeners(SDK.ServiceWorkerManager.Events.RegistrationUpdated, registration);
      }
    }
  }

  /**
   * @param {!Array.<!Protocol.ServiceWorker.ServiceWorkerVersion>} versions
   */
  _workerVersionUpdated(versions) {
    /** @type {!Set.<!SDK.ServiceWorkerRegistration>} */
    const registrations = new Set();
    for (const payload of versions) {
      const registration = this._registrations.get(payload.registrationId);
      if (!registration)
        continue;
      registration._updateVersion(payload);
      registrations.add(registration);
    }
    for (const registration of registrations) {
      if (registration._shouldBeRemoved()) {
        this._registrations.delete(registration.id);
        this.dispatchEventToListeners(SDK.ServiceWorkerManager.Events.RegistrationDeleted, registration);
      } else {
        this.dispatchEventToListeners(SDK.ServiceWorkerManager.Events.RegistrationUpdated, registration);
      }
    }
  }

  /**
   * @param {!Protocol.ServiceWorker.ServiceWorkerErrorMessage} payload
   */
  _workerErrorReported(payload) {
    const registration = this._registrations.get(payload.registrationId);
    if (!registration)
      return;
    registration.errors.push(payload);
    this.dispatchEventToListeners(
        SDK.ServiceWorkerManager.Events.RegistrationErrorAdded, {registration: registration, error: payload});
  }

  /**
   * @return {!Common.Setting}
   */
  forceUpdateOnReloadSetting() {
    return this._forceUpdateSetting;
  }

  _forceUpdateSettingChanged() {
    this._agent.setForceUpdateOnPageLoad(this._forceUpdateSetting.get());
  }
};

SDK.SDKModel.register(SDK.ServiceWorkerManager, SDK.Target.Capability.Target | SDK.Target.Capability.Browser, true);

/** @enum {symbol} */
SDK.ServiceWorkerManager.Events = {
  RegistrationUpdated: Symbol('RegistrationUpdated'),
  RegistrationErrorAdded: Symbol('RegistrationErrorAdded'),
  RegistrationDeleted: Symbol('RegistrationDeleted')
};

/**
 * @implements {Protocol.ServiceWorkerDispatcher}
 * @unrestricted
 */
SDK.ServiceWorkerDispatcher = class {
  /**
   * @param {!SDK.ServiceWorkerManager} manager
   */
  constructor(manager) {
    this._manager = manager;
  }

  /**
   * @override
   * @param {!Array.<!Protocol.ServiceWorker.ServiceWorkerRegistration>} registrations
   */
  workerRegistrationUpdated(registrations) {
    this._manager._workerRegistrationUpdated(registrations);
  }

  /**
   * @override
   * @param {!Array.<!Protocol.ServiceWorker.ServiceWorkerVersion>} versions
   */
  workerVersionUpdated(versions) {
    this._manager._workerVersionUpdated(versions);
  }

  /**
   * @override
   * @param {!Protocol.ServiceWorker.ServiceWorkerErrorMessage} errorMessage
   */
  workerErrorReported(errorMessage) {
    this._manager._workerErrorReported(errorMessage);
  }
};

/**
 * @unrestricted
 */
SDK.ServiceWorkerVersion = class {
  /**
   * @param {!SDK.ServiceWorkerRegistration} registration
   * @param {!Protocol.ServiceWorker.ServiceWorkerVersion} payload
   */
  constructor(registration, payload) {
    this.registration = registration;
    this._update(payload);
  }

  /**
   * @param {!Protocol.ServiceWorker.ServiceWorkerVersion} payload
   */
  _update(payload) {
    this.id = payload.versionId;
    this.scriptURL = payload.scriptURL;
    const parsedURL = new Common.ParsedURL(payload.scriptURL);
    this.securityOrigin = parsedURL.securityOrigin();
    this.runningStatus = payload.runningStatus;
    this.status = payload.status;
    this.scriptLastModified = payload.scriptLastModified;
    this.scriptResponseTime = payload.scriptResponseTime;
    this.controlledClients = [];
    for (let i = 0; i < payload.controlledClients.length; ++i)
      this.controlledClients.push(payload.controlledClients[i]);
    this.targetId = payload.targetId || null;
  }

  /**
   * @return {boolean}
   */
  isStartable() {
    return !this.registration.isDeleted && this.isActivated() && this.isStopped();
  }

  /**
   * @return {boolean}
   */
  isStoppedAndRedundant() {
    return this.runningStatus === Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Stopped &&
        this.status === Protocol.ServiceWorker.ServiceWorkerVersionStatus.Redundant;
  }

  /**
   * @return {boolean}
   */
  isStopped() {
    return this.runningStatus === Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Stopped;
  }

  /**
   * @return {boolean}
   */
  isStarting() {
    return this.runningStatus === Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Starting;
  }

  /**
   * @return {boolean}
   */
  isRunning() {
    return this.runningStatus === Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Running;
  }

  /**
   * @return {boolean}
   */
  isStopping() {
    return this.runningStatus === Protocol.ServiceWorker.ServiceWorkerVersionRunningStatus.Stopping;
  }

  /**
   * @return {boolean}
   */
  isNew() {
    return this.status === Protocol.ServiceWorker.ServiceWorkerVersionStatus.New;
  }

  /**
   * @return {boolean}
   */
  isInstalling() {
    return this.status === Protocol.ServiceWorker.ServiceWorkerVersionStatus.Installing;
  }

  /**
   * @return {boolean}
   */
  isInstalled() {
    return this.status === Protocol.ServiceWorker.ServiceWorkerVersionStatus.Installed;
  }

  /**
   * @return {boolean}
   */
  isActivating() {
    return this.status === Protocol.ServiceWorker.ServiceWorkerVersionStatus.Activating;
  }

  /**
   * @return {boolean}
   */
  isActivated() {
    return this.status === Protocol.ServiceWorker.ServiceWorkerVersionStatus.Activated;
  }

  /**
   * @return {boolean}
   */
  isRedundant() {
    return this.status === Protocol.ServiceWorker.ServiceWorkerVersionStatus.Redundant;
  }

  /**
   * @return {string}
   */
  mode() {
    if (this.isNew() || this.isInstalling())
      return SDK.ServiceWorkerVersion.Modes.Installing;
    else if (this.isInstalled())
      return SDK.ServiceWorkerVersion.Modes.Waiting;
    else if (this.isActivating() || this.isActivated())
      return SDK.ServiceWorkerVersion.Modes.Active;
    return SDK.ServiceWorkerVersion.Modes.Redundant;
  }
};

/**
 * @enum {string}
 */
SDK.ServiceWorkerVersion.Modes = {
  Installing: 'installing',
  Waiting: 'waiting',
  Active: 'active',
  Redundant: 'redundant'
};

/**
 * @unrestricted
 */
SDK.ServiceWorkerRegistration = class {
  /**
   * @param {!Protocol.ServiceWorker.ServiceWorkerRegistration} payload
   */
  constructor(payload) {
    this._update(payload);
    /** @type {!Map.<string, !SDK.ServiceWorkerVersion>} */
    this.versions = new Map();
    this._deleting = false;
    /** @type {!Array<!Protocol.ServiceWorker.ServiceWorkerErrorMessage>} */
    this.errors = [];
  }

  /**
   * @param {!Protocol.ServiceWorker.ServiceWorkerRegistration} payload
   */
  _update(payload) {
    this._fingerprint = Symbol('fingerprint');
    this.id = payload.registrationId;
    this.scopeURL = payload.scopeURL;
    const parsedURL = new Common.ParsedURL(payload.scopeURL);
    this.securityOrigin = parsedURL.securityOrigin();
    this.isDeleted = payload.isDeleted;
    this.forceUpdateOnPageLoad = payload.forceUpdateOnPageLoad;
  }

  /**
   * @return {symbol}
   */
  fingerprint() {
    return this._fingerprint;
  }

  /**
   * @return {!Map<string, !SDK.ServiceWorkerVersion>}
   */
  versionsByMode() {
    /** @type {!Map<string, !SDK.ServiceWorkerVersion>} */
    const result = new Map();
    for (const version of this.versions.values())
      result.set(version.mode(), version);
    return result;
  }

  /**
   * @param {!Protocol.ServiceWorker.ServiceWorkerVersion} payload
   * @return {!SDK.ServiceWorkerVersion}
   */
  _updateVersion(payload) {
    this._fingerprint = Symbol('fingerprint');
    let version = this.versions.get(payload.versionId);
    if (!version) {
      version = new SDK.ServiceWorkerVersion(this, payload);
      this.versions.set(payload.versionId, version);
      return version;
    }
    version._update(payload);
    return version;
  }

  /**
   * @return {boolean}
   */
  _isRedundant() {
    for (const version of this.versions.values()) {
      if (!version.isStoppedAndRedundant())
        return false;
    }
    return true;
  }

  /**
   * @return {boolean}
   */
  _shouldBeRemoved() {
    return this._isRedundant() && (!this.errors.length || this._deleting);
  }

  /**
   * @return {boolean}
   */
  canBeRemoved() {
    return this.isDeleted || this._deleting;
  }


  clearErrors() {
    this._fingerprint = Symbol('fingerprint');
    this.errors = [];
  }
};

/**
 * @unrestricted
 */
SDK.ServiceWorkerContextNamer = class {
  /**
   * @param {!SDK.Target} target
   * @param {!SDK.ServiceWorkerManager} serviceWorkerManager
   */
  constructor(target, serviceWorkerManager) {
    this._target = target;
    this._serviceWorkerManager = serviceWorkerManager;
    /** @type {!Map<string, !SDK.ServiceWorkerVersion>} */
    this._versionByTargetId = new Map();
    serviceWorkerManager.addEventListener(
        SDK.ServiceWorkerManager.Events.RegistrationUpdated, this._registrationsUpdated, this);
    serviceWorkerManager.addEventListener(
        SDK.ServiceWorkerManager.Events.RegistrationDeleted, this._registrationsUpdated, this);
    SDK.targetManager.addModelListener(
        SDK.RuntimeModel, SDK.RuntimeModel.Events.ExecutionContextCreated, this._executionContextCreated, this);
  }

  /**
   * @param {!Common.Event} event
   */
  _registrationsUpdated(event) {
    this._versionByTargetId.clear();
    const registrations = this._serviceWorkerManager.registrations().valuesArray();
    for (const registration of registrations) {
      const versions = registration.versions.valuesArray();
      for (const version of versions) {
        if (version.targetId)
          this._versionByTargetId.set(version.targetId, version);
      }
    }
    this._updateAllContextLabels();
  }

  /**
   * @param {!Common.Event} event
   */
  _executionContextCreated(event) {
    const executionContext = /** @type {!SDK.ExecutionContext} */ (event.data);
    const serviceWorkerTargetId = this._serviceWorkerTargetIdForWorker(executionContext.target());
    if (!serviceWorkerTargetId)
      return;
    this._updateContextLabel(executionContext, this._versionByTargetId.get(serviceWorkerTargetId) || null);
  }

  /**
   * @param {!SDK.Target} target
   * @return {?string}
   */
  _serviceWorkerTargetIdForWorker(target) {
    const parent = target.parentTarget();
    if (!parent || parent.parentTarget() !== this._target)
      return null;
    return parent.type() === SDK.Target.Type.ServiceWorker ? parent.id() : null;
  }

  _updateAllContextLabels() {
    for (const target of SDK.targetManager.targets()) {
      const serviceWorkerTargetId = this._serviceWorkerTargetIdForWorker(target);
      if (!serviceWorkerTargetId)
        continue;
      const version = this._versionByTargetId.get(serviceWorkerTargetId) || null;
      const runtimeModel = target.model(SDK.RuntimeModel);
      const executionContexts = runtimeModel ? runtimeModel.executionContexts() : [];
      for (const context of executionContexts)
        this._updateContextLabel(context, version);
    }
  }

  /**
   * @param {!SDK.ExecutionContext} context
   * @param {?SDK.ServiceWorkerVersion} version
   */
  _updateContextLabel(context, version) {
    if (!version) {
      context.setLabel('');
      return;
    }
    const parsedUrl = context.origin.asParsedURL();
    const label = parsedUrl ? parsedUrl.lastPathComponentWithFragment() : context.name;
    context.setLabel(label + ' #' + version.id + ' (' + version.status + ')');
  }
};
