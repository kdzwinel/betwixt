/*
 * Copyright (C) 2009 Apple Inc. All rights reserved.
 * Copyright (C) 2009 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @unrestricted
 */
UI.KeyboardShortcut = class {
  /**
   * Creates a number encoding keyCode in the lower 8 bits and modifiers mask in the higher 8 bits.
   * It is useful for matching pressed keys.
   *
   * @param {number|string} keyCode The code of the key, or a character "a-z" which is converted to a keyCode value.
   * @param {number=} modifiers Optional list of modifiers passed as additional parameters.
   * @return {number}
   */
  static makeKey(keyCode, modifiers) {
    if (typeof keyCode === 'string')
      keyCode = keyCode.charCodeAt(0) - (/^[a-z]/.test(keyCode) ? 32 : 0);
    modifiers = modifiers || UI.KeyboardShortcut.Modifiers.None;
    return UI.KeyboardShortcut._makeKeyFromCodeAndModifiers(keyCode, modifiers);
  }

  /**
   * @param {?KeyboardEvent} keyboardEvent
   * @return {number}
   */
  static makeKeyFromEvent(keyboardEvent) {
    let modifiers = UI.KeyboardShortcut.Modifiers.None;
    if (keyboardEvent.shiftKey)
      modifiers |= UI.KeyboardShortcut.Modifiers.Shift;
    if (keyboardEvent.ctrlKey)
      modifiers |= UI.KeyboardShortcut.Modifiers.Ctrl;
    if (keyboardEvent.altKey)
      modifiers |= UI.KeyboardShortcut.Modifiers.Alt;
    if (keyboardEvent.metaKey)
      modifiers |= UI.KeyboardShortcut.Modifiers.Meta;

    // Use either a real or a synthetic keyCode (for events originating from extensions).
    const keyCode = keyboardEvent.keyCode || keyboardEvent['__keyCode'];
    return UI.KeyboardShortcut._makeKeyFromCodeAndModifiers(keyCode, modifiers);
  }

  /**
   * @param {?KeyboardEvent} keyboardEvent
   * @return {number}
   */
  static makeKeyFromEventIgnoringModifiers(keyboardEvent) {
    const keyCode = keyboardEvent.keyCode || keyboardEvent['__keyCode'];
    return UI.KeyboardShortcut._makeKeyFromCodeAndModifiers(keyCode, UI.KeyboardShortcut.Modifiers.None);
  }

  /**
   * @param {(?KeyboardEvent|?MouseEvent)} event
   * @return {boolean}
   */
  static eventHasCtrlOrMeta(event) {
    return Host.isMac() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  }

  /**
   * @param {!Event} event
   * @return {boolean}
   */
  static hasNoModifiers(event) {
    return !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey;
  }

  /**
   * @param {string|!UI.KeyboardShortcut.Key} key
   * @param {number=} modifiers
   * @return {!UI.KeyboardShortcut.Descriptor}
   */
  static makeDescriptor(key, modifiers) {
    return {
      key: UI.KeyboardShortcut.makeKey(typeof key === 'string' ? key : key.code, modifiers),
      name: UI.KeyboardShortcut.shortcutToString(key, modifiers)
    };
  }

  /**
   * @param {string} shortcut
   * @return {?UI.KeyboardShortcut.Descriptor}
   */
  static makeDescriptorFromBindingShortcut(shortcut) {
    const parts = shortcut.split(/\+(?!$)/);
    let modifiers = 0;
    let keyString;
    for (let i = 0; i < parts.length; ++i) {
      if (typeof UI.KeyboardShortcut.Modifiers[parts[i]] !== 'undefined') {
        modifiers |= UI.KeyboardShortcut.Modifiers[parts[i]];
        continue;
      }
      console.assert(
          i === parts.length - 1, 'Only one key other than modifier is allowed in shortcut <' + shortcut + '>');
      keyString = parts[i];
      break;
    }
    console.assert(keyString, 'Modifiers-only shortcuts are not allowed (encountered <' + shortcut + '>)');
    if (!keyString)
      return null;

    const key = UI.KeyboardShortcut.Keys[keyString] || UI.KeyboardShortcut.KeyBindings[keyString];
    if (key && key.shiftKey)
      modifiers |= UI.KeyboardShortcut.Modifiers.Shift;
    return UI.KeyboardShortcut.makeDescriptor(key ? key : keyString, modifiers);
  }

  /**
   * @param {string|!UI.KeyboardShortcut.Key} key
   * @param {number=} modifiers
   * @return {string}
   */
  static shortcutToString(key, modifiers) {
    return UI.KeyboardShortcut._modifiersToString(modifiers) + UI.KeyboardShortcut._keyName(key);
  }

  /**
   * @param {string|!UI.KeyboardShortcut.Key} key
   * @return {string}
   */
  static _keyName(key) {
    if (typeof key === 'string')
      return key.toUpperCase();
    if (typeof key.name === 'string')
      return key.name;
    return key.name[Host.platform()] || key.name.other || '';
  }

  /**
   * @param {number} keyCode
   * @param {?number} modifiers
   * @return {number}
   */
  static _makeKeyFromCodeAndModifiers(keyCode, modifiers) {
    return (keyCode & 255) | (modifiers << 8);
  }

  /**
   * @param {number} key
   * @return {!{keyCode: number, modifiers: number}}
   */
  static keyCodeAndModifiersFromKey(key) {
    return {keyCode: key & 255, modifiers: key >> 8};
  }

  /**
   * @param {number|undefined} modifiers
   * @return {string}
   */
  static _modifiersToString(modifiers) {
    const isMac = Host.isMac();
    const m = UI.KeyboardShortcut.Modifiers;
    const modifierNames = new Map([
      [m.Ctrl, isMac ? 'Ctrl\u2004' : 'Ctrl\u200A+\u200A'], [m.Alt, isMac ? '\u2325\u2004' : 'Alt\u200A+\u200A'],
      [m.Shift, isMac ? '\u21e7\u2004' : 'Shift\u200A+\u200A'], [m.Meta, isMac ? '\u2318\u2004' : 'Win\u200A+\u200A']
    ]);
    return [m.Meta, m.Ctrl, m.Alt, m.Shift].map(mapModifiers).join('');

    /**
     * @param {number} m
     * @return {string}
     */
    function mapModifiers(m) {
      return modifiers & m ? /** @type {string} */ (modifierNames.get(m)) : '';
    }
  }
};

/**
 * Constants for encoding modifier key set as a bit mask.
 * @see #_makeKeyFromCodeAndModifiers
 */
UI.KeyboardShortcut.Modifiers = {
  None: 0,  // Constant for empty modifiers set.
  Shift: 1,
  Ctrl: 2,
  Alt: 4,
  Meta: 8,  // Command key on Mac, Win key on other platforms.
  get CtrlOrMeta() {
    // "default" command/ctrl key for platform, Command on Mac, Ctrl on other platforms
    return Host.isMac() ? this.Meta : this.Ctrl;
  },
  get ShiftOrOption() {
    // Option on Mac, Shift on other platforms
    return Host.isMac() ? this.Alt : this.Shift;
  }
};

/** @typedef {!{code: number, name: (string|!Object.<string, string>)}} */
UI.KeyboardShortcut.Key;

/** @type {!Object.<string, !UI.KeyboardShortcut.Key>} */
UI.KeyboardShortcut.Keys = {
  Backspace: {code: 8, name: '\u21a4'},
  Tab: {code: 9, name: {mac: '\u21e5', other: 'Tab'}},
  Enter: {code: 13, name: {mac: '\u21a9', other: 'Enter'}},
  Shift: {code: 16, name: {mac: '\u21e7', other: 'Shift'}},
  Ctrl: {code: 17, name: 'Ctrl'},
  Esc: {code: 27, name: 'Esc'},
  Space: {code: 32, name: 'Space'},
  PageUp: {code: 33, name: {mac: '\u21de', other: 'PageUp'}},      // also NUM_NORTH_EAST
  PageDown: {code: 34, name: {mac: '\u21df', other: 'PageDown'}},  // also NUM_SOUTH_EAST
  End: {code: 35, name: {mac: '\u2197', other: 'End'}},            // also NUM_SOUTH_WEST
  Home: {code: 36, name: {mac: '\u2196', other: 'Home'}},          // also NUM_NORTH_WEST
  Left: {code: 37, name: '\u2190'},                                // also NUM_WEST
  Up: {code: 38, name: '\u2191'},                                  // also NUM_NORTH
  Right: {code: 39, name: '\u2192'},                               // also NUM_EAST
  Down: {code: 40, name: '\u2193'},                                // also NUM_SOUTH
  Delete: {code: 46, name: 'Del'},
  Zero: {code: 48, name: '0'},
  H: {code: 72, name: 'H'},
  N: {code: 78, name: 'N'},
  P: {code: 80, name: 'P'},
  Meta: {code: 91, name: 'Meta'},
  F1: {code: 112, name: 'F1'},
  F2: {code: 113, name: 'F2'},
  F3: {code: 114, name: 'F3'},
  F4: {code: 115, name: 'F4'},
  F5: {code: 116, name: 'F5'},
  F6: {code: 117, name: 'F6'},
  F7: {code: 118, name: 'F7'},
  F8: {code: 119, name: 'F8'},
  F9: {code: 120, name: 'F9'},
  F10: {code: 121, name: 'F10'},
  F11: {code: 122, name: 'F11'},
  F12: {code: 123, name: 'F12'},
  Semicolon: {code: 186, name: ';'},
  NumpadPlus: {code: 107, name: 'Numpad +'},
  NumpadMinus: {code: 109, name: 'Numpad -'},
  Numpad0: {code: 96, name: 'Numpad 0'},
  Plus: {code: 187, name: '+'},
  Comma: {code: 188, name: ','},
  Minus: {code: 189, name: '-'},
  Period: {code: 190, name: '.'},
  Slash: {code: 191, name: '/'},
  QuestionMark: {code: 191, name: '?'},
  Apostrophe: {code: 192, name: '`'},
  Tilde: {code: 192, name: 'Tilde'},
  LeftSquareBracket: {code: 219, name: '['},
  RightSquareBracket: {code: 221, name: ']'},
  Backslash: {code: 220, name: '\\'},
  SingleQuote: {code: 222, name: '\''},
  get CtrlOrMeta() {
    // "default" command/ctrl key for platform, Command on Mac, Ctrl on other platforms
    return Host.isMac() ? this.Meta : this.Ctrl;
  },
};

UI.KeyboardShortcut.KeyBindings = {};

(function() {
for (const key in UI.KeyboardShortcut.Keys) {
  const descriptor = UI.KeyboardShortcut.Keys[key];
  if (typeof descriptor === 'object' && descriptor['code']) {
    const name = typeof descriptor['name'] === 'string' ? descriptor['name'] : key;
    UI.KeyboardShortcut.KeyBindings[name] = descriptor;
  }
}
})();


/** @typedef {!{key: number, name: string}} */
UI.KeyboardShortcut.Descriptor;
