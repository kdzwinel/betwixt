// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Security.SecurityModel = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    this._dispatcher = new Security.SecurityDispatcher(this);
    this._securityAgent = target.securityAgent();
    target.registerSecurityDispatcher(this._dispatcher);
    this._securityAgent.enable();
  }

  /**
   * @return {!SDK.ResourceTreeModel}
   */
  resourceTreeModel() {
    return /** @type {!SDK.ResourceTreeModel} */ (this.target().model(SDK.ResourceTreeModel));
  }

  /**
   * @return {!SDK.NetworkManager}
   */
  networkManager() {
    return /** @type {!SDK.NetworkManager} */ (this.target().model(SDK.NetworkManager));
  }

  /**
   * @param {!Protocol.Security.SecurityState} a
   * @param {!Protocol.Security.SecurityState} b
   * @return {number}
   */
  static SecurityStateComparator(a, b) {
    let securityStateMap;
    if (Security.SecurityModel._symbolicToNumericSecurityState) {
      securityStateMap = Security.SecurityModel._symbolicToNumericSecurityState;
    } else {
      securityStateMap = new Map();
      const ordering = [
        Protocol.Security.SecurityState.Info, Protocol.Security.SecurityState.Insecure,
        Protocol.Security.SecurityState.Neutral, Protocol.Security.SecurityState.Secure,
        // Unknown is max so that failed/cancelled requests don't overwrite the origin security state for successful requests,
        // and so that failed/cancelled requests appear at the bottom of the origins list.
        Protocol.Security.SecurityState.Unknown
      ];
      for (let i = 0; i < ordering.length; i++)
        securityStateMap.set(ordering[i], i + 1);
      Security.SecurityModel._symbolicToNumericSecurityState = securityStateMap;
    }
    const aScore = securityStateMap.get(a) || 0;
    const bScore = securityStateMap.get(b) || 0;

    return aScore - bScore;
  }
};

SDK.SDKModel.register(Security.SecurityModel, SDK.Target.Capability.Security, false);

/** @enum {symbol} */
Security.SecurityModel.Events = {
  SecurityStateChanged: Symbol('SecurityStateChanged')
};


/**
 * @unrestricted
 */
Security.PageSecurityState = class {
  /**
   * @param {!Protocol.Security.SecurityState} securityState
   * @param {boolean} schemeIsCryptographic
   * @param {!Array<!Protocol.Security.SecurityStateExplanation>} explanations
   * @param {?Protocol.Security.InsecureContentStatus} insecureContentStatus
   * @param {?string} summary
   */
  constructor(securityState, schemeIsCryptographic, explanations, insecureContentStatus, summary) {
    this.securityState = securityState;
    this.schemeIsCryptographic = schemeIsCryptographic;
    this.explanations = explanations;
    this.insecureContentStatus = insecureContentStatus;
    this.summary = summary;
  }
};

/**
 * @implements {Protocol.SecurityDispatcher}
 * @unrestricted
 */
Security.SecurityDispatcher = class {
  constructor(model) {
    this._model = model;
  }

  /**
   * @override
   * @param {!Protocol.Security.SecurityState} securityState
   * @param {boolean} schemeIsCryptographic
   * @param {!Array<!Protocol.Security.SecurityStateExplanation>} explanations
   * @param {!Protocol.Security.InsecureContentStatus} insecureContentStatus
   * @param {?string=} summary
   */
  securityStateChanged(securityState, schemeIsCryptographic, explanations, insecureContentStatus, summary) {
    const pageSecurityState = new Security.PageSecurityState(
        securityState, schemeIsCryptographic, explanations, insecureContentStatus, summary || null);
    this._model.dispatchEventToListeners(Security.SecurityModel.Events.SecurityStateChanged, pageSecurityState);
  }


  /**
   * @override
   * @param {number} eventId
   * @param {string} errorType
   * @param {string} requestURL
   */
  certificateError(eventId, errorType, requestURL) {
  }
};
