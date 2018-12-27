// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {Common.JavaScriptMetadata}
 */
JavaScriptMetadata.JavaScriptMetadata = class {
  constructor() {
    /** @type {!Map<string, !Array<!Array<string>>>} */
    this._uniqueFunctions = new Map();
    /** @type {!Map<string, !Map<string, !Array<!Array<string>>>>} */
    this._instanceMethods = new Map();
    /** @type {!Map<string, !Map<string, !Array<!Array<string>>>>} */
    this._staticMethods = new Map();

    for (const nativeFunction of JavaScriptMetadata.NativeFunctions) {
      if (!nativeFunction.receiver) {
        this._uniqueFunctions.set(nativeFunction.name, nativeFunction.signatures);
      } else if (nativeFunction.static) {
        if (!this._staticMethods.has(nativeFunction.receiver))
          this._staticMethods.set(nativeFunction.receiver, new Map());
        this._staticMethods.get(nativeFunction.receiver).set(nativeFunction.name, nativeFunction.signatures);
      } else {
        if (!this._instanceMethods.has(nativeFunction.receiver))
          this._instanceMethods.set(nativeFunction.receiver, new Map());
        this._instanceMethods.get(nativeFunction.receiver).set(nativeFunction.name, nativeFunction.signatures);
      }
    }
  }

  /**
   * @override
   * @param {string} name
   * @return {?Array<!Array<string>>}
   */
  signaturesForNativeFunction(name) {
    return this._uniqueFunctions.get(name) || null;
  }

  /**
   * @override
   * @param {string} name
   * @param {string} receiverClassName
   * @return {?Array<!Array<string>>}
   */
  signaturesForInstanceMethod(name, receiverClassName) {
    if (!this._instanceMethods.has(receiverClassName))
      return null;
    return this._instanceMethods.get(receiverClassName).get(name) || null;
  }

  /**
   * @override
   * @param {string} name
   * @param {string} receiverConstructorName
   * @return {?Array<!Array<string>>}
   */
  signaturesForStaticMethod(name, receiverConstructorName) {
    if (!this._staticMethods.has(receiverConstructorName))
      return null;
    return this._staticMethods.get(receiverConstructorName).get(name) || null;
  }
};

/**
 * @type {!Array<{
 *  name: string,
 *  signatures: !Array<!Array<string>>,
 *  static: (boolean|undefined),
 *  receiver: (string|undefined),
 * }>}
 */
JavaScriptMetadata.NativeFunctions;