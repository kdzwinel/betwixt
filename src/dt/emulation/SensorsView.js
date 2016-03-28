// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.SensorsView = function()
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("emulation/sensors.css");
    this.contentElement.classList.add("sensors-view");
    this._appendGeolocationOverrideControl();
    this._appendDeviceOrientationOverrideControl();
}

WebInspector.SensorsView.prototype = {
    _appendGeolocationOverrideControl: function()
    {
        const geolocationSetting = WebInspector.overridesSupport.settings.geolocationOverride.get();
        var geolocation = WebInspector.OverridesSupport.GeolocationPosition.parseSetting(geolocationSetting);
        var checkboxLabel = createCheckboxLabel(WebInspector.UIString("Emulate geolocation coordinates"));
        this._geolocationOverrideCheckbox = checkboxLabel.checkboxElement;
        this._geolocationOverrideCheckbox.addEventListener("click", this._geolocationOverrideCheckboxClicked.bind(this));
        this.contentElement.appendChild(checkboxLabel);
        this._geolocationFieldset = this._createGeolocationOverrideElement(geolocation);
        this._geolocationFieldset.disabled = true;
        this.contentElement.appendChild(this._geolocationFieldset);
    },

    _geolocationOverrideCheckboxClicked: function()
    {
        var enabled = this._geolocationOverrideCheckbox.checked;
        WebInspector.overridesSupport.setGeolocationOverrideEnabled(enabled);
        if (enabled && !this._latitudeElement.value)
            this._latitudeElement.focus();
        this._geolocationFieldset.disabled = !enabled;
    },

    _applyGeolocationUserInput: function()
    {
        this._setGeolocationPosition(WebInspector.OverridesSupport.GeolocationPosition.parseUserInput(this._latitudeElement.value.trim(), this._longitudeElement.value.trim(), this._geolocationErrorElement.checked), true);
    },

    /**
     * @param {?WebInspector.OverridesSupport.GeolocationPosition} geolocation
     * @param {boolean} userInputModified
     */
    _setGeolocationPosition: function(geolocation, userInputModified)
    {
        if (!geolocation)
            return;

        if (!userInputModified) {
            this._latitudeElement.value = geolocation.latitude;
            this._longitudeElement.value = geolocation.longitude;
        }

        var value = geolocation.toSetting();
        WebInspector.overridesSupport.settings.geolocationOverride.set(value);
    },

    /**
     * @param {!WebInspector.OverridesSupport.GeolocationPosition} geolocation
     * @return {!Element}
     */
    _createGeolocationOverrideElement: function(geolocation)
    {
        var fieldsetElement = createElement("fieldset");
        fieldsetElement.id = "geolocation-override-section";

        var tableElement = fieldsetElement.createChild("table");
        var rowElement = tableElement.createChild("tr");
        var cellElement = rowElement.createChild("td");
        cellElement = rowElement.createChild("td");
        cellElement.createTextChild(WebInspector.UIString("Lat = "));
        this._latitudeElement = WebInspector.SettingsUI.createInput(cellElement, "geolocation-override-latitude", String(geolocation.latitude), this._applyGeolocationUserInput.bind(this), true);
        cellElement.createTextChild(" , ");
        cellElement.createTextChild(WebInspector.UIString("Lon = "));
        this._longitudeElement = WebInspector.SettingsUI.createInput(cellElement, "geolocation-override-longitude", String(geolocation.longitude), this._applyGeolocationUserInput.bind(this), true);
        rowElement = tableElement.createChild("tr");
        cellElement = rowElement.createChild("td");
        cellElement.colSpan = 2;
        var geolocationErrorLabelElement = createCheckboxLabel(WebInspector.UIString("Emulate position unavailable"), !geolocation || !!geolocation.error);
        var geolocationErrorCheckboxElement = geolocationErrorLabelElement.checkboxElement;
        geolocationErrorCheckboxElement.id = "geolocation-error";
        geolocationErrorCheckboxElement.addEventListener("click", this._applyGeolocationUserInput.bind(this), false);
        this._geolocationErrorElement = geolocationErrorCheckboxElement;
        cellElement.appendChild(geolocationErrorLabelElement);

        return fieldsetElement;
    },

    _appendDeviceOrientationOverrideControl: function()
    {
        const deviceOrientationSetting = WebInspector.overridesSupport.settings.deviceOrientationOverride.get();
        var deviceOrientation = WebInspector.OverridesSupport.DeviceOrientation.parseSetting(deviceOrientationSetting);
        var checkboxLabel = createCheckboxLabel(WebInspector.UIString("Emulate accelerometer"));
        this._overrideDeviceOrientationCheckbox = checkboxLabel.checkboxElement;
        this._overrideDeviceOrientationCheckbox.addEventListener("click", this._deviceOrientationOverrideCheckboxClicked.bind(this));
        this.contentElement.appendChild(checkboxLabel);
        this._deviceOrientationFieldset = this._createDeviceOrientationOverrideElement(deviceOrientation);
        this._deviceOrientationFieldset.disabled = true;
        this.contentElement.appendChild(this._deviceOrientationFieldset);
    },

    _deviceOrientationOverrideCheckboxClicked: function()
    {
        var enabled = this._overrideDeviceOrientationCheckbox.checked;
        WebInspector.overridesSupport.setDeviceOrientationOverrideEnabled(enabled);
        if (enabled && !this._alphaElement.value)
            this._alphaElement.focus();
        this._deviceOrientationFieldset.disabled = !enabled;
    },

    _applyDeviceOrientationUserInput: function()
    {
        this._setDeviceOrientation(WebInspector.OverridesSupport.DeviceOrientation.parseUserInput(this._alphaElement.value.trim(), this._betaElement.value.trim(), this._gammaElement.value.trim()), WebInspector.SensorsView.DeviceOrientationModificationSource.UserInput);
    },

    _resetDeviceOrientation: function()
    {
        this._setDeviceOrientation(new WebInspector.OverridesSupport.DeviceOrientation(0, 0, 0), WebInspector.SensorsView.DeviceOrientationModificationSource.ResetButton);
    },

    /**
     * @param {?WebInspector.OverridesSupport.DeviceOrientation} deviceOrientation
     * @param {!WebInspector.SensorsView.DeviceOrientationModificationSource} modificationSource
     */
    _setDeviceOrientation: function(deviceOrientation, modificationSource)
    {
        if (!deviceOrientation)
            return;

        if (modificationSource != WebInspector.SensorsView.DeviceOrientationModificationSource.UserInput) {
            this._alphaElement.value = deviceOrientation.alpha;
            this._betaElement.value = deviceOrientation.beta;
            this._gammaElement.value = deviceOrientation.gamma;
        }

        if (modificationSource != WebInspector.SensorsView.DeviceOrientationModificationSource.UserDrag)
            this._setBoxOrientation(deviceOrientation);

        var value = deviceOrientation.toSetting();
        WebInspector.overridesSupport.settings.deviceOrientationOverride.set(value);
    },

    /**
     * @param {!Element} parentElement
     * @param {string} id
     * @param {string} label
     * @param {string} defaultText
     * @return {!Element}
     */
    _createAxisInput: function(parentElement, id, label, defaultText)
    {
        var div = parentElement.createChild("div", "accelerometer-axis-input-container");
        div.createTextChild(label);
        return WebInspector.SettingsUI.createInput(div, id, defaultText, this._applyDeviceOrientationUserInput.bind(this), true);
    },

    /**
     * @param {!WebInspector.OverridesSupport.DeviceOrientation} deviceOrientation
     */
    _createDeviceOrientationOverrideElement: function(deviceOrientation)
    {
        var fieldsetElement = createElement("fieldset");
        fieldsetElement.classList.add("device-orientation-override-section");
        var tableElement = fieldsetElement.createChild("table");
        var rowElement = tableElement.createChild("tr");
        var cellElement = rowElement.createChild("td", "accelerometer-inputs-cell");

        this._alphaElement = this._createAxisInput(cellElement, "device-orientation-override-alpha", "\u03B1: ", String(deviceOrientation.alpha));
        this._betaElement = this._createAxisInput(cellElement, "device-orientation-override-beta", "\u03B2: ", String(deviceOrientation.beta));
        this._gammaElement = this._createAxisInput(cellElement, "device-orientation-override-gamma", "\u03B3: ", String(deviceOrientation.gamma));

        cellElement.appendChild(createTextButton(WebInspector.UIString("Reset"), this._resetDeviceOrientation.bind(this), "accelerometer-reset-button"));

        this._stageElement = rowElement.createChild("td","accelerometer-stage");
        this._boxElement = this._stageElement.createChild("section", "accelerometer-box");

        this._boxElement.createChild("section", "front");
        this._boxElement.createChild("section", "top");
        this._boxElement.createChild("section", "back");
        this._boxElement.createChild("section", "left");
        this._boxElement.createChild("section", "right");
        this._boxElement.createChild("section", "bottom");

        WebInspector.installDragHandle(this._stageElement, this._onBoxDragStart.bind(this), this._onBoxDrag.bind(this), this._onBoxDragEnd.bind(this), "move");
        this._setBoxOrientation(deviceOrientation);
        return fieldsetElement;
    },

    /**
     * @param {!WebInspector.OverridesSupport.DeviceOrientation} deviceOrientation
     */
    _setBoxOrientation: function(deviceOrientation)
    {
        var matrix = new WebKitCSSMatrix();
        this._boxMatrix = matrix.rotate(-deviceOrientation.beta, deviceOrientation.gamma, -deviceOrientation.alpha);
        this._boxElement.style.webkitTransform = this._boxMatrix.toString();
    },

    /**
     * @param {!MouseEvent} event
     * @return {boolean}
     */
    _onBoxDrag: function(event)
    {
        var mouseMoveVector = this._calculateRadiusVector(event.x, event.y);
        if (!mouseMoveVector)
            return true;

        event.consume(true);
        var axis = WebInspector.Geometry.crossProduct(this._mouseDownVector, mouseMoveVector);
        axis.normalize();
        var angle = WebInspector.Geometry.calculateAngle(this._mouseDownVector, mouseMoveVector);
        var matrix = new WebKitCSSMatrix();
        var rotationMatrix = matrix.rotateAxisAngle(axis.x, axis.y, axis.z, angle);
        this._currentMatrix = rotationMatrix.multiply(this._boxMatrix);
        this._boxElement.style.webkitTransform = this._currentMatrix;
        var eulerAngles = WebInspector.Geometry.EulerAngles.fromRotationMatrix(this._currentMatrix);
        var newOrientation = new WebInspector.OverridesSupport.DeviceOrientation(-eulerAngles.alpha, -eulerAngles.beta, eulerAngles.gamma);
        this._setDeviceOrientation(newOrientation, WebInspector.SensorsView.DeviceOrientationModificationSource.UserDrag);
        return false;
    },

    /**
     * @param {!MouseEvent} event
     * @return {boolean}
     */
    _onBoxDragStart: function(event)
    {
        if (!this._overrideDeviceOrientationCheckbox.checked)
            return false;

        this._mouseDownVector = this._calculateRadiusVector(event.x, event.y);

        if (!this._mouseDownVector)
            return false;

        event.consume(true);
        return true;
    },

    _onBoxDragEnd: function()
    {
        this._boxMatrix = this._currentMatrix;
    },

    /**
     * @param {number} x
     * @param {number} y
     * @return {?WebInspector.Geometry.Vector}
     */
    _calculateRadiusVector: function(x, y)
    {
        var rect = this._stageElement.getBoundingClientRect();
        var radius = Math.max(rect.width, rect.height) / 2;
        var sphereX = (x - rect.left - rect.width / 2) / radius;
        var sphereY = (y - rect.top - rect.height / 2) / radius;
        var sqrSum = sphereX * sphereX + sphereY * sphereY;
        if (sqrSum > 0.5)
            return new WebInspector.Geometry.Vector(sphereX, sphereY, 0.5 / Math.sqrt(sqrSum));

        return new WebInspector.Geometry.Vector(sphereX, sphereY, Math.sqrt(1 - sqrSum));
    },

    __proto__ : WebInspector.VBox.prototype
}

/** @enum {string} */
WebInspector.SensorsView.DeviceOrientationModificationSource = {
    UserInput: "userInput",
    UserDrag: "userDrag",
    ResetButton: "resetButton"
}

/**
 * @return {!WebInspector.SensorsView}
 */
WebInspector.SensorsView.instance = function()
{
    if (!WebInspector.SensorsView._instanceObject)
        WebInspector.SensorsView._instanceObject = new WebInspector.SensorsView();
    return WebInspector.SensorsView._instanceObject;
}

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.SensorsView.ShowActionDelegate = function()
{
}

WebInspector.SensorsView.ShowActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     * @return {boolean}
     */
    handleAction: function(context, actionId)
    {
        WebInspector.inspectorView.showViewInDrawer("sensors");
        return true;
    }
}
