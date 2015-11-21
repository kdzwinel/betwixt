// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

WebInspector.reload = function()
{
    if (WebInspector.dockController.canDock() && WebInspector.dockController.dockSide() === WebInspector.DockController.State.Undocked)
        InspectorFrontendHost.setIsDocked(true, function() {});
    window.location.reload();
}
