// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

MobileThrottling.NetworkThrottlingSelector = class {
  /**
   * @param {function(!Array<!MobileThrottling.NetworkThrottlingConditionsGroup>):!Array<?SDK.NetworkManager.Conditions>} populateCallback
   * @param {function(number)} selectCallback
   * @param {!Common.Setting<!Array<!SDK.NetworkManager.Conditions>>} customNetworkConditionsSetting
   */
  constructor(populateCallback, selectCallback, customNetworkConditionsSetting) {
    this._populateCallback = populateCallback;
    this._selectCallback = selectCallback;
    this._customNetworkConditionsSetting = customNetworkConditionsSetting;
    this._customNetworkConditionsSetting.addChangeListener(this._populateOptions, this);
    SDK.multitargetNetworkManager.addEventListener(
        SDK.MultitargetNetworkManager.Events.ConditionsChanged, this._networkConditionsChanged, this);
    /** @type {!Array<?SDK.NetworkManager.Conditions>} */
    this._options;
    this._populateOptions();
  }

  revealAndUpdate() {
    Common.Revealer.reveal(this._customNetworkConditionsSetting);
    this._networkConditionsChanged();
  }

  /**
   * @param {!SDK.NetworkManager.Conditions} conditions
   */
  optionSelected(conditions) {
    SDK.multitargetNetworkManager.setNetworkConditions(conditions);
  }

  _populateOptions() {
    const disabledGroup = {title: Common.UIString('Disabled'), items: [SDK.NetworkManager.NoThrottlingConditions]};
    const presetsGroup = {title: Common.UIString('Presets'), items: MobileThrottling.networkPresets};
    const customGroup = {title: Common.UIString('Custom'), items: this._customNetworkConditionsSetting.get()};
    this._options = this._populateCallback([disabledGroup, presetsGroup, customGroup]);
    if (!this._networkConditionsChanged()) {
      for (let i = this._options.length - 1; i >= 0; i--) {
        if (this._options[i]) {
          this.optionSelected(/** @type {!SDK.NetworkManager.Conditions} */ (this._options[i]));
          break;
        }
      }
    }
  }

  /**
   * @return {boolean} returns false if selected condition no longer exists
   */
  _networkConditionsChanged() {
    const value = SDK.multitargetNetworkManager.networkConditions();
    for (let index = 0; index < this._options.length; ++index) {
      const option = this._options[index];
      if (option && option.download === value.download && option.upload === value.upload &&
          option.latency === value.latency && option.title === value.title) {
        this._selectCallback(index);
        return true;
      }
    }
    return false;
  }
};
