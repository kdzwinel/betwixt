// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {Common.App}
 * @unrestricted
 */
Main.SimpleApp = class {
  /**
   * @override
   * @param {!Document} document
   */
  presentUI(document) {
    const rootView = new UI.RootView();
    UI.inspectorView.show(rootView.element);
    rootView.attachToDocument(document);
    rootView.focus();
  }
};

/**
 * @implements {Common.AppProvider}
 * @unrestricted
 */
Main.SimpleAppProvider = class {
  /**
   * @override
   * @return {!Common.App}
   */
  createApp() {
    return new Main.SimpleApp();
  }
};
