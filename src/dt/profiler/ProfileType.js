// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @unrestricted
 */
Profiler.ProfileType = class extends Common.Object {
  /**
   * @param {string} id
   * @param {string} name
   * @suppressGlobalPropertiesCheck
   */
  constructor(id, name) {
    super();
    this._id = id;
    this._name = name;
    /** @type {!Array.<!Profiler.ProfileHeader>} */
    this._profiles = [];
    /** @type {?Profiler.ProfileHeader} */
    this._profileBeingRecorded = null;
    this._nextProfileUid = 1;

    if (!window.opener)
      window.addEventListener('unload', this._clearTempStorage.bind(this), false);
  }

  /**
   * @return {string}
   */
  typeName() {
    return '';
  }

  /**
   * @return {number}
   */
  nextProfileUid() {
    return this._nextProfileUid;
  }

  /**
   * @return {number}
   */
  incrementProfileUid() {
    return this._nextProfileUid++;
  }

  /**
   * @return {boolean}
   */
  hasTemporaryView() {
    return false;
  }

  /**
   * @return {?string}
   */
  fileExtension() {
    return null;
  }

  get buttonTooltip() {
    return '';
  }

  get id() {
    return this._id;
  }

  get treeItemTitle() {
    return this._name;
  }

  get name() {
    return this._name;
  }

  /**
   * @return {boolean}
   */
  buttonClicked() {
    return false;
  }

  get description() {
    return '';
  }

  /**
   * @return {boolean}
   */
  isInstantProfile() {
    return false;
  }

  /**
   * @return {boolean}
   */
  isEnabled() {
    return true;
  }

  /**
   * @return {!Array.<!Profiler.ProfileHeader>}
   */
  getProfiles() {
    /**
     * @param {!Profiler.ProfileHeader} profile
     * @return {boolean}
     * @this {Profiler.ProfileType}
     */
    function isFinished(profile) {
      return this._profileBeingRecorded !== profile;
    }
    return this._profiles.filter(isFinished.bind(this));
  }

  /**
   * @return {?Element}
   */
  customContent() {
    return null;
  }

  /**
   * @param {number} uid
   * @return {?Profiler.ProfileHeader}
   */
  getProfile(uid) {
    for (let i = 0; i < this._profiles.length; ++i) {
      if (this._profiles[i].uid === uid)
        return this._profiles[i];
    }
    return null;
  }

  /**
   * @param {!File} file
   * @return {!Promise<?Error>}
   */
  loadFromFile(file) {
    let name = file.name;
    const fileExtension = this.fileExtension();
    if (fileExtension && name.endsWith(fileExtension))
      name = name.substr(0, name.length - fileExtension.length);
    const profile = this.createProfileLoadedFromFile(name);
    profile.setFromFile();
    this.setProfileBeingRecorded(profile);
    this.addProfile(profile);
    return profile.loadFromFile(file);
  }

  /**
   * @param {string} title
   * @return {!Profiler.ProfileHeader}
   */
  createProfileLoadedFromFile(title) {
    throw new Error('Needs implemented.');
  }

  /**
   * @param {!Profiler.ProfileHeader} profile
   */
  addProfile(profile) {
    this._profiles.push(profile);
    this.dispatchEventToListeners(Profiler.ProfileType.Events.AddProfileHeader, profile);
  }

  /**
   * @param {!Profiler.ProfileHeader} profile
   */
  removeProfile(profile) {
    const index = this._profiles.indexOf(profile);
    if (index === -1)
      return;
    this._profiles.splice(index, 1);
    this._disposeProfile(profile);
  }

  _clearTempStorage() {
    for (let i = 0; i < this._profiles.length; ++i)
      this._profiles[i].removeTempFile();
  }

  /**
   * @return {?Profiler.ProfileHeader}
   */
  profileBeingRecorded() {
    return this._profileBeingRecorded;
  }

  /**
   * @param {?Profiler.ProfileHeader} profile
   */
  setProfileBeingRecorded(profile) {
    this._profileBeingRecorded = profile;
  }

  profileBeingRecordedRemoved() {
  }

  reset() {
    for (const profile of this._profiles.slice())
      this._disposeProfile(profile);
    this._profiles = [];
    this._nextProfileUid = 1;
  }

  /**
   * @param {!Profiler.ProfileHeader} profile
   */
  _disposeProfile(profile) {
    this.dispatchEventToListeners(Profiler.ProfileType.Events.RemoveProfileHeader, profile);
    profile.dispose();
    if (this._profileBeingRecorded === profile) {
      this.profileBeingRecordedRemoved();
      this.setProfileBeingRecorded(null);
    }
  }
};

/** @enum {symbol} */
Profiler.ProfileType.Events = {
  AddProfileHeader: Symbol('add-profile-header'),
  ProfileComplete: Symbol('profile-complete'),
  RemoveProfileHeader: Symbol('remove-profile-header'),
  ViewUpdated: Symbol('view-updated')
};

/**
 * @interface
 */
Profiler.ProfileType.DataDisplayDelegate = function() {};

Profiler.ProfileType.DataDisplayDelegate.prototype = {
  /**
   * @param {?Profiler.ProfileHeader} profile
   * @return {?UI.Widget}
   */
  showProfile(profile) {},

  /**
   * @param {!Protocol.HeapProfiler.HeapSnapshotObjectId} snapshotObjectId
   * @param {string} perspectiveName
   */
  showObject(snapshotObjectId, perspectiveName) {},

  /**
   * @param {number} nodeIndex
   * @return {!Promise<?Element>}
   */
  async linkifyObject(nodeIndex) {}
};
