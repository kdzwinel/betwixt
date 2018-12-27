// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Emulation.EmulatedDevice = class {
  constructor() {
    /** @type {string} */
    this.title = '';
    /** @type {string} */
    this.type = Emulation.EmulatedDevice.Type.Unknown;
    /** @type {!Emulation.EmulatedDevice.Orientation} */
    this.vertical = {width: 0, height: 0, outlineInsets: null, outlineImage: null};
    /** @type {!Emulation.EmulatedDevice.Orientation} */
    this.horizontal = {width: 0, height: 0, outlineInsets: null, outlineImage: null};
    /** @type {number} */
    this.deviceScaleFactor = 1;
    /** @type {!Array.<string>} */
    this.capabilities = [Emulation.EmulatedDevice.Capability.Touch, Emulation.EmulatedDevice.Capability.Mobile];
    /** @type {string} */
    this.userAgent = '';
    /** @type {!Array.<!Emulation.EmulatedDevice.Mode>} */
    this.modes = [];

    /** @type {string} */
    this._show = Emulation.EmulatedDevice._Show.Default;
    /** @type {boolean} */
    this._showByDefault = true;

    /** @type {?Runtime.Extension} */
    this._extension = null;
  }

  /**
   * @param {*} json
   * @return {?Emulation.EmulatedDevice}
   */
  static fromJSONV1(json) {
    try {
      /**
       * @param {*} object
       * @param {string} key
       * @param {string} type
       * @param {*=} defaultValue
       * @return {*}
       */
      function parseValue(object, key, type, defaultValue) {
        if (typeof object !== 'object' || object === null || !object.hasOwnProperty(key)) {
          if (typeof defaultValue !== 'undefined')
            return defaultValue;
          throw new Error('Emulated device is missing required property \'' + key + '\'');
        }
        const value = object[key];
        if (typeof value !== type || value === null)
          throw new Error('Emulated device property \'' + key + '\' has wrong type \'' + typeof value + '\'');
        return value;
      }

      /**
       * @param {*} object
       * @param {string} key
       * @return {number}
       */
      function parseIntValue(object, key) {
        const value = /** @type {number} */ (parseValue(object, key, 'number'));
        if (value !== Math.abs(value))
          throw new Error('Emulated device value \'' + key + '\' must be integer');
        return value;
      }

      /**
       * @param {*} json
       * @return {!UI.Insets}
       */
      function parseInsets(json) {
        return new UI.Insets(
            parseIntValue(json, 'left'), parseIntValue(json, 'top'), parseIntValue(json, 'right'),
            parseIntValue(json, 'bottom'));
      }

      /**
       * @param {*} json
       * @return {!Emulation.EmulatedDevice.Orientation}
       */
      function parseOrientation(json) {
        const result = {};

        result.width = parseIntValue(json, 'width');
        if (result.width < 0 || result.width > Emulation.DeviceModeModel.MaxDeviceSize ||
            result.width < Emulation.DeviceModeModel.MinDeviceSize)
          throw new Error('Emulated device has wrong width: ' + result.width);

        result.height = parseIntValue(json, 'height');
        if (result.height < 0 || result.height > Emulation.DeviceModeModel.MaxDeviceSize ||
            result.height < Emulation.DeviceModeModel.MinDeviceSize)
          throw new Error('Emulated device has wrong height: ' + result.height);

        const outlineInsets = parseValue(json['outline'], 'insets', 'object', null);
        if (outlineInsets) {
          result.outlineInsets = parseInsets(outlineInsets);
          if (result.outlineInsets.left < 0 || result.outlineInsets.top < 0)
            throw new Error('Emulated device has wrong outline insets');
          result.outlineImage = /** @type {string} */ (parseValue(json['outline'], 'image', 'string'));
        }
        return /** @type {!Emulation.EmulatedDevice.Orientation} */ (result);
      }

      const result = new Emulation.EmulatedDevice();
      result.title = /** @type {string} */ (parseValue(json, 'title', 'string'));
      result.type = /** @type {string} */ (parseValue(json, 'type', 'string'));
      const rawUserAgent = /** @type {string} */ (parseValue(json, 'user-agent', 'string'));
      result.userAgent = SDK.MultitargetNetworkManager.patchUserAgentWithChromeVersion(rawUserAgent);

      const capabilities = parseValue(json, 'capabilities', 'object', []);
      if (!Array.isArray(capabilities))
        throw new Error('Emulated device capabilities must be an array');
      result.capabilities = [];
      for (let i = 0; i < capabilities.length; ++i) {
        if (typeof capabilities[i] !== 'string')
          throw new Error('Emulated device capability must be a string');
        result.capabilities.push(capabilities[i]);
      }

      result.deviceScaleFactor = /** @type {number} */ (parseValue(json['screen'], 'device-pixel-ratio', 'number'));
      if (result.deviceScaleFactor < 0 || result.deviceScaleFactor > 100)
        throw new Error('Emulated device has wrong deviceScaleFactor: ' + result.deviceScaleFactor);

      result.vertical = parseOrientation(parseValue(json['screen'], 'vertical', 'object'));
      result.horizontal = parseOrientation(parseValue(json['screen'], 'horizontal', 'object'));

      const modes = parseValue(json, 'modes', 'object', []);
      if (!Array.isArray(modes))
        throw new Error('Emulated device modes must be an array');
      result.modes = [];
      for (let i = 0; i < modes.length; ++i) {
        const mode = {};
        mode.title = /** @type {string} */ (parseValue(modes[i], 'title', 'string'));
        mode.orientation = /** @type {string} */ (parseValue(modes[i], 'orientation', 'string'));
        if (mode.orientation !== Emulation.EmulatedDevice.Vertical &&
            mode.orientation !== Emulation.EmulatedDevice.Horizontal)
          throw new Error('Emulated device mode has wrong orientation \'' + mode.orientation + '\'');
        const orientation = result.orientationByName(mode.orientation);
        mode.insets = parseInsets(parseValue(modes[i], 'insets', 'object'));
        if (mode.insets.top < 0 || mode.insets.left < 0 || mode.insets.right < 0 || mode.insets.bottom < 0 ||
            mode.insets.top + mode.insets.bottom > orientation.height ||
            mode.insets.left + mode.insets.right > orientation.width)
          throw new Error('Emulated device mode \'' + mode.title + '\'has wrong mode insets');

        mode.image = /** @type {string} */ (parseValue(modes[i], 'image', 'string', null));
        result.modes.push(mode);
      }

      result._showByDefault = /** @type {boolean} */ (parseValue(json, 'show-by-default', 'boolean', undefined));
      result._show =
          /** @type {string} */ (parseValue(json, 'show', 'string', Emulation.EmulatedDevice._Show.Default));

      return result;
    } catch (e) {
      return null;
    }
  }

  /**
   * @param {!Emulation.EmulatedDevice} device1
   * @param {!Emulation.EmulatedDevice} device2
   * @return {number}
   */
  static deviceComparator(device1, device2) {
    const order1 = (device1._extension && device1._extension.descriptor()['order']) || -1;
    const order2 = (device2._extension && device2._extension.descriptor()['order']) || -1;
    if (order1 > order2)
      return 1;
    if (order2 > order1)
      return -1;
    return device1.title < device2.title ? -1 : (device1.title > device2.title ? 1 : 0);
  }

  /**
   * @return {?Runtime.Extension}
   */
  extension() {
    return this._extension;
  }

  /**
   * @param {?Runtime.Extension} extension
   */
  setExtension(extension) {
    this._extension = extension;
  }

  /**
   * @param {string} orientation
   * @return {!Array.<!Emulation.EmulatedDevice.Mode>}
   */
  modesForOrientation(orientation) {
    const result = [];
    for (let index = 0; index < this.modes.length; index++) {
      if (this.modes[index].orientation === orientation)
        result.push(this.modes[index]);
    }
    return result;
  }

  /**
   * @return {*}
   */
  _toJSON() {
    const json = {};
    json['title'] = this.title;
    json['type'] = this.type;
    json['user-agent'] = this.userAgent;
    json['capabilities'] = this.capabilities;

    json['screen'] = {};
    json['screen']['device-pixel-ratio'] = this.deviceScaleFactor;
    json['screen']['vertical'] = this._orientationToJSON(this.vertical);
    json['screen']['horizontal'] = this._orientationToJSON(this.horizontal);

    json['modes'] = [];
    for (let i = 0; i < this.modes.length; ++i) {
      const mode = {};
      mode['title'] = this.modes[i].title;
      mode['orientation'] = this.modes[i].orientation;
      mode['insets'] = {};
      mode['insets']['left'] = this.modes[i].insets.left;
      mode['insets']['top'] = this.modes[i].insets.top;
      mode['insets']['right'] = this.modes[i].insets.right;
      mode['insets']['bottom'] = this.modes[i].insets.bottom;
      if (this.modes[i].image)
        mode['image'] = this.modes[i].image;
      json['modes'].push(mode);
    }

    json['show-by-default'] = this._showByDefault;
    json['show'] = this._show;

    return json;
  }

  /**
   * @param {!Emulation.EmulatedDevice.Orientation} orientation
   * @return {*}
   */
  _orientationToJSON(orientation) {
    const json = {};
    json['width'] = orientation.width;
    json['height'] = orientation.height;
    if (orientation.outlineInsets) {
      json['outline'] = {};
      json['outline']['insets'] = {};
      json['outline']['insets']['left'] = orientation.outlineInsets.left;
      json['outline']['insets']['top'] = orientation.outlineInsets.top;
      json['outline']['insets']['right'] = orientation.outlineInsets.right;
      json['outline']['insets']['bottom'] = orientation.outlineInsets.bottom;
      json['outline']['image'] = orientation.outlineImage;
    }
    return json;
  }

  /**
   * @param {!Emulation.EmulatedDevice.Mode} mode
   * @return {string}
   */
  modeImage(mode) {
    if (!mode.image)
      return '';
    if (!this._extension)
      return mode.image;
    return this._extension.module().substituteURL(mode.image);
  }

  /**
   * @param {!Emulation.EmulatedDevice.Mode} mode
   * @return {string}
   */
  outlineImage(mode) {
    const orientation = this.orientationByName(mode.orientation);
    if (!orientation.outlineImage)
      return '';
    if (!this._extension)
      return orientation.outlineImage;
    return this._extension.module().substituteURL(orientation.outlineImage);
  }

  /**
   * @param {string} name
   * @return {!Emulation.EmulatedDevice.Orientation}
   */
  orientationByName(name) {
    return name === Emulation.EmulatedDevice.Vertical ? this.vertical : this.horizontal;
  }

  /**
   * @return {boolean}
   */
  show() {
    if (this._show === Emulation.EmulatedDevice._Show.Default)
      return this._showByDefault;
    return this._show === Emulation.EmulatedDevice._Show.Always;
  }

  /**
   * @param {boolean} show
   */
  setShow(show) {
    this._show = show ? Emulation.EmulatedDevice._Show.Always : Emulation.EmulatedDevice._Show.Never;
  }

  /**
   * @param {!Emulation.EmulatedDevice} other
   */
  copyShowFrom(other) {
    this._show = other._show;
  }

  /**
   * @return {boolean}
   */
  touch() {
    return this.capabilities.indexOf(Emulation.EmulatedDevice.Capability.Touch) !== -1;
  }

  /**
   * @return {boolean}
   */
  mobile() {
    return this.capabilities.indexOf(Emulation.EmulatedDevice.Capability.Mobile) !== -1;
  }
};

/** @typedef {!{title: string, orientation: string, insets: !UI.Insets, image: ?string}} */
Emulation.EmulatedDevice.Mode;

/** @typedef {!{width: number, height: number, outlineInsets: ?UI.Insets, outlineImage: ?string}} */
Emulation.EmulatedDevice.Orientation;

Emulation.EmulatedDevice.Horizontal = 'horizontal';
Emulation.EmulatedDevice.Vertical = 'vertical';

Emulation.EmulatedDevice.Type = {
  Phone: 'phone',
  Tablet: 'tablet',
  Notebook: 'notebook',
  Desktop: 'desktop',
  Unknown: 'unknown'
};

Emulation.EmulatedDevice.Capability = {
  Touch: 'touch',
  Mobile: 'mobile'
};

Emulation.EmulatedDevice._Show = {
  Always: 'Always',
  Default: 'Default',
  Never: 'Never'
};


/**
 * @unrestricted
 */
Emulation.EmulatedDevicesList = class extends Common.Object {
  constructor() {
    super();

    /** @type {!Common.Setting} */
    this._standardSetting = Common.settings.createSetting('standardEmulatedDeviceList', []);
    /** @type {!Array.<!Emulation.EmulatedDevice>} */
    this._standard = [];
    this._listFromJSONV1(this._standardSetting.get(), this._standard);
    this._updateStandardDevices();

    /** @type {!Common.Setting} */
    this._customSetting = Common.settings.createSetting('customEmulatedDeviceList', []);
    /** @type {!Array.<!Emulation.EmulatedDevice>} */
    this._custom = [];
    if (!this._listFromJSONV1(this._customSetting.get(), this._custom))
      this.saveCustomDevices();
  }

  /**
   * @return {!Emulation.EmulatedDevicesList}
   */
  static instance() {
    if (!Emulation.EmulatedDevicesList._instance)
      Emulation.EmulatedDevicesList._instance = new Emulation.EmulatedDevicesList();
    return /** @type {!Emulation.EmulatedDevicesList} */ (Emulation.EmulatedDevicesList._instance);
  }

  _updateStandardDevices() {
    const devices = [];
    const extensions = self.runtime.extensions('emulated-device');
    for (let i = 0; i < extensions.length; ++i) {
      const device = Emulation.EmulatedDevice.fromJSONV1(extensions[i].descriptor()['device']);
      device.setExtension(extensions[i]);
      devices.push(device);
    }
    this._copyShowValues(this._standard, devices);
    this._standard = devices;
    this.saveStandardDevices();
  }

  /**
   * @param {!Array.<*>} jsonArray
   * @param {!Array.<!Emulation.EmulatedDevice>} result
   * @return {boolean}
   */
  _listFromJSONV1(jsonArray, result) {
    if (!Array.isArray(jsonArray))
      return false;
    let success = true;
    for (let i = 0; i < jsonArray.length; ++i) {
      const device = Emulation.EmulatedDevice.fromJSONV1(jsonArray[i]);
      if (device) {
        result.push(device);
        if (!device.modes.length) {
          device.modes.push({
            title: '',
            orientation: Emulation.EmulatedDevice.Horizontal,
            insets: new UI.Insets(0, 0, 0, 0),
            image: null
          });
          device.modes.push({
            title: '',
            orientation: Emulation.EmulatedDevice.Vertical,
            insets: new UI.Insets(0, 0, 0, 0),
            image: null
          });
        }
      } else {
        success = false;
      }
    }
    return success;
  }

  /**
   * @return {!Array.<!Emulation.EmulatedDevice>}
   */
  standard() {
    return this._standard;
  }

  /**
   * @return {!Array.<!Emulation.EmulatedDevice>}
   */
  custom() {
    return this._custom;
  }

  revealCustomSetting() {
    Common.Revealer.reveal(this._customSetting);
  }

  /**
   * @param {!Emulation.EmulatedDevice} device
   */
  addCustomDevice(device) {
    this._custom.push(device);
    this.saveCustomDevices();
  }

  /**
   * @param {!Emulation.EmulatedDevice} device
   */
  removeCustomDevice(device) {
    this._custom.remove(device);
    this.saveCustomDevices();
  }

  saveCustomDevices() {
    const json = this._custom.map(/** @param {!Emulation.EmulatedDevice} device */ function(device) {
      return device._toJSON();
    });
    this._customSetting.set(json);
    this.dispatchEventToListeners(Emulation.EmulatedDevicesList.Events.CustomDevicesUpdated);
  }

  saveStandardDevices() {
    const json = this._standard.map(/** @param {!Emulation.EmulatedDevice} device */ function(device) {
      return device._toJSON();
    });
    this._standardSetting.set(json);
    this.dispatchEventToListeners(Emulation.EmulatedDevicesList.Events.StandardDevicesUpdated);
  }

  /**
   * @param {!Array.<!Emulation.EmulatedDevice>} from
   * @param {!Array.<!Emulation.EmulatedDevice>} to
   */
  _copyShowValues(from, to) {
    const deviceById = new Map();
    for (let i = 0; i < from.length; ++i)
      deviceById.set(from[i].title, from[i]);

    for (let i = 0; i < to.length; ++i) {
      const title = to[i].title;
      if (deviceById.has(title))
        to[i].copyShowFrom(/** @type {!Emulation.EmulatedDevice} */ (deviceById.get(title)));
    }
  }
};

/** @enum {symbol} */
Emulation.EmulatedDevicesList.Events = {
  CustomDevicesUpdated: Symbol('CustomDevicesUpdated'),
  StandardDevicesUpdated: Symbol('StandardDevicesUpdated')
};

/** @type {?Emulation.EmulatedDevicesList} */
Emulation.EmulatedDevicesList._instance;
