// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Elements.DOMLinkifier = {};

/**
 * @param {!SDK.DOMNode} node
 * @param {!Element} parentElement
 * @param {string=} tooltipContent
 */
Elements.DOMLinkifier.decorateNodeLabel = function(node, parentElement, tooltipContent) {
  const originalNode = node;
  const isPseudo = node.nodeType() === Node.ELEMENT_NODE && node.pseudoType();
  if (isPseudo && node.parentNode)
    node = node.parentNode;

  let title = node.nodeNameInCorrectCase();

  const nameElement = parentElement.createChild('span', 'node-label-name');
  nameElement.textContent = title;

  const idAttribute = node.getAttribute('id');
  if (idAttribute) {
    const idElement = parentElement.createChild('span', 'node-label-id');
    const part = '#' + idAttribute;
    title += part;
    idElement.createTextChild(part);

    // Mark the name as extra, since the ID is more important.
    nameElement.classList.add('extra');
  }

  const classAttribute = node.getAttribute('class');
  if (classAttribute) {
    const classes = classAttribute.split(/\s+/);
    const foundClasses = {};

    if (classes.length) {
      const classesElement = parentElement.createChild('span', 'extra node-label-class');
      for (let i = 0; i < classes.length; ++i) {
        const className = classes[i];
        if (className && !(className in foundClasses)) {
          const part = '.' + className;
          title += part;
          classesElement.createTextChild(part);
          foundClasses[className] = true;
        }
      }
    }
  }

  if (isPseudo) {
    const pseudoElement = parentElement.createChild('span', 'extra node-label-pseudo');
    const pseudoText = '::' + originalNode.pseudoType();
    pseudoElement.createTextChild(pseudoText);
    title += pseudoText;
  }
  parentElement.title = tooltipContent || title;
};

/**
 * @param {?SDK.DOMNode} node
 * @param {string=} tooltipContent
 * @return {!Node}
 */
Elements.DOMLinkifier.linkifyNodeReference = function(node, tooltipContent) {
  if (!node)
    return createTextNode(Common.UIString('<node>'));

  const root = createElementWithClass('span', 'monospace');
  const shadowRoot = UI.createShadowRootWithCoreStyles(root, 'elements/domLinkifier.css');
  const link = shadowRoot.createChild('div', 'node-link');

  Elements.DOMLinkifier.decorateNodeLabel(node, link, tooltipContent);

  link.addEventListener('click', () => Common.Revealer.reveal(node, false) && false, false);
  link.addEventListener('mouseover', node.highlight.bind(node, undefined, undefined), false);
  link.addEventListener('mouseleave', () => SDK.OverlayModel.hideDOMNodeHighlight(), false);

  return root;
};

/**
 * @param {!SDK.DeferredDOMNode} deferredNode
 * @return {!Node}
 */
Elements.DOMLinkifier.linkifyDeferredNodeReference = function(deferredNode) {
  const root = createElement('div');
  const shadowRoot = UI.createShadowRootWithCoreStyles(root, 'elements/domLinkifier.css');
  const link = shadowRoot.createChild('div', 'node-link');
  link.createChild('content');
  link.addEventListener('click', deferredNode.resolve.bind(deferredNode, onDeferredNodeResolved), false);
  link.addEventListener('mousedown', e => e.consume(), false);

  /**
   * @param {?SDK.DOMNode} node
   */
  function onDeferredNodeResolved(node) {
    Common.Revealer.reveal(node);
  }

  return root;
};

/**
 * @implements {Common.Linkifier}
 */
Elements.DOMLinkifier.Linkifier = class {
  /**
   * @override
   * @param {!Object} object
   * @param {!Common.Linkifier.Options=} options
   * @return {!Node}
   */
  linkify(object, options) {
    if (object instanceof SDK.DOMNode)
      return Elements.DOMLinkifier.linkifyNodeReference(object, options ? options.title : undefined);
    if (object instanceof SDK.DeferredDOMNode)
      return Elements.DOMLinkifier.linkifyDeferredNodeReference(object);
    throw new Error('Can\'t linkify non-node');
  }
};
