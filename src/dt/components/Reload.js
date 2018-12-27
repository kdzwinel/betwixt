// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
Components.reload = function() {
  if (Components.dockController.canDock() &&
      Components.dockController.dockSide() === Components.DockController.State.Undocked)
    InspectorFrontendHost.setIsDocked(true, function() {});
  window.location.reload();
};
