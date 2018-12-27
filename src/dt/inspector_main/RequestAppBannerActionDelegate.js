// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {UI.ActionDelegate}
 * @unrestricted
 */
InspectorMain.RequestAppBannerActionDelegate = class {
  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    const target = SDK.targetManager.mainTarget();
    if (target && target.type() === SDK.Target.Type.Frame) {
      target.pageAgent().requestAppBanner();
      Common.console.show();
    }
    return true;
  }
};
