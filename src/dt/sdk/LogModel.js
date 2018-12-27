// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Protocol.LogDispatcher}
 */
SDK.LogModel = class extends SDK.SDKModel {
  /**
   * @param {!SDK.Target} target
   */
  constructor(target) {
    super(target);
    target.registerLogDispatcher(this);
    this._logAgent = target.logAgent();
    this._logAgent.enable();
    if (!Host.isUnderTest()) {
      this._logAgent.startViolationsReport([
        {name: 'longTask', threshold: 200}, {name: 'longLayout', threshold: 30}, {name: 'blockedEvent', threshold: 100},
        {name: 'blockedParser', threshold: -1}, {name: 'handler', threshold: 150},
        {name: 'recurringHandler', threshold: 50}, {name: 'discouragedAPIUse', threshold: -1}
      ]);
    }
  }

  /**
   * @override
   * @param {!Protocol.Log.LogEntry} payload
   */
  entryAdded(payload) {
    this.dispatchEventToListeners(SDK.LogModel.Events.EntryAdded, {logModel: this, entry: payload});
  }

  requestClear() {
    this._logAgent.clear();
  }
};

SDK.SDKModel.register(SDK.LogModel, SDK.Target.Capability.Log, true);

/** @enum {symbol} */
SDK.LogModel.Events = {
  EntryAdded: Symbol('EntryAdded')
};
