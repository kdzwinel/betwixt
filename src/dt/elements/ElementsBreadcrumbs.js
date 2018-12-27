// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
Elements.ElementsBreadcrumbs = class extends UI.HBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('elements/breadcrumbs.css');

    this.crumbsElement = this.contentElement.createChild('div', 'crumbs');
    this.crumbsElement.addEventListener('mousemove', this._mouseMovedInCrumbs.bind(this), false);
    this.crumbsElement.addEventListener('mouseleave', this._mouseMovedOutOfCrumbs.bind(this), false);
    this._nodeSymbol = Symbol('node');

    UI.ARIAUtils.markAsHidden(this.element);
  }

  /**
   * @override
   */
  wasShown() {
    this.update();
  }

  /**
   * @param {!Array.<!SDK.DOMNode>} nodes
   */
  updateNodes(nodes) {
    if (!nodes.length)
      return;

    const crumbs = this.crumbsElement;
    for (let crumb = crumbs.firstChild; crumb; crumb = crumb.nextSibling) {
      if (nodes.indexOf(crumb[this._nodeSymbol]) !== -1) {
        this.update(true);
        return;
      }
    }
  }

  /**
   * @param {?SDK.DOMNode} node
   */
  setSelectedNode(node) {
    this._currentDOMNode = node;
    this.crumbsElement.window().requestAnimationFrame(() => this.update());
  }

  _mouseMovedInCrumbs(event) {
    const nodeUnderMouse = event.target;
    const crumbElement = nodeUnderMouse.enclosingNodeOrSelfWithClass('crumb');
    const node = /** @type {?SDK.DOMNode} */ (crumbElement ? crumbElement[this._nodeSymbol] : null);
    if (node)
      node.highlight();
  }

  _mouseMovedOutOfCrumbs(event) {
    if (this._currentDOMNode)
      SDK.OverlayModel.hideDOMNodeHighlight();
  }


  /**
   * @param {!Event} event
   * @this {Elements.ElementsBreadcrumbs}
   */
  _onClickCrumb(event) {
    event.preventDefault();
    let crumb = /** @type {!Element} */ (event.currentTarget);
    if (!crumb.classList.contains('collapsed')) {
      this.dispatchEventToListeners(Elements.ElementsBreadcrumbs.Events.NodeSelected, crumb[this._nodeSymbol]);
      return;
    }

    // Clicking a collapsed crumb will expose the hidden crumbs.
    if (crumb === this.crumbsElement.firstChild) {
      // If the clicked crumb is the first child, pick the farthest crumb
      // that is still hidden. This allows the user to expose every crumb.
      let currentCrumb = crumb;
      while (currentCrumb) {
        const hidden = currentCrumb.classList.contains('hidden');
        const collapsed = currentCrumb.classList.contains('collapsed');
        if (!hidden && !collapsed)
          break;
        crumb = currentCrumb;
        currentCrumb = currentCrumb.nextSiblingElement;
      }
    }

    this.updateSizes(crumb);
  }

  /**
   * @param {!SDK.DOMNode} domNode
   * @return {?string}
   */
  _determineElementTitle(domNode) {
    switch (domNode.nodeType()) {
      case Node.ELEMENT_NODE:
        if (domNode.pseudoType())
          return '::' + domNode.pseudoType();
        return null;
      case Node.TEXT_NODE:
        return Common.UIString('(text)');
      case Node.COMMENT_NODE:
        return '<!-->';
      case Node.DOCUMENT_TYPE_NODE:
        return '<!doctype>';
      case Node.DOCUMENT_FRAGMENT_NODE:
        return domNode.shadowRootType() ? '#shadow-root' : domNode.nodeNameInCorrectCase();
      default:
        return domNode.nodeNameInCorrectCase();
    }
  }

  /**
   * @param {boolean=} force
   */
  update(force) {
    if (!this.isShowing())
      return;

    const currentDOMNode = this._currentDOMNode;
    const crumbs = this.crumbsElement;

    let handled = false;
    let crumb = crumbs.firstChild;
    while (crumb) {
      if (crumb[this._nodeSymbol] === currentDOMNode) {
        crumb.classList.add('selected');
        handled = true;
      } else {
        crumb.classList.remove('selected');
      }

      crumb = crumb.nextSibling;
    }

    if (handled && !force) {
      // We don't need to rebuild the crumbs, but we need to adjust sizes
      // to reflect the new focused or root node.
      this.updateSizes();
      return;
    }

    crumbs.removeChildren();

    for (let current = currentDOMNode; current; current = current.parentNode) {
      if (current.nodeType() === Node.DOCUMENT_NODE)
        continue;

      crumb = createElementWithClass('span', 'crumb');
      crumb[this._nodeSymbol] = current;
      crumb.addEventListener('mousedown', this._onClickCrumb.bind(this), false);

      const crumbTitle = this._determineElementTitle(current);
      if (crumbTitle) {
        const nameElement = createElement('span');
        nameElement.textContent = crumbTitle;
        crumb.appendChild(nameElement);
        crumb.title = crumbTitle;
      } else {
        Elements.DOMLinkifier.decorateNodeLabel(current, crumb);
      }

      if (current === currentDOMNode)
        crumb.classList.add('selected');
      crumbs.insertBefore(crumb, crumbs.firstChild);
    }

    this.updateSizes();
  }

  /**
   * @param {!Element=} focusedCrumb
   * @return {{selectedIndex: number, focusedIndex: number, selectedCrumb: ?Element}}
   */
  _resetCrumbStylesAndFindSelections(focusedCrumb) {
    const crumbs = this.crumbsElement;
    let selectedIndex = 0;
    let focusedIndex = 0;
    let selectedCrumb = null;

    // Reset crumb styles.
    for (let i = 0; i < crumbs.childNodes.length; ++i) {
      const crumb = crumbs.children[i];
      // Find the selected crumb and index.
      if (!selectedCrumb && crumb.classList.contains('selected')) {
        selectedCrumb = crumb;
        selectedIndex = i;
      }

      // Find the focused crumb index.
      if (crumb === focusedCrumb)
        focusedIndex = i;

      crumb.classList.remove('compact', 'collapsed', 'hidden');
    }

    return {selectedIndex: selectedIndex, focusedIndex: focusedIndex, selectedCrumb: selectedCrumb};
  }

  /**
   * @return {{normal: !Array.<number>, compact: !Array.<number>, collapsed: number, available: number}}
   */
  _measureElementSizes() {
    const crumbs = this.crumbsElement;

    // Layout 1: Measure total and normal crumb sizes at the same time as a
    // dummy element for the collapsed size.
    const collapsedElement = createElementWithClass('span', 'crumb collapsed');
    crumbs.insertBefore(collapsedElement, crumbs.firstChild);

    const available = crumbs.offsetWidth;
    const collapsed = collapsedElement.offsetWidth;

    const normalSizes = [];
    for (let i = 1; i < crumbs.childNodes.length; ++i) {
      const crumb = crumbs.childNodes[i];
      normalSizes[i - 1] = crumb.offsetWidth;
    }

    crumbs.removeChild(collapsedElement);

    // Layout 2: Measure collapsed crumb sizes
    const compactSizes = [];
    for (let i = 0; i < crumbs.childNodes.length; ++i) {
      const crumb = crumbs.childNodes[i];
      crumb.classList.add('compact');
    }
    for (let i = 0; i < crumbs.childNodes.length; ++i) {
      const crumb = crumbs.childNodes[i];
      compactSizes[i] = crumb.offsetWidth;
    }

    // Clean up.
    for (let i = 0; i < crumbs.childNodes.length; ++i) {
      const crumb = crumbs.childNodes[i];
      crumb.classList.remove('compact', 'collapsed');
    }

    return {normal: normalSizes, compact: compactSizes, collapsed: collapsed, available: available};
  }

  /**
   * @param {!Element=} focusedCrumb
   */
  updateSizes(focusedCrumb) {
    if (!this.isShowing())
      return;

    const crumbs = this.crumbsElement;
    if (!crumbs.firstChild)
      return;

    const selections = this._resetCrumbStylesAndFindSelections(focusedCrumb);
    const sizes = this._measureElementSizes();
    const selectedIndex = selections.selectedIndex;
    const focusedIndex = selections.focusedIndex;
    const selectedCrumb = selections.selectedCrumb;

    function crumbsAreSmallerThanContainer() {
      let totalSize = 0;
      for (let i = 0; i < crumbs.childNodes.length; ++i) {
        const crumb = crumbs.childNodes[i];
        if (crumb.classList.contains('hidden'))
          continue;
        if (crumb.classList.contains('collapsed')) {
          totalSize += sizes.collapsed;
          continue;
        }
        totalSize += crumb.classList.contains('compact') ? sizes.compact[i] : sizes.normal[i];
      }
      const rightPadding = 10;
      return totalSize + rightPadding < sizes.available;
    }

    if (crumbsAreSmallerThanContainer())
      return;  // No need to compact the crumbs, they all fit at full size.

    const BothSides = 0;
    const AncestorSide = -1;
    const ChildSide = 1;

    /**
     * @param {function(!Element)} shrinkingFunction
     * @param {number} direction
     */
    function makeCrumbsSmaller(shrinkingFunction, direction) {
      const significantCrumb = focusedCrumb || selectedCrumb;
      const significantIndex = significantCrumb === selectedCrumb ? selectedIndex : focusedIndex;

      function shrinkCrumbAtIndex(index) {
        const shrinkCrumb = crumbs.children[index];
        if (shrinkCrumb && shrinkCrumb !== significantCrumb)
          shrinkingFunction(shrinkCrumb);
        if (crumbsAreSmallerThanContainer())
          return true;  // No need to compact the crumbs more.
        return false;
      }

      // Shrink crumbs one at a time by applying the shrinkingFunction until the crumbs
      // fit in the container or we run out of crumbs to shrink.
      if (direction) {
        // Crumbs are shrunk on only one side (based on direction) of the signifcant crumb.
        let index = (direction > 0 ? 0 : crumbs.childNodes.length - 1);
        while (index !== significantIndex) {
          if (shrinkCrumbAtIndex(index))
            return true;
          index += (direction > 0 ? 1 : -1);
        }
      } else {
        // Crumbs are shrunk in order of descending distance from the signifcant crumb,
        // with a tie going to child crumbs.
        let startIndex = 0;
        let endIndex = crumbs.childNodes.length - 1;
        while (startIndex !== significantIndex || endIndex !== significantIndex) {
          const startDistance = significantIndex - startIndex;
          const endDistance = endIndex - significantIndex;
          let index;
          if (startDistance >= endDistance)
            index = startIndex++;
          else
            index = endIndex--;
          if (shrinkCrumbAtIndex(index))
            return true;
        }
      }

      // We are not small enough yet, return false so the caller knows.
      return false;
    }

    function coalesceCollapsedCrumbs() {
      let crumb = crumbs.firstChild;
      let collapsedRun = false;
      let newStartNeeded = false;
      let newEndNeeded = false;
      while (crumb) {
        const hidden = crumb.classList.contains('hidden');
        if (!hidden) {
          const collapsed = crumb.classList.contains('collapsed');
          if (collapsedRun && collapsed) {
            crumb.classList.add('hidden');
            crumb.classList.remove('compact');
            crumb.classList.remove('collapsed');

            if (crumb.classList.contains('start')) {
              crumb.classList.remove('start');
              newStartNeeded = true;
            }

            if (crumb.classList.contains('end')) {
              crumb.classList.remove('end');
              newEndNeeded = true;
            }

            continue;
          }

          collapsedRun = collapsed;

          if (newEndNeeded) {
            newEndNeeded = false;
            crumb.classList.add('end');
          }
        } else {
          collapsedRun = true;
        }
        crumb = crumb.nextSibling;
      }

      if (newStartNeeded) {
        crumb = crumbs.lastChild;
        while (crumb) {
          if (!crumb.classList.contains('hidden')) {
            crumb.classList.add('start');
            break;
          }
          crumb = crumb.previousSibling;
        }
      }
    }

    /**
     * @param {!Element} crumb
     */
    function compact(crumb) {
      if (crumb.classList.contains('hidden'))
        return;
      crumb.classList.add('compact');
    }

    /**
     * @param {!Element} crumb
     * @param {boolean=} dontCoalesce
     */
    function collapse(crumb, dontCoalesce) {
      if (crumb.classList.contains('hidden'))
        return;
      crumb.classList.add('collapsed');
      crumb.classList.remove('compact');
      if (!dontCoalesce)
        coalesceCollapsedCrumbs();
    }

    if (!focusedCrumb) {
      // When not focused on a crumb we can be biased and collapse less important
      // crumbs that the user might not care much about.

      // Compact child crumbs.
      if (makeCrumbsSmaller(compact, ChildSide))
        return;

      // Collapse child crumbs.
      if (makeCrumbsSmaller(collapse, ChildSide))
        return;
    }

    // Compact ancestor crumbs, or from both sides if focused.
    if (makeCrumbsSmaller(compact, focusedCrumb ? BothSides : AncestorSide))
      return;

    // Collapse ancestor crumbs, or from both sides if focused.
    if (makeCrumbsSmaller(collapse, focusedCrumb ? BothSides : AncestorSide))
      return;

    if (!selectedCrumb)
      return;

    // Compact the selected crumb.
    compact(selectedCrumb);
    if (crumbsAreSmallerThanContainer())
      return;

    // Collapse the selected crumb as a last resort. Pass true to prevent coalescing.
    collapse(selectedCrumb, true);
  }
};

/** @enum {symbol} */
Elements.ElementsBreadcrumbs.Events = {
  NodeSelected: Symbol('NodeSelected')
};
