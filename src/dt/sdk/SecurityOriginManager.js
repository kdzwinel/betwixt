// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
SDK.SecurityOriginManager = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);

    /** @type {!Set<string>} */
    this._securityOrigins = new Set();
    this._mainSecurityOrigin = '';
  }

  /**
   * @param {!Set<string>} securityOrigins
   */
  updateSecurityOrigins(securityOrigins) {
    const oldOrigins = this._securityOrigins;
    this._securityOrigins = securityOrigins;

    for (const origin of oldOrigins) {
      if (!this._securityOrigins.has(origin))
        this.dispatchEventToListeners(SDK.SecurityOriginManager.Events.SecurityOriginRemoved, origin);
    }

    for (const origin of this._securityOrigins) {
      if (!oldOrigins.has(origin))
        this.dispatchEventToListeners(SDK.SecurityOriginManager.Events.SecurityOriginAdded, origin);
    }
  }

  /**
   * @return {!Array<string>}
   */
  securityOrigins() {
    return this._securityOrigins.valuesArray();
  }

  /**
   * @return {string}
   */
  mainSecurityOrigin() {
    return this._mainSecurityOrigin;
  }

  /**
   * @param {string} securityOrigin
   */
  setMainSecurityOrigin(securityOrigin) {
    this._mainSecurityOrigin = securityOrigin;
    this.dispatchEventToListeners(SDK.SecurityOriginManager.Events.MainSecurityOriginChanged, securityOrigin);
  }
};

SDK.SDKModel.register(SDK.SecurityOriginManager, SDK.Target.Capability.None, false);

/** @enum {symbol} */
SDK.SecurityOriginManager.Events = {
  SecurityOriginAdded: Symbol('SecurityOriginAdded'),
  SecurityOriginRemoved: Symbol('SecurityOriginRemoved'),
  MainSecurityOriginChanged: Symbol('MainSecurityOriginChanged')
};
