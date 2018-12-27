// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @interface
 */
Elements.MarkerDecorator = function() {};

Elements.MarkerDecorator.prototype = {
  /**
   * @param {!SDK.DOMNode} node
   * @return {?{title: string, color: string}}
   */
  decorate(node) {}
};

/**
 * @implements {Elements.MarkerDecorator}
 * @unrestricted
 */
Elements.GenericDecorator = class {
  /**
   * @param {!Runtime.Extension} extension
   */
  constructor(extension) {
    this._title = Common.UIString(extension.title());
    this._color = extension.descriptor()['color'];
  }

  /**
   * @override
   * @param {!SDK.DOMNode} node
   * @return {?{title: string, color: string}}
   */
  decorate(node) {
    return {title: this._title, color: this._color};
  }
};
