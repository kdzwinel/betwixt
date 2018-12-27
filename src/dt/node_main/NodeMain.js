// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Common.Runnable}
 */
NodeMain.NodeMain = class extends Common.Object {
  /**
   * @override
   */
  run() {
    Host.userMetrics.actionTaken(Host.UserMetrics.Action.ConnectToNodeJSFromFrontend);
    SDK.initMainConnection(() => {
      const target = SDK.targetManager.createTarget('main', Common.UIString('Main'), SDK.Target.Type.Browser, null);
      target.setInspectedURL('Node.js');
    }, Components.TargetDetachedDialog.webSocketConnectionLost);
  }
};

/**
 * @implements {Protocol.TargetDispatcher}
 */
NodeMain.NodeChildTargetManager = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} parentTarget
   */
  constructor(parentTarget) {
    super(parentTarget);
    this._targetManager = parentTarget.targetManager();
    this._parentTarget = parentTarget;
    this._targetAgent = parentTarget.targetAgent();
    /** @type {!Map<string, !SDK.Target>} */
    this._childTargets = new Map();

    parentTarget.registerTargetDispatcher(this);
    this._targetAgent.setDiscoverTargets(true);

    InspectorFrontendHost.events.addEventListener(
        InspectorFrontendHostAPI.Events.DevicesDiscoveryConfigChanged, this._devicesDiscoveryConfigChanged, this);
    InspectorFrontendHost.setDevicesUpdatesEnabled(false);
    InspectorFrontendHost.setDevicesUpdatesEnabled(true);
  }

  /**
   * @param {!Common.Event} event
   */
  _devicesDiscoveryConfigChanged(event) {
    const config = /** @type {!Adb.Config} */ (event.data);
    const locations = [];
    for (const address of config.networkDiscoveryConfig) {
      const parts = address.split(':');
      const port = parseInt(parts[1], 10);
      if (parts[0] && port)
        locations.push({host: parts[0], port: port});
    }
    this._targetAgent.setRemoteLocations(locations);
  }

  /**
   * @override
   */
  dispose() {
    InspectorFrontendHost.events.removeEventListener(
        InspectorFrontendHostAPI.Events.DevicesDiscoveryConfigChanged, this._devicesDiscoveryConfigChanged, this);

    for (const sessionId of this._childTargets.keys())
      this.detachedFromTarget(sessionId, undefined);
  }

  /**
   * @override
   * @param {!Protocol.Target.TargetInfo} targetInfo
   */
  targetCreated(targetInfo) {
    if (targetInfo.type === 'node' && !targetInfo.attached)
      this._targetAgent.attachToTarget(targetInfo.targetId, true /* flatten */);
  }

  /**
   * @override
   * @param {!Protocol.Target.TargetInfo} targetInfo
   */
  targetInfoChanged(targetInfo) {
  }

  /**
   * @override
   * @param {string} targetId
   */
  targetDestroyed(targetId) {
  }

  /**
   * @override
   * @param {string} sessionId
   * @param {!Protocol.Target.TargetInfo} targetInfo
   * @param {boolean} waitingForDebugger
   */
  attachedToTarget(sessionId, targetInfo, waitingForDebugger) {
    const name = ls`Node.js: ${targetInfo.url}`;
    const target = this._targetManager.createTarget(
        targetInfo.targetId, name, SDK.Target.Type.Node, this._parentTarget, sessionId);
    this._childTargets.set(sessionId, target);
    target.runtimeAgent().runIfWaitingForDebugger();
  }

  /**
   * @override
   * @param {string} sessionId
   * @param {string=} childTargetId
   */
  detachedFromTarget(sessionId, childTargetId) {
    this._childTargets.get(sessionId).dispose('target terminated');
    this._childTargets.delete(sessionId);
  }

  /**
   * @override
   * @param {string} sessionId
   * @param {string} message
   * @param {string=} childTargetId
   */
  receivedMessageFromTarget(sessionId, message, childTargetId) {
    // We use flatten protocol.
  }
};

SDK.SDKModel.register(NodeMain.NodeChildTargetManager, SDK.Target.Capability.Target, true);
