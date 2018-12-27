// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Common.Runnable}
 */
WorkerMain.WorkerMain = class extends Common.Object {
  /**
   * @override
   */
  run() {
    SDK.initMainConnection(() => {
      SDK.targetManager.createTarget('main', ls`Main`, SDK.Target.Type.ServiceWorker, null);
    }, Components.TargetDetachedDialog.webSocketConnectionLost);
    new MobileThrottling.NetworkPanelIndicator();
  }
};

SDK.ChildTargetManager.install(async ({target, waitingForDebugger}) => {
  // Only pause the new worker if debugging SW - we are going through the pause on start checkbox.
  if (target.parentTarget().type() !== SDK.Target.Type.ServiceWorker || !waitingForDebugger)
    return;
  const debuggerModel = target.model(SDK.DebuggerModel);
  if (!debuggerModel)
    return;
  if (!debuggerModel.isReadyToPause())
    await debuggerModel.once(SDK.DebuggerModel.Events.DebuggerIsReadyToPause);
  debuggerModel.pause();
});
