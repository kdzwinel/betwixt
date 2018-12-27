// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/** @interface */
Bindings.LiveLocation = function() {};

Bindings.LiveLocation.prototype = {
  update() {},

  /**
   * @return {?Workspace.UILocation}
   */
  uiLocation() {},

  dispose() {},

  /**
   * @return {boolean}
   */
  isBlackboxed() {}
};

/**
 * @implements {Bindings.LiveLocation}
 * @unrestricted
 */
Bindings.LiveLocationWithPool = class {
  /**
   * @param {function(!Bindings.LiveLocation)} updateDelegate
   * @param {!Bindings.LiveLocationPool} locationPool
   */
  constructor(updateDelegate, locationPool) {
    this._updateDelegate = updateDelegate;
    this._locationPool = locationPool;
    this._locationPool._add(this);
  }

  /**
   * @override
   */
  update() {
    this._updateDelegate(this);
  }

  /**
   * @override
   * @return {?Workspace.UILocation}
   */
  uiLocation() {
    throw 'Not implemented';
  }

  /**
   * @override
   */
  dispose() {
    this._locationPool._delete(this);
    this._updateDelegate = null;
  }

  /**
   * @override
   * @return {boolean}
   */
  isBlackboxed() {
    throw 'Not implemented';
  }
};

/**
 * @unrestricted
 */
Bindings.LiveLocationPool = class {
  constructor() {
    this._locations = new Set();
  }

  /**
   * @param {!Bindings.LiveLocation} location
   */
  _add(location) {
    this._locations.add(location);
  }

  /**
   * @param {!Bindings.LiveLocation} location
   */
  _delete(location) {
    this._locations.delete(location);
  }

  disposeAll() {
    for (const location of this._locations)
      location.dispose();
  }
};
