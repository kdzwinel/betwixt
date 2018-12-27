// Copyright 2017 The Chromium Authors. All
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview using private properties isn't a Closure violation in tests.
 * @suppress {accessControls}
 */

DeviceModeTestRunner.buildFakePhone = function(overrides) {
  const StandardPhoneJSON = {
    'show-by-default': false,
    'title': 'Fake Phone 1',

    'screen': {
      'horizontal': {'width': 480, 'height': 320},

      'device-pixel-ratio': 2,

      'vertical': {'width': 320, 'height': 480}
    },

    'capabilities': ['touch', 'mobile'],
    'user-agent': 'fakeUserAgent',
    'type': 'phone',

    'modes': [
      {
        'title': 'default',
        'orientation': 'vertical',

        'insets': {'left': 0, 'top': 0, 'right': 0, 'bottom': 0}
      },
      {
        'title': 'default',
        'orientation': 'horizontal',

        'insets': {'left': 0, 'top': 0, 'right': 0, 'bottom': 0}
      }
    ]
  };

  const json = Object.assign(StandardPhoneJSON, overrides || {});
  return Emulation.EmulatedDevice.fromJSONV1(json);
};
