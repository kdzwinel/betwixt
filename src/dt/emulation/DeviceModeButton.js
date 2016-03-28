// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @implements {WebInspector.ToolbarItem.Provider}
 */
WebInspector.DeviceModeButtonProvider = function()
{
    var button = WebInspector.ToolbarButton.createActionButton("emulation.toggle-device-mode");
    WebInspector.overridesSupport.addEventListener(WebInspector.OverridesSupport.Events.EmulationStateChanged, emulationEnabledChanged);
    WebInspector.overridesSupport.addEventListener(WebInspector.OverridesSupport.Events.OverridesWarningUpdated, updateWarning);

    emulationEnabledChanged();
    updateWarning();

    function emulationEnabledChanged()
    {
        button.setToggled(WebInspector.overridesSupport.emulationEnabled());
    }

    function updateWarning()
    {
        var message = WebInspector.overridesSupport.warningMessage();
        button.setTitle(message || WebInspector.UIString("Toggle device mode"));
        button.element.classList.toggle("warning", !!message);
    }

    this._button = button;
}

WebInspector.DeviceModeButtonProvider.prototype = {
    /**
     * @override
     * @return {?WebInspector.ToolbarItem}
     */
    item: function()
    {
        return this._button;
    }
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.ToggleDeviceModeActionDelegate = function()
{
}

WebInspector.ToggleDeviceModeActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     * @return {boolean}
     */
    handleAction: function(context, actionId)
    {
        WebInspector.overridesSupport.setEmulationEnabled(!WebInspector.overridesSupport.emulationEnabled());
        return true;
    }
}
