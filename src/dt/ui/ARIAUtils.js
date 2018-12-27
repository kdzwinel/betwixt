// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

UI.ARIAUtils = {};

/**
 * @param {!Element} element
 */
UI.ARIAUtils.markAsButton = function(element) {
  element.setAttribute('role', 'button');
};

/**
 * @param {!Element} element
 */
UI.ARIAUtils.markAsGroup = function(element) {
  element.setAttribute('role', 'group');
};

/**
 * @param {!Element} element
 */
UI.ARIAUtils.markAsLink = function(element) {
  element.setAttribute('role', 'link');
};

/**
 * @param {!Element} element
 */
UI.ARIAUtils.markAsTab = function(element) {
  element.setAttribute('role', 'tab');
};

/**
 * @param {!Element} element
 */
UI.ARIAUtils.markAsTree = function(element) {
  element.setAttribute('role', 'tree');
};

/**
 * @param {!Element} element
 */
UI.ARIAUtils.markAsTreeitem = function(element) {
  element.setAttribute('role', 'treeitem');
};

/**
 * @param {!Element} element
 */
UI.ARIAUtils.markAsTextBox = function(element) {
  element.setAttribute('role', 'textbox');
};

/**
 * @param {!Element} element
 */
UI.ARIAUtils.markAsMenu = function(element) {
  element.setAttribute('role', 'menu');
};

/**
 * @param {!Element} element
 */
UI.ARIAUtils.markAsMenuItem = function(element) {
  element.setAttribute('role', 'menuitem');
};

/**
 * @param {!Element} element
 */
UI.ARIAUtils.markAsHidden = function(element) {
  element.setAttribute('aria-hidden', 'true');
};

/**
 * @param {!Element} element
 * @param {?string} placeholder
 */
UI.ARIAUtils.setPlaceholder = function(element, placeholder) {
  if (placeholder)
    element.setAttribute('aria-placeholder', placeholder);
  else
    element.removeAttribute('aria-placeholder');
};

/**
 * @param {!Element} element
 */
UI.ARIAUtils.markAsPresentation = function(element) {
  element.setAttribute('role', 'presentation');
};

/**
 * @param {!Element} element
 * @param {?Element} controlledElement
 */
UI.ARIAUtils.setControls = function(element, controlledElement) {
  if (!controlledElement) {
    element.removeAttribute('aria-controls');
    return;
  }

  if (controlledElement.id === '')
    throw new Error('Controlled element must have ID');

  element.setAttribute('aria-controls', controlledElement.id);
};

/**
 * @param {!Element} element
 * @param {boolean} value
 */
UI.ARIAUtils.setExpanded = function(element, value) {
  element.setAttribute('aria-expanded', !!value);
};

/**
 * @param {!Element} element
 */
UI.ARIAUtils.unsetExpanded = function(element) {
  element.removeAttribute('aria-expanded');
};

/**
 * @param {!Element} element
 * @param {boolean} value
 */
UI.ARIAUtils.setSelected = function(element, value) {
  // aria-selected behaves differently for false and undefined.
  // Often times undefined values are unintentionally typed as booleans.
  // Use !! to make sure this is true or false.
  element.setAttribute('aria-selected', !!value);
};

/**
 * @param {!Element} element
 * @param {boolean} value
 */
UI.ARIAUtils.setPressed = function(element, value) {
  // aria-pressed behaves differently for false and undefined.
  // Often times undefined values are unintentionally typed as booleans.
  // Use !! to make sure this is true or false.
  element.setAttribute('aria-pressed', !!value);
};

/**
 * @param {!Element} element
 * @param {string} name
 */
UI.ARIAUtils.setAccessibleName = function(element, name) {
  element.setAttribute('aria-label', name);
};

/**
 * @param {string} message
 * @param {!Element} element
 */
UI.ARIAUtils.alert = function(message, element) {
  const document = element.ownerDocument;
  if (!document[UI.ARIAUtils.AlertElementSymbol]) {
    const alertElement = document.body.createChild('div');
    alertElement.style.position = 'absolute';
    alertElement.style.left = '-999em';
    alertElement.style.width = '100em';
    alertElement.style.overflow = 'hidden';
    alertElement.setAttribute('role', 'alert');
    alertElement.setAttribute('aria-atomic', 'true');
    document[UI.ARIAUtils.AlertElementSymbol] = alertElement;
  }
  document[UI.ARIAUtils.AlertElementSymbol].textContent = message.trimEnd(10000);
};

UI.ARIAUtils.AlertElementSymbol = Symbol('AlertElementSybmol');
