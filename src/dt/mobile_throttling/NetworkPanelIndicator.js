// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

MobileThrottling.NetworkPanelIndicator = class {
  constructor() {
    // TODO: we should not access network from other modules.
    if (!UI.inspectorView.hasPanel('network'))
      return;
    const manager = SDK.multitargetNetworkManager;
    manager.addEventListener(SDK.MultitargetNetworkManager.Events.ConditionsChanged, updateVisibility);
    manager.addEventListener(SDK.MultitargetNetworkManager.Events.BlockedPatternsChanged, updateVisibility);
    manager.addEventListener(SDK.MultitargetNetworkManager.Events.InterceptorsChanged, updateVisibility);
    updateVisibility();

    function updateVisibility() {
      let icon = null;
      if (manager.isThrottling()) {
        icon = UI.Icon.create('smallicon-warning');
        icon.title = Common.UIString('Network throttling is enabled');
      } else if (SDK.multitargetNetworkManager.isIntercepting()) {
        icon = UI.Icon.create('smallicon-warning');
        icon.title = Common.UIString('Requests may be rewritten by local overrides');
      } else if (manager.isBlocking()) {
        icon = UI.Icon.create('smallicon-warning');
        icon.title = Common.UIString('Requests may be blocked');
      }
      UI.inspectorView.setPanelIcon('network', icon);
    }
  }
};
