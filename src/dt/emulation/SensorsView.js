// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Emulation.SensorsView = class extends UI.VBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('emulation/sensors.css');
    this.contentElement.classList.add('sensors-view');

    this._geolocationSetting = Common.settings.createSetting('emulation.geolocationOverride', '');
    this._geolocation = SDK.EmulationModel.Geolocation.parseSetting(this._geolocationSetting.get());
    this._geolocationOverrideEnabled = false;
    this._createGeolocationSection(this._geolocation);

    this.contentElement.createChild('div').classList.add('panel-section-separator');

    this._deviceOrientationSetting = Common.settings.createSetting('emulation.deviceOrientationOverride', '');
    this._deviceOrientation = SDK.EmulationModel.DeviceOrientation.parseSetting(this._deviceOrientationSetting.get());
    this._deviceOrientationOverrideEnabled = false;
    this._createDeviceOrientationSection();

    this.contentElement.createChild('div').classList.add('panel-section-separator');

    this._appendTouchControl();
  }

  /**
   * @return {!Emulation.SensorsView}
   */
  static instance() {
    if (!Emulation.SensorsView._instanceObject)
      Emulation.SensorsView._instanceObject = new Emulation.SensorsView();
    return Emulation.SensorsView._instanceObject;
  }

  /**
   * @param {!SDK.EmulationModel.Geolocation} geolocation
   */
  _createGeolocationSection(geolocation) {
    const geogroup = this.contentElement.createChild('section', 'sensors-group');
    geogroup.createChild('div', 'sensors-group-title').textContent = Common.UIString('Geolocation');
    const fields = geogroup.createChild('div', 'geo-fields');

    const noOverrideOption = {
      title: Common.UIString('No override'),
      location: Emulation.SensorsView.NonPresetOptions.NoOverride
    };

    this._locationSelectElement = fields.createChild('select', 'chrome-select');

    // No override
    this._locationSelectElement.appendChild(new Option(noOverrideOption.title, noOverrideOption.location));

    // Locations
    this._customLocationsGroup = this._locationSelectElement.createChild('optgroup');
    this._customLocationsGroup.label = ls`Overrides`;
    const customGeolocations = Common.moduleSetting('emulation.geolocations');
    fields.appendChild(UI.createTextButton(ls`Manage`, () => Common.Revealer.reveal(customGeolocations)));
    const fillCustomSettings = () => {
      this._customLocationsGroup.removeChildren();
      for (const geolocation of customGeolocations.get())
        this._customLocationsGroup.appendChild(new Option(geolocation.title, JSON.stringify(geolocation)));
    };
    customGeolocations.addChangeListener(fillCustomSettings);
    fillCustomSettings();

    // Other location
    const customLocationOption = {
      title: Common.UIString('Other\u2026'),
      location: Emulation.SensorsView.NonPresetOptions.Custom
    };
    this._locationSelectElement.appendChild(new Option(customLocationOption.title, customLocationOption.location));

    // Error location.
    const group = this._locationSelectElement.createChild('optgroup');
    group.label = ls`Error`;
    group.appendChild(new Option(ls`Location unavailable`, Emulation.SensorsView.NonPresetOptions.Unavailable));

    this._locationSelectElement.selectedIndex = 0;
    this._locationSelectElement.addEventListener('change', this._geolocationSelectChanged.bind(this));

    // Validated input fieldset.
    this._fieldsetElement = fields.createChild('fieldset');
    this._fieldsetElement.disabled = !this._geolocationOverrideEnabled;
    this._fieldsetElement.id = 'geolocation-override-section';

    const latitudeGroup = this._fieldsetElement.createChild('div', 'latlong-group');
    const longitudeGroup = this._fieldsetElement.createChild('div', 'latlong-group');

    this._latitudeInput = UI.createInput('', 'number');
    latitudeGroup.appendChild(this._latitudeInput);
    this._latitudeInput.setAttribute('step', 'any');
    this._latitudeInput.value = 0;
    this._latitudeSetter = UI.bindInput(
        this._latitudeInput, this._applyGeolocationUserInput.bind(this),
        SDK.EmulationModel.Geolocation.latitudeValidator, true, 0.1);
    this._latitudeSetter(String(geolocation.latitude));

    this._longitudeInput = UI.createInput('', 'number');
    longitudeGroup.appendChild(this._longitudeInput);
    this._longitudeInput.setAttribute('step', 'any');
    this._longitudeInput.value = 0;
    this._longitudeSetter = UI.bindInput(
        this._longitudeInput, this._applyGeolocationUserInput.bind(this),
        SDK.EmulationModel.Geolocation.longitudeValidator, true, 0.1);
    this._longitudeSetter(String(geolocation.longitude));

    const cmdOrCtrl = Host.isMac() ? '\u2318' : 'Ctrl';
    const modifierKeyMessage = ls`Adjust with mousewheel or up/down keys. ${cmdOrCtrl}: ±10, Shift: ±1, Alt: ±0.01`;
    this._latitudeInput.title = modifierKeyMessage;
    this._longitudeInput.title = modifierKeyMessage;

    latitudeGroup.createChild('div', 'latlong-title').textContent = Common.UIString('Latitude');
    longitudeGroup.createChild('div', 'latlong-title').textContent = Common.UIString('Longitude');
  }

  _geolocationSelectChanged() {
    this._fieldsetElement.disabled = false;
    const value = this._locationSelectElement.options[this._locationSelectElement.selectedIndex].value;
    if (value === Emulation.SensorsView.NonPresetOptions.NoOverride) {
      this._geolocationOverrideEnabled = false;
      this._fieldsetElement.disabled = true;
    } else if (value === Emulation.SensorsView.NonPresetOptions.Custom) {
      this._geolocationOverrideEnabled = true;
    } else if (value === Emulation.SensorsView.NonPresetOptions.Unavailable) {
      this._geolocationOverrideEnabled = true;
      this._geolocation = new SDK.EmulationModel.Geolocation(0, 0, true);
    } else {
      this._geolocationOverrideEnabled = true;
      const coordinates = JSON.parse(value);
      this._geolocation = new SDK.EmulationModel.Geolocation(coordinates.lat, coordinates.long, false);
      this._latitudeSetter(coordinates.lat);
      this._longitudeSetter(coordinates.long);
    }

    this._applyGeolocation();
    if (value === Emulation.SensorsView.NonPresetOptions.Custom)
      this._latitudeInput.focus();
  }

  _applyGeolocationUserInput() {
    const geolocation = SDK.EmulationModel.Geolocation.parseUserInput(
        this._latitudeInput.value.trim(), this._longitudeInput.value.trim(), '');
    if (!geolocation)
      return;

    this._setSelectElementLabel(this._locationSelectElement, Emulation.SensorsView.NonPresetOptions.Custom);
    this._geolocation = geolocation;
    this._applyGeolocation();
  }

  _applyGeolocation() {
    if (this._geolocationOverrideEnabled)
      this._geolocationSetting.set(this._geolocation.toSetting());
    for (const emulationModel of SDK.targetManager.models(SDK.EmulationModel))
      emulationModel.emulateGeolocation(this._geolocationOverrideEnabled ? this._geolocation : null);
  }

  _createDeviceOrientationSection() {
    const orientationGroup = this.contentElement.createChild('section', 'sensors-group');
    orientationGroup.createChild('div', 'sensors-group-title').textContent = Common.UIString('Orientation');
    const orientationContent = orientationGroup.createChild('div', 'orientation-content');
    const fields = orientationContent.createChild('div', 'orientation-fields');

    const orientationOffOption = {
      title: Common.UIString('Off'),
      orientation: Emulation.SensorsView.NonPresetOptions.NoOverride
    };
    const customOrientationOption = {
      title: Common.UIString('Custom orientation...'),
      orientation: Emulation.SensorsView.NonPresetOptions.Custom
    };
    this._orientationSelectElement = this.contentElement.createChild('select', 'chrome-select');
    this._orientationSelectElement.appendChild(
        new Option(orientationOffOption.title, orientationOffOption.orientation));
    this._orientationSelectElement.appendChild(
        new Option(customOrientationOption.title, customOrientationOption.orientation));

    const orientationGroups = Emulation.SensorsView.PresetOrientations;
    for (let i = 0; i < orientationGroups.length; ++i) {
      const groupElement = this._orientationSelectElement.createChild('optgroup');
      groupElement.label = orientationGroups[i].title;
      const group = orientationGroups[i].value;
      for (let j = 0; j < group.length; ++j)
        groupElement.appendChild(new Option(group[j].title, group[j].orientation));
    }
    this._orientationSelectElement.selectedIndex = 0;
    fields.appendChild(this._orientationSelectElement);
    this._orientationSelectElement.addEventListener('change', this._orientationSelectChanged.bind(this));

    this._deviceOrientationFieldset = this._createDeviceOrientationOverrideElement(this._deviceOrientation);

    this._stageElement = orientationContent.createChild('div', 'orientation-stage');
    this._stageElement.title = Common.UIString('Shift+drag horizontally to rotate around the y-axis');
    this._orientationLayer = this._stageElement.createChild('div', 'orientation-layer');
    this._boxElement = this._orientationLayer.createChild('section', 'orientation-box orientation-element');

    this._boxElement.createChild('section', 'orientation-front orientation-element');
    this._boxElement.createChild('section', 'orientation-top orientation-element');
    this._boxElement.createChild('section', 'orientation-back orientation-element');
    this._boxElement.createChild('section', 'orientation-left orientation-element');
    this._boxElement.createChild('section', 'orientation-right orientation-element');
    this._boxElement.createChild('section', 'orientation-bottom orientation-element');

    UI.installDragHandle(
        this._stageElement, this._onBoxDragStart.bind(this), this._onBoxDrag.bind(this), null, '-webkit-grabbing',
        '-webkit-grab');

    fields.appendChild(this._deviceOrientationFieldset);
    this._enableOrientationFields(true);
    this._setBoxOrientation(this._deviceOrientation, false);
  }

  /**
   * @param {?boolean} disable
   */
  _enableOrientationFields(disable) {
    if (disable) {
      this._deviceOrientationFieldset.disabled = true;
      this._stageElement.classList.add('disabled');
    } else {
      this._deviceOrientationFieldset.disabled = false;
      this._stageElement.classList.remove('disabled');
    }
  }

  _orientationSelectChanged() {
    const value = this._orientationSelectElement.options[this._orientationSelectElement.selectedIndex].value;
    this._enableOrientationFields(false);

    if (value === Emulation.SensorsView.NonPresetOptions.NoOverride) {
      this._deviceOrientationOverrideEnabled = false;
      this._enableOrientationFields(true);
    } else if (value === Emulation.SensorsView.NonPresetOptions.Custom) {
      this._deviceOrientationOverrideEnabled = true;
      this._alphaElement.focus();
    } else {
      const parsedValue = JSON.parse(value);
      this._deviceOrientationOverrideEnabled = true;
      this._deviceOrientation =
          new SDK.EmulationModel.DeviceOrientation(parsedValue[0], parsedValue[1], parsedValue[2]);
      this._setDeviceOrientation(
          this._deviceOrientation, Emulation.SensorsView.DeviceOrientationModificationSource.SelectPreset);
    }
  }

  _applyDeviceOrientation() {
    if (this._deviceOrientationOverrideEnabled)
      this._deviceOrientationSetting.set(this._deviceOrientation.toSetting());
    for (const emulationModel of SDK.targetManager.models(SDK.EmulationModel))
      emulationModel.emulateDeviceOrientation(this._deviceOrientationOverrideEnabled ? this._deviceOrientation : null);
  }

  /**
   * @param {!Element} selectElement
   * @param {string} labelValue
   */
  _setSelectElementLabel(selectElement, labelValue) {
    const optionValues = Array.prototype.map.call(selectElement.options, x => x.value);
    selectElement.selectedIndex = optionValues.indexOf(labelValue);
  }

  _applyDeviceOrientationUserInput() {
    this._setDeviceOrientation(
        SDK.EmulationModel.DeviceOrientation.parseUserInput(
            this._alphaElement.value.trim(), this._betaElement.value.trim(), this._gammaElement.value.trim()),
        Emulation.SensorsView.DeviceOrientationModificationSource.UserInput);
    this._setSelectElementLabel(this._orientationSelectElement, Emulation.SensorsView.NonPresetOptions.Custom);
  }

  _resetDeviceOrientation() {
    this._setDeviceOrientation(
        new SDK.EmulationModel.DeviceOrientation(0, 90, 0),
        Emulation.SensorsView.DeviceOrientationModificationSource.ResetButton);
    this._setSelectElementLabel(this._orientationSelectElement, '[0, 90, 0]');
  }

  /**
   * @param {?SDK.EmulationModel.DeviceOrientation} deviceOrientation
   * @param {!Emulation.SensorsView.DeviceOrientationModificationSource} modificationSource
   */
  _setDeviceOrientation(deviceOrientation, modificationSource) {
    if (!deviceOrientation)
      return;

    /**
     * @param {number} angle
     * @return {number}
     */
    function roundAngle(angle) {
      return Math.round(angle * 10000) / 10000;
    }

    if (modificationSource !== Emulation.SensorsView.DeviceOrientationModificationSource.UserInput) {
      this._alphaSetter(roundAngle(deviceOrientation.alpha));
      this._betaSetter(roundAngle(deviceOrientation.beta));
      this._gammaSetter(roundAngle(deviceOrientation.gamma));
    }

    const animate = modificationSource !== Emulation.SensorsView.DeviceOrientationModificationSource.UserDrag;
    this._setBoxOrientation(deviceOrientation, animate);

    this._deviceOrientation = deviceOrientation;
    this._applyDeviceOrientation();
  }

  /**
   * @param {!Element} parentElement
   * @param {!Element} input
   * @param {string} label
   * @return {function(string)}
   */
  _createAxisInput(parentElement, input, label) {
    const div = parentElement.createChild('div', 'orientation-axis-input-container');
    div.appendChild(input);
    div.createTextChild(label);
    input.type = 'number';
    return UI.bindInput(
        input, this._applyDeviceOrientationUserInput.bind(this), SDK.EmulationModel.DeviceOrientation.validator, true);
  }

  /**
   * @param {!SDK.EmulationModel.DeviceOrientation} deviceOrientation
   * @return {!Element}
   */
  _createDeviceOrientationOverrideElement(deviceOrientation) {
    const fieldsetElement = createElement('fieldset');
    fieldsetElement.classList.add('device-orientation-override-section');
    const cellElement = fieldsetElement.createChild('td', 'orientation-inputs-cell');

    this._alphaElement = UI.createInput();
    this._alphaElement.setAttribute('step', 'any');
    this._alphaSetter = this._createAxisInput(cellElement, this._alphaElement, Common.UIString('\u03B1 (alpha)'));
    this._alphaSetter(String(deviceOrientation.alpha));

    this._betaElement = UI.createInput();
    this._betaElement.setAttribute('step', 'any');
    this._betaSetter = this._createAxisInput(cellElement, this._betaElement, Common.UIString('\u03B2 (beta)'));
    this._betaSetter(String(deviceOrientation.beta));

    this._gammaElement = UI.createInput();
    this._gammaElement.setAttribute('step', 'any');
    this._gammaSetter = this._createAxisInput(cellElement, this._gammaElement, Common.UIString('\u03B3 (gamma)'));
    this._gammaSetter(String(deviceOrientation.gamma));

    cellElement.appendChild(UI.createTextButton(
        Common.UIString('Reset'), this._resetDeviceOrientation.bind(this), 'orientation-reset-button'));
    return fieldsetElement;
  }

  /**
   * @param {!SDK.EmulationModel.DeviceOrientation} deviceOrientation
   * @param {boolean} animate
   */
  _setBoxOrientation(deviceOrientation, animate) {
    if (animate)
      this._stageElement.classList.add('is-animating');
    else
      this._stageElement.classList.remove('is-animating');

    // The CSS transform should not depend on matrix3d, which does not interpolate well.
    const matrix = new WebKitCSSMatrix();
    this._boxMatrix = matrix.rotate(-deviceOrientation.beta, deviceOrientation.gamma, -deviceOrientation.alpha);
    const eulerAngles =
        new UI.Geometry.EulerAngles(deviceOrientation.alpha, deviceOrientation.beta, deviceOrientation.gamma);
    this._orientationLayer.style.transform = eulerAngles.toRotate3DString();
  }

  /**
   * @param {!MouseEvent} event
   * @return {boolean}
   */
  _onBoxDrag(event) {
    const mouseMoveVector = this._calculateRadiusVector(event.x, event.y);
    if (!mouseMoveVector)
      return true;

    event.consume(true);
    let axis, angle;
    if (event.shiftKey) {
      axis = new UI.Geometry.Vector(0, 0, -1);
      angle = (this._mouseDownVector.x - mouseMoveVector.x) * Emulation.SensorsView.ShiftDragOrientationSpeed;
    } else {
      axis = UI.Geometry.crossProduct(this._mouseDownVector, mouseMoveVector);
      angle = UI.Geometry.calculateAngle(this._mouseDownVector, mouseMoveVector);
    }

    // The mouse movement vectors occur in the screen space, which is offset by 90 degrees from
    // the actual device orientation.
    let currentMatrix = new WebKitCSSMatrix();
    currentMatrix = currentMatrix.rotate(-90, 0, 0)
                        .rotateAxisAngle(axis.x, axis.y, axis.z, angle)
                        .rotate(90, 0, 0)
                        .multiply(this._originalBoxMatrix);

    const eulerAngles = UI.Geometry.EulerAngles.fromRotationMatrix(currentMatrix);
    const newOrientation =
        new SDK.EmulationModel.DeviceOrientation(-eulerAngles.alpha, -eulerAngles.beta, eulerAngles.gamma);
    this._setDeviceOrientation(newOrientation, Emulation.SensorsView.DeviceOrientationModificationSource.UserDrag);
    this._setSelectElementLabel(this._orientationSelectElement, Emulation.SensorsView.NonPresetOptions.Custom);
    return false;
  }

  /**
   * @param {!MouseEvent} event
   * @return {boolean}
   */
  _onBoxDragStart(event) {
    if (!this._deviceOrientationOverrideEnabled)
      return false;

    this._mouseDownVector = this._calculateRadiusVector(event.x, event.y);
    this._originalBoxMatrix = this._boxMatrix;

    if (!this._mouseDownVector)
      return false;

    event.consume(true);
    return true;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @return {?UI.Geometry.Vector}
   */
  _calculateRadiusVector(x, y) {
    const rect = this._stageElement.getBoundingClientRect();
    const radius = Math.max(rect.width, rect.height) / 2;
    const sphereX = (x - rect.left - rect.width / 2) / radius;
    const sphereY = (y - rect.top - rect.height / 2) / radius;
    const sqrSum = sphereX * sphereX + sphereY * sphereY;
    if (sqrSum > 0.5)
      return new UI.Geometry.Vector(sphereX, sphereY, 0.5 / Math.sqrt(sqrSum));

    return new UI.Geometry.Vector(sphereX, sphereY, Math.sqrt(1 - sqrSum));
  }

  _appendTouchControl() {
    const groupElement = this.contentElement.createChild('div', 'sensors-group');
    const title = groupElement.createChild('div', 'sensors-group-title');
    const fieldsElement = groupElement.createChild('div', 'sensors-group-fields');

    title.textContent = Common.UIString('Touch');
    const select = fieldsElement.createChild('select', 'chrome-select');
    select.appendChild(new Option(Common.UIString('Device-based'), 'auto'));
    select.appendChild(new Option(Common.UIString('Force enabled'), 'enabled'));
    select.addEventListener('change', applyTouch, false);

    const reloadWarning = groupElement.createChild('div', 'reload-warning hidden');
    reloadWarning.textContent = Common.UIString('*Requires reload');

    function applyTouch() {
      for (const emulationModel of SDK.targetManager.models(SDK.EmulationModel))
        emulationModel.overrideEmulateTouch(select.value === 'enabled');
      reloadWarning.classList.remove('hidden');
      const resourceTreeModel = SDK.targetManager.models(SDK.ResourceTreeModel)[0];
      if (resourceTreeModel) {
        resourceTreeModel.once(SDK.ResourceTreeModel.Events.MainFrameNavigated)
            .then(() => reloadWarning.classList.add('hidden'));
      }
    }
  }
};

/** @enum {string} */
Emulation.SensorsView.DeviceOrientationModificationSource = {
  UserInput: 'userInput',
  UserDrag: 'userDrag',
  ResetButton: 'resetButton',
  SelectPreset: 'selectPreset'
};

/** {string} */
Emulation.SensorsView.NonPresetOptions = {
  NoOverride: 'noOverride',
  Custom: 'custom',
  Unavailable: 'unavailable'
};

/** @type {!Array.<{title: string, value: !Array.<{title: string, orientation: string}>}>} */
Emulation.SensorsView.PresetOrientations = [{
  title: 'Presets',
  value: [
    {title: Common.UIString('Portrait'), orientation: '[0, 90, 0]'},
    {title: Common.UIString('Portrait upside down'), orientation: '[180, -90, 0]'},
    {title: Common.UIString('Landscape left'), orientation: '[0, 90, -90]'},
    {title: Common.UIString('Landscape right'), orientation: '[0, 90, 90]'},
    {title: Common.UIString('Display up'), orientation: '[0, 0, 0]'},
    {title: Common.UIString('Display down'), orientation: '[0, 180, 0]'}
  ]
}];


/**
 * @implements {UI.ActionDelegate}
 * @unrestricted
 */
Emulation.SensorsView.ShowActionDelegate = class {
  /**
   * @override
   * @param {!UI.Context} context
   * @param {string} actionId
   * @return {boolean}
   */
  handleAction(context, actionId) {
    UI.viewManager.showView('sensors');
    return true;
  }
};

Emulation.SensorsView.ShiftDragOrientationSpeed = 16;
