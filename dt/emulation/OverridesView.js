/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.OverridesView = function()
{
    WebInspector.VBox.call(this);
    this.setMinimumSize(0, 30);
    this.registerRequiredCSS("emulation/overrides.css");
    this.element.classList.add("overrides-view");

    this._deviceElement = this._createDeviceElement();

    this._splashScreenElement = this.element.createChild("div", "overrides-splash-screen");
    this._splashScreenElement.appendChild(createTextButton(WebInspector.UIString("Enable emulation"), this._toggleEmulationEnabled.bind(this), "overrides-enable-button"));

    this._unavailableSplashScreenElement = this.element.createChild("div", "overrides-splash-screen");
    this._unavailableSplashScreenElement.createTextChild(WebInspector.UIString("Emulation is not available."));

    WebInspector.overridesSupport.addEventListener(WebInspector.OverridesSupport.Events.OverridesWarningUpdated, this._overridesWarningUpdated, this);
    WebInspector.overridesSupport.addEventListener(WebInspector.OverridesSupport.Events.EmulationStateChanged, this._emulationStateChanged, this);
    this._emulationStateChanged();
}

WebInspector.OverridesView.prototype = {
    _createDeviceElement: function()
    {
        var container = this.element.createChild("div", "overrides-device");

        var disableButtonElement = createTextButton(WebInspector.UIString("Disable emulation"), this._toggleEmulationEnabled.bind(this), "overrides-disable-button");
        disableButtonElement.id = "overrides-disable-button";
        container.appendChild(disableButtonElement);

        var fieldsetElement = container.createChild("fieldset");
        fieldsetElement.id = "metrics-override-section";

        var deviceModelElement = fieldsetElement.createChild("p", "overrides-device-model-section");
        deviceModelElement.createChild("span").textContent = WebInspector.UIString("Device:");

        var rotateButton = createElement("button");
        rotateButton.textContent = " \u21C4 ";
        var deviceSelect = new WebInspector.DeviceSelect(rotateButton, null);
        deviceModelElement.appendChild(deviceSelect.element);

        var deviceModelFieldset = fieldsetElement.createChild("fieldset", "overrides-device-model-settings");
        var emulateResolutionCheckbox = WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Emulate screen resolution"), WebInspector.overridesSupport.settings.emulateResolution, true);
        deviceModelFieldset.appendChild(emulateResolutionCheckbox);
        var resolutionFieldset = WebInspector.SettingsUI.createSettingFieldset(WebInspector.overridesSupport.settings.emulateResolution);
        deviceModelFieldset.appendChild(resolutionFieldset);

        var tableElement = resolutionFieldset.createChild("table");
        var rowElement = tableElement.createChild("tr");
        var cellElement = rowElement.createChild("td");
        cellElement.createTextChild(WebInspector.UIString("Resolution:"));
        cellElement = rowElement.createChild("td");

        var widthOverrideInput = WebInspector.SettingsUI.createSettingInputField("", WebInspector.overridesSupport.settings.deviceWidth, true, 4, "80px", WebInspector.OverridesSupport.deviceSizeValidator, true, true, WebInspector.UIString("\u2013"));
        cellElement.appendChild(widthOverrideInput);
        var heightOverrideInput = WebInspector.SettingsUI.createSettingInputField("", WebInspector.overridesSupport.settings.deviceHeight, true, 4, "80px", WebInspector.OverridesSupport.deviceSizeValidator, true, true, WebInspector.UIString("\u2013"));
        cellElement.appendChild(heightOverrideInput);

        rowElement = tableElement.createChild("tr");
        cellElement = rowElement.createChild("td");
        cellElement.colSpan = 4;

        rowElement = tableElement.createChild("tr");
        rowElement.title = WebInspector.UIString("Ratio between a device's physical pixels and device-independent pixels");
        rowElement.createChild("td").createTextChild(WebInspector.UIString("Device pixel ratio:"));
        rowElement.createChild("td").appendChild(WebInspector.SettingsUI.createSettingInputField("", WebInspector.overridesSupport.settings.deviceScaleFactor, true, 4, "80px", WebInspector.OverridesSupport.deviceScaleFactorValidator, true, true, WebInspector.UIString("\u2013")));

        var mobileCheckbox = WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Emulate mobile"), WebInspector.overridesSupport.settings.emulateMobile, true);
        mobileCheckbox.title = WebInspector.UIString("Enable meta viewport, overlay scrollbars, text autosizing and default 980px body width");
        deviceModelFieldset.appendChild(mobileCheckbox);

        deviceModelFieldset.appendChild(WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Emulate touch screen"), WebInspector.overridesSupport.settings.emulateTouch, true));

        var resetButtonElement = createTextButton(WebInspector.UIString("Reset"), WebInspector.overridesSupport.reset.bind(WebInspector.overridesSupport));
        resetButtonElement.id = "overrides-reset-button";
        deviceModelFieldset.appendChild(resetButtonElement);

        fieldsetElement.appendChild(WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Shrink to fit"), WebInspector.overridesSupport.settings.deviceFitWindow, true));

        var footnote = container.createChild("p", "help-footnote");
        footnote.appendChild(WebInspector.linkifyDocumentationURLAsNode("setup/remote-debugging/remote-debugging", WebInspector.UIString("More information about screen emulation")));

        this._warningFooter = container.createChild("div", "overrides-footer");
        this._overridesWarningUpdated();

        return container;
    },

    _overridesWarningUpdated: function()
    {
        var message = WebInspector.overridesSupport.warningMessage();
        this._warningFooter.classList.toggle("hidden", !message);
        this._warningFooter.textContent = message;
    },

    _toggleEmulationEnabled: function()
    {
        WebInspector.overridesSupport.setEmulationEnabled(!WebInspector.overridesSupport.emulationEnabled());
    },

    _emulationStateChanged: function()
    {
        this._unavailableSplashScreenElement.classList.toggle("hidden", WebInspector.overridesSupport.canEmulate());
        this._deviceElement.classList.toggle("hidden", !WebInspector.overridesSupport.emulationEnabled());
        this._splashScreenElement.classList.toggle("hidden", WebInspector.overridesSupport.emulationEnabled() || !WebInspector.overridesSupport.canEmulate());
    },

    __proto__: WebInspector.VBox.prototype
}

/**
 * @constructor
 * @implements {WebInspector.Revealer}
 */
WebInspector.OverridesView.Revealer = function()
{
}

WebInspector.OverridesView.Revealer.prototype = {
    /**
     * @override
     * @param {!Object} overridesSupport
     * @return {!Promise}
     */
    reveal: function(overridesSupport)
    {
        WebInspector.inspectorView.showViewInDrawer("emulation");
        return Promise.resolve();
    }
}
