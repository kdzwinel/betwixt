// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @return {!Promise<!ProductRegistry.Registry>}
 */
ProductRegistry.instance = function() {
  const extension = self.runtime.extension(ProductRegistry.Registry);
  if (extension)
    return extension.instance();
  return Promise.resolve(self.singleton(ProductRegistry.RegistryStub));
};

/**
 * @interface
 */
ProductRegistry.Registry = function() {};

ProductRegistry.Registry.prototype = {
  /**
   * @param {!Common.ParsedURL} parsedUrl
   * @return {?string}
   */
  nameForUrl: function(parsedUrl) {},

  /**
   * @param {!Common.ParsedURL} parsedUrl
   * @return {?ProductRegistry.Registry.ProductEntry}
   */
  entryForUrl: function(parsedUrl) {},

  /**
   * @param {!Common.ParsedURL} parsedUrl
   * @return {?number}
   */
  typeForUrl: function(parsedUrl) {}
};

/**
 * @implements {ProductRegistry.Registry}
 */
ProductRegistry.RegistryStub = class {
  /**
   * @override
   * @param {!Common.ParsedURL} parsedUrl
   * @return {?string}
   */
  nameForUrl(parsedUrl) {
    return null;
  }

  /**
   * @override
   * @param {!Common.ParsedURL} parsedUrl
   * @return {?ProductRegistry.Registry.ProductEntry}
   */
  entryForUrl(parsedUrl) {
    return null;
  }

  /**
   * @override
   * @param {!Common.ParsedURL} parsedUrl
   * @return {?number}
   */
  typeForUrl(parsedUrl) {
    return null;
  }
};

/** @typedef {!{name: string, type: ?number}} */
ProductRegistry.Registry.ProductEntry;
