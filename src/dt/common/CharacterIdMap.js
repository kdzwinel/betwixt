// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @template T
 * @unrestricted
 */
Common.CharacterIdMap = class {
  constructor() {
    /** @type {!Map<T, string>} */
    this._elementToCharacter = new Map();
    /** @type {!Map<string, T>} */
    this._characterToElement = new Map();
    this._charCode = 33;
  }

  /**
   * @param {T} object
   * @return {string}
   */
  toChar(object) {
    let character = this._elementToCharacter.get(object);
    if (!character) {
      if (this._charCode >= 0xFFFF)
        throw new Error('CharacterIdMap ran out of capacity!');
      character = String.fromCharCode(this._charCode++);
      this._elementToCharacter.set(object, character);
      this._characterToElement.set(character, object);
    }
    return character;
  }

  /**
   * @param {string} character
   * @return {?T}
   */
  fromChar(character) {
    const object = this._characterToElement.get(character);
    if (object === undefined)
      return null;
    return object;
  }
};
