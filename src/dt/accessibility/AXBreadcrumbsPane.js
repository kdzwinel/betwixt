// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Accessibility.AXBreadcrumbsPane = class extends Accessibility.AccessibilitySubPane {
  /**
   * @param {!Accessibility.AccessibilitySidebarView} axSidebarView
   */
  constructor(axSidebarView) {
    super(ls`Accessibility Tree`);

    this.element.classList.add('ax-subpane');
    UI.ARIAUtils.markAsTree(this.element);
    this.element.tabIndex = -1;

    this._axSidebarView = axSidebarView;

    /** @type {?Accessibility.AXBreadcrumb} */
    this._preselectedBreadcrumb = null;
    /** @type {?Accessibility.AXBreadcrumb} */
    this._inspectedNodeBreadcrumb = null;

    this._hoveredBreadcrumb = null;
    this._rootElement = this.element.createChild('div', 'ax-breadcrumbs');

    this._rootElement.addEventListener('keydown', this._onKeyDown.bind(this), true);
    this._rootElement.addEventListener('mousemove', this._onMouseMove.bind(this), false);
    this._rootElement.addEventListener('mouseleave', this._onMouseLeave.bind(this), false);
    this._rootElement.addEventListener('click', this._onClick.bind(this), false);
    this._rootElement.addEventListener('contextmenu', this._contextMenuEventFired.bind(this), false);
    this._rootElement.addEventListener('focusout', this._onFocusOut.bind(this), false);
    this.registerRequiredCSS('accessibility/axBreadcrumbs.css');
  }

  /**
   * @override
   */
  focus() {
    if (this._inspectedNodeBreadcrumb)
      this._inspectedNodeBreadcrumb.nodeElement().focus();
    else
      this.element.focus();
  }

  /**
   * @param {?Accessibility.AccessibilityNode} axNode
   * @override
   */
  setAXNode(axNode) {
    const hadFocus = this.element.hasFocus();
    super.setAXNode(axNode);

    this._rootElement.removeChildren();

    if (!axNode)
      return;

    const ancestorChain = [];
    let ancestor = axNode;
    while (ancestor) {
      ancestorChain.push(ancestor);
      ancestor = ancestor.parentNode();
    }
    ancestorChain.reverse();

    let depth = 0;
    let breadcrumb = null;
    let parent = null;
    for (ancestor of ancestorChain) {
      breadcrumb = new Accessibility.AXBreadcrumb(ancestor, depth, (ancestor === axNode));
      if (parent)
        parent.appendChild(breadcrumb);
      else
        this._rootElement.appendChild(breadcrumb.element());
      parent = breadcrumb;
      depth++;
    }

    this._inspectedNodeBreadcrumb = breadcrumb;
    this._inspectedNodeBreadcrumb.setPreselected(true, hadFocus);

    this._setPreselectedBreadcrumb(this._inspectedNodeBreadcrumb);

    /**
     * @param {!Accessibility.AXBreadcrumb} parentBreadcrumb
     * @param {!Accessibility.AccessibilityNode} axNode
     * @param {number} localDepth
     */
    function append(parentBreadcrumb, axNode, localDepth) {
      const childBreadcrumb = new Accessibility.AXBreadcrumb(axNode, localDepth, false);
      parentBreadcrumb.appendChild(childBreadcrumb);

      // In most cases there will be no children here, but there are some special cases.
      for (const child of axNode.children())
        append(childBreadcrumb, child, localDepth + 1);
    }

    for (const child of axNode.children())
      append(this._inspectedNodeBreadcrumb, child, depth);
  }

  /**
   * @override
   */
  willHide() {
    this._setPreselectedBreadcrumb(null);
  }

  /**
   * @param {!Event} event
   */
  _onKeyDown(event) {
    if (!this._preselectedBreadcrumb)
      return;
    if (!event.path.some(element => element === this._preselectedBreadcrumb.element()))
      return;
    if (event.shiftKey || event.metaKey || event.ctrlKey)
      return;

    let handled = false;
    if ((event.key === 'ArrowUp' || event.key === 'ArrowLeft') && !event.altKey)
      handled = this._preselectPrevious();
    else if ((event.key === 'ArrowDown' || event.key === 'ArrowRight') && !event.altKey)
      handled = this._preselectNext();
    else if (isEnterKey(event))
      handled = this._inspectDOMNode(this._preselectedBreadcrumb.axNode());

    if (handled)
      event.consume(true);
  }

  /**
   * @return {boolean}
   */
  _preselectPrevious() {
    const previousBreadcrumb = this._preselectedBreadcrumb.previousBreadcrumb();
    if (!previousBreadcrumb)
      return false;
    this._setPreselectedBreadcrumb(previousBreadcrumb);
    return true;
  }

  /**
   * @return {boolean}
   */
  _preselectNext() {
    const nextBreadcrumb = this._preselectedBreadcrumb.nextBreadcrumb();
    if (!nextBreadcrumb)
      return false;
    this._setPreselectedBreadcrumb(nextBreadcrumb);
    return true;
  }

  /**
   * @param {?Accessibility.AXBreadcrumb} breadcrumb
   */
  _setPreselectedBreadcrumb(breadcrumb) {
    if (breadcrumb === this._preselectedBreadcrumb)
      return;
    const hadFocus = this.element.hasFocus();
    if (this._preselectedBreadcrumb)
      this._preselectedBreadcrumb.setPreselected(false, hadFocus);

    if (breadcrumb)
      this._preselectedBreadcrumb = breadcrumb;
    else
      this._preselectedBreadcrumb = this._inspectedNodeBreadcrumb;
    this._preselectedBreadcrumb.setPreselected(true, hadFocus);
    if (!breadcrumb && hadFocus)
      SDK.OverlayModel.hideDOMNodeHighlight();
  }

  /**
   * @param {!Event} event
   */
  _onMouseLeave(event) {
    this._setHoveredBreadcrumb(null);
  }

  /**
   * @param {!Event} event
   */
  _onMouseMove(event) {
    const breadcrumbElement = event.target.enclosingNodeOrSelfWithClass('ax-breadcrumb');
    if (!breadcrumbElement) {
      this._setHoveredBreadcrumb(null);
      return;
    }
    const breadcrumb = breadcrumbElement.breadcrumb;
    if (!breadcrumb.isDOMNode())
      return;
    this._setHoveredBreadcrumb(breadcrumb);
  }

  /**
   * @param {!Event} event
   */
  _onFocusOut(event) {
    if (!this._preselectedBreadcrumb || event.target !== this._preselectedBreadcrumb.nodeElement())
      return;
    this._setPreselectedBreadcrumb(null);
  }

  /**
   * @param {!Event} event
   */
  _onClick(event) {
    const breadcrumbElement = event.target.enclosingNodeOrSelfWithClass('ax-breadcrumb');
    if (!breadcrumbElement) {
      this._setHoveredBreadcrumb(null);
      return;
    }
    const breadcrumb = breadcrumbElement.breadcrumb;
    if (breadcrumb.inspected()) {
      // If the user is clicking the inspected breadcrumb, they probably want to
      // focus it.
      breadcrumb.nodeElement().focus();
      return;
    }
    if (!breadcrumb.isDOMNode())
      return;
    this._inspectDOMNode(breadcrumb.axNode());
  }

  /**
   * @param {?Accessibility.AXBreadcrumb} breadcrumb
   */
  _setHoveredBreadcrumb(breadcrumb) {
    if (breadcrumb === this._hoveredBreadcrumb)
      return;

    if (this._hoveredBreadcrumb)
      this._hoveredBreadcrumb.setHovered(false);

    if (breadcrumb) {
      breadcrumb.setHovered(true);
    } else if (this.node()) {
      // Highlight and scroll into view the currently inspected node.
      this.node().domModel().overlayModel().nodeHighlightRequested(this.node().id);
    }

    this._hoveredBreadcrumb = breadcrumb;
  }

  /**
   * @param {!Accessibility.AccessibilityNode} axNode
   * @return {boolean}
   */
  _inspectDOMNode(axNode) {
    if (!axNode.isDOMNode())
      return false;

    axNode.deferredDOMNode().resolve(domNode => {
      this._axSidebarView.setNode(domNode, true /* fromAXTree */);
      Common.Revealer.reveal(domNode, true /* omitFocus */);
    });

    return true;
  }

  /**
   * @param {!Event} event
   */
  _contextMenuEventFired(event) {
    const breadcrumbElement = event.target.enclosingNodeOrSelfWithClass('ax-breadcrumb');
    if (!breadcrumbElement)
      return;

    const axNode = breadcrumbElement.breadcrumb.axNode();
    if (!axNode.isDOMNode() || !axNode.deferredDOMNode())
      return;

    const contextMenu = new UI.ContextMenu(event);
    contextMenu.viewSection().appendItem(ls`Scroll into view`, () => {
      axNode.deferredDOMNode().resolvePromise().then(domNode => {
        if (!domNode)
          return;
        domNode.scrollIntoView();
      });
    });

    contextMenu.appendApplicableItems(axNode.deferredDOMNode());
    contextMenu.show();
  }
};

Accessibility.AXBreadcrumb = class {
  /**
   * @param {!Accessibility.AccessibilityNode} axNode
   * @param {number} depth
   * @param {boolean} inspected
   */
  constructor(axNode, depth, inspected) {
    /** @type {!Accessibility.AccessibilityNode} */
    this._axNode = axNode;

    this._element = createElementWithClass('div', 'ax-breadcrumb');
    this._element.breadcrumb = this;

    this._nodeElement = createElementWithClass('div', 'ax-node');
    UI.ARIAUtils.markAsTreeitem(this._nodeElement);
    this._nodeElement.tabIndex = -1;
    this._element.appendChild(this._nodeElement);
    this._nodeWrapper = createElementWithClass('div', 'wrapper');
    this._nodeElement.appendChild(this._nodeWrapper);

    this._selectionElement = createElementWithClass('div', 'selection fill');
    this._nodeElement.appendChild(this._selectionElement);

    this._childrenGroupElement = createElementWithClass('div', 'children');
    UI.ARIAUtils.markAsGroup(this._childrenGroupElement);
    this._element.appendChild(this._childrenGroupElement);

    /** @type !Array<!Accessibility.AXBreadcrumb> */
    this._children = [];
    this._hovered = false;
    this._preselected = false;
    this._parent = null;

    this._inspected = inspected;
    this._nodeElement.classList.toggle('inspected', inspected);

    this._nodeElement.style.paddingLeft = (16 * depth + 4) + 'px';

    if (this._axNode.ignored()) {
      this._appendIgnoredNodeElement();
    } else {
      this._appendRoleElement(this._axNode.role());
      if (this._axNode.name() && this._axNode.name().value) {
        this._nodeWrapper.createChild('span', 'separator').textContent = '\u00A0';
        this._appendNameElement(/** @type {string} */ (this._axNode.name().value));
      }
    }

    if (this._axNode.hasOnlyUnloadedChildren())
      this._nodeElement.classList.add('children-unloaded');

    if (!this._axNode.isDOMNode())
      this._nodeElement.classList.add('no-dom-node');
  }

  /**
   * @return {!Element}
   */
  element() {
    return this._element;
  }

  /**
   * @return {!Element}
   */
  nodeElement() {
    return this._nodeElement;
  }

  /**
   * @param {!Accessibility.AXBreadcrumb} breadcrumb
   */
  appendChild(breadcrumb) {
    this._children.push(breadcrumb);
    breadcrumb.setParent(this);
    this._nodeElement.classList.add('parent');
    UI.ARIAUtils.setExpanded(this._nodeElement, true);
    this._childrenGroupElement.appendChild(breadcrumb.element());
  }

  /**
   * @param {!Accessibility.AXBreadcrumb} breadcrumb
   */
  setParent(breadcrumb) {
    this._parent = breadcrumb;
  }

  /**
   * @return {boolean}
   */
  preselected() {
    return this._preselected;
  }

  /**
   * @param {boolean} preselected
   * @param {boolean} selectedByUser
   */
  setPreselected(preselected, selectedByUser) {
    if (this._preselected === preselected)
      return;
    this._preselected = preselected;
    this._nodeElement.classList.toggle('preselected', preselected);
    if (preselected)
      this._nodeElement.setAttribute('tabIndex', 0);
    else
      this._nodeElement.setAttribute('tabIndex', -1);
    if (this._preselected) {
      if (selectedByUser)
        this._nodeElement.focus();
      if (!this._inspected)
        this._axNode.highlightDOMNode();
      else
        SDK.OverlayModel.hideDOMNodeHighlight();
    }
  }

  /**
   * @param {boolean} hovered
   */
  setHovered(hovered) {
    if (this._hovered === hovered)
      return;
    this._hovered = hovered;
    this._nodeElement.classList.toggle('hovered', hovered);
    if (this._hovered) {
      this._nodeElement.classList.toggle('hovered', true);
      this._axNode.highlightDOMNode();
    }
  }

  /**
   * @return {!Accessibility.AccessibilityNode}
   */
  axNode() {
    return this._axNode;
  }

  /**
   * @return {boolean}
   */
  inspected() {
    return this._inspected;
  }

  /**
   * @return {boolean}
   */
  isDOMNode() {
    return this._axNode.isDOMNode();
  }

  /**
   * @return {?Accessibility.AXBreadcrumb}
   */
  nextBreadcrumb() {
    if (this._children.length)
      return this._children[0];
    const nextSibling = this.element().nextSibling;
    if (nextSibling)
      return nextSibling.breadcrumb;
    return null;
  }

  /**
   * @return {?Accessibility.AXBreadcrumb}
   */
  previousBreadcrumb() {
    const previousSibling = this.element().previousSibling;
    if (previousSibling)
      return previousSibling.breadcrumb;

    return this._parent;
  }

  /**
   * @param {string} name
   */
  _appendNameElement(name) {
    const nameElement = createElement('span');
    nameElement.textContent = '"' + name + '"';
    nameElement.classList.add('ax-readable-string');
    this._nodeWrapper.appendChild(nameElement);
  }

  /**
   * @param {?Protocol.Accessibility.AXValue} role
   */
  _appendRoleElement(role) {
    if (!role)
      return;

    const roleElement = createElementWithClass('span', 'monospace');
    roleElement.classList.add(Accessibility.AXBreadcrumb.RoleStyles[role.type]);
    roleElement.setTextContentTruncatedIfNeeded(role.value || '');

    this._nodeWrapper.appendChild(roleElement);
  }

  _appendIgnoredNodeElement() {
    const ignoredNodeElement = createElementWithClass('span', 'monospace');
    ignoredNodeElement.textContent = ls`Ignored`;
    ignoredNodeElement.classList.add('ax-breadcrumbs-ignored-node');
    this._nodeWrapper.appendChild(ignoredNodeElement);
  }
};

/** @type {!Object<string, string>} */
Accessibility.AXBreadcrumb.RoleStyles = {
  internalRole: 'ax-internal-role',
  role: 'ax-role',
};
