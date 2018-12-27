// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
// Release build has Runtime.js bundled.
if (!self.Runtime)
  self.importScripts('Runtime.js');
Runtime.startWorker('formatter_worker');
