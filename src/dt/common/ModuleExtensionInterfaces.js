// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @interface
 */
Common.Revealer = function() {};

/**
 * @param {?Object} revealable
 * @param {boolean=} omitFocus
 * @return {!Promise.<undefined>}
 */
Common.Revealer.reveal = function(revealable, omitFocus) {
  if (!revealable)
    return Promise.reject(new Error('Can\'t reveal ' + revealable));
  return self.runtime.allInstances(Common.Revealer, revealable).then(reveal);

  /**
   * @param {!Array.<!Common.Revealer>} revealers
   * @return {!Promise.<undefined>}
   */
  function reveal(revealers) {
    const promises = [];
    for (let i = 0; i < revealers.length; ++i)
      promises.push(revealers[i].reveal(/** @type {!Object} */ (revealable), omitFocus));
    return Promise.race(promises);
  }
};

/**
 * @param {?Object} revealable
 * @return {?string}
 */
Common.Revealer.revealDestination = function(revealable) {
  const extension = self.runtime.extension(Common.Revealer, revealable);
  if (!extension)
    return null;
  return extension.descriptor()['destination'];
};

Common.Revealer.prototype = {
  /**
   * @param {!Object} object
   * @param {boolean=} omitFocus
   * @return {!Promise}
   */
  reveal(object, omitFocus) {}
};

/**
 * @interface
 */
Common.App = function() {};

Common.App.prototype = {
  /**
   * @param {!Document} document
   */
  presentUI(document) {}
};

/**
 * @interface
 */
Common.AppProvider = function() {};

Common.AppProvider.prototype = {
  /**
   * @return {!Common.App}
   */
  createApp() {}
};

/**
 * @interface
 */
Common.QueryParamHandler = function() {};

Common.QueryParamHandler.prototype = {
  /**
   * @param {string} value
   */
  handleQueryParam(value) {}
};

/**
 * @interface
 */
Common.Runnable = function() {};

Common.Runnable.prototype = {
  run() {}
};

/**
 * @interface
 */
Common.Linkifier = function() {};

Common.Linkifier.prototype = {
  /**
   * @param {!Object} object
   * @param {!Common.Linkifier.Options=} options
   * @return {!Node}
   */
  linkify(object, options) {}
};

/**
 * @param {?Object} object
 * @param {!Common.Linkifier.Options=} options
 * @return {!Promise<!Node>}
 */
Common.Linkifier.linkify = function(object, options) {
  if (!object)
    return Promise.reject(new Error('Can\'t linkify ' + object));
  return self.runtime.extension(Common.Linkifier, object)
      .instance()
      .then(linkifier => linkifier.linkify(object, options));
};

/** @typedef {{tooltip: string}} */
Common.Linkifier.Options;

/**
 * @interface
 */
Common.JavaScriptMetadata = function() {};
Common.JavaScriptMetadata.prototype = {

  /**
   * @param {string} name
   * @return {?Array<!Array<string>>}
   */
  signaturesForNativeFunction(name) {},

  /**
   * @param {string} name
   * @param {string} receiverClassName
   * @return {?Array<!Array<string>>}
   */
  signaturesForInstanceMethod(name, receiverClassName) {},

  /**
   * @param {string} name
   * @param {string} receiverConstructorName
   * @return {?Array<!Array<string>>}
   */
  signaturesForStaticMethod(name, receiverConstructorName) {}
};
