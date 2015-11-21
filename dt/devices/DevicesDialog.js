// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 */
WebInspector.DevicesDialog = function()
{
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.DevicesDialog.ActionDelegate = function()
{
    /** @type {?WebInspector.DevicesView} */
    this._view = null;
}

WebInspector.DevicesDialog.ActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     * @return {boolean}
     */
    handleAction: function(context, actionId)
    {
        if (actionId === "devices.dialog.show") {
            if (!this._view)
                this._view = new WebInspector.DevicesView();

            var dialog = new WebInspector.Dialog();
            dialog.addCloseButton();
            this._view.show(dialog.element);
            dialog.setMaxSize(new Size(800, 600));
            dialog.show();
            return true;
        }
        return false;
    }
}
