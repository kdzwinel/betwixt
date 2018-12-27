// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/** @enum {number} */
MobileThrottling.CPUThrottlingRates = {
  NoThrottling: 1,
  MidTierMobile: 4,
  LowEndMobile: 6,
};

/**
 * @typedef {{
 *   title: string,
 *   description: string,
 *   network: !SDK.NetworkManager.Conditions,
 *   cpuThrottlingRate: !MobileThrottling.CPUThrottlingRates
 * }}
 **/
MobileThrottling.Conditions;

/** @type {!MobileThrottling.Conditions} */
MobileThrottling.NoThrottlingConditions = {
  title: SDK.NetworkManager.NoThrottlingConditions.title,
  description: Common.UIString('No throttling'),
  network: SDK.NetworkManager.NoThrottlingConditions,
  cpuThrottlingRate: MobileThrottling.CPUThrottlingRates.NoThrottling,
};

/** @type {!MobileThrottling.Conditions} */
MobileThrottling.OfflineConditions = {
  title: SDK.NetworkManager.OfflineConditions.title,
  description: Common.UIString('No internet connectivity'),
  network: SDK.NetworkManager.OfflineConditions,
  cpuThrottlingRate: MobileThrottling.CPUThrottlingRates.NoThrottling,
};

/** @type {!MobileThrottling.Conditions} */
MobileThrottling.LowEndMobileConditions = {
  title: Common.UIString('Low-end mobile'),
  description: Common.UIString('Slow 3G & 6x CPU slowdown'),
  network: SDK.NetworkManager.Slow3GConditions,
  cpuThrottlingRate: MobileThrottling.CPUThrottlingRates.LowEndMobile,
};

/** @type {!MobileThrottling.Conditions} */
MobileThrottling.MidTierMobileConditions = {
  title: Common.UIString('Mid-tier mobile'),
  description: Common.UIString('Fast 3G & 4x CPU slowdown'),
  network: SDK.NetworkManager.Fast3GConditions,
  cpuThrottlingRate: MobileThrottling.CPUThrottlingRates.MidTierMobile,
};

/**
 * @typedef {{
 *   title: string,
 *   description: string
 * }}
 **/
MobileThrottling.PlaceholderConditions;

/** @type {!MobileThrottling.PlaceholderConditions} */
MobileThrottling.CustomConditions = {
  title: Common.UIString('Custom'),
  description: Common.UIString('Check Network and Performance panels'),
};

/** @typedef {!{title: string, items: !Array<!SDK.NetworkManager.Conditions>}} */
MobileThrottling.NetworkThrottlingConditionsGroup;

/** @typedef {!{title: string, items: !Array<!MobileThrottling.Conditions|!MobileThrottling.PlaceholderConditions>}} */
MobileThrottling.MobileThrottlingConditionsGroup;

/** @typedef {!Array<?MobileThrottling.Conditions|!MobileThrottling.PlaceholderConditions>} */
MobileThrottling.ConditionsList;

/** @type {!Array.<!MobileThrottling.Conditions>} */
MobileThrottling.mobilePresets = [
  MobileThrottling.MidTierMobileConditions, MobileThrottling.LowEndMobileConditions, MobileThrottling.CustomConditions
];

/** @type {!Array.<!MobileThrottling.Conditions>} */
MobileThrottling.advancedMobilePresets = [
  MobileThrottling.OfflineConditions,
];

/** @type {!Array<!SDK.NetworkManager.Conditions>} */
MobileThrottling.networkPresets = [
  SDK.NetworkManager.Fast3GConditions,
  SDK.NetworkManager.Slow3GConditions,
  SDK.NetworkManager.OfflineConditions,
];

/** @type {!Array<!MobileThrottling.CPUThrottlingRates>} */
MobileThrottling.cpuThrottlingPresets = [
  MobileThrottling.CPUThrottlingRates.NoThrottling,
  MobileThrottling.CPUThrottlingRates.MidTierMobile,
  MobileThrottling.CPUThrottlingRates.LowEndMobile,
];
