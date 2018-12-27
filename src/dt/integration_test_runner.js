// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

if (self.testRunner) {
  testRunner.dumpAsText();
  testRunner.waitUntilDone();
}

Runtime.startApplication('integration_test_runner');
