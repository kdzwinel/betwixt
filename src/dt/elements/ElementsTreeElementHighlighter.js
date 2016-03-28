// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!WebInspector.ElementsTreeOutline} treeOutline
 */
WebInspector.ElementsTreeElementHighlighter = function(treeOutline)
{
    this._throttler = new WebInspector.Throttler(100);
    this._treeOutline = treeOutline;
    this._treeOutline.addEventListener(TreeOutline.Events.ElementExpanded, this._clearState, this);
    this._treeOutline.addEventListener(TreeOutline.Events.ElementCollapsed, this._clearState, this);
    this._treeOutline.addEventListener(WebInspector.ElementsTreeOutline.Events.SelectedNodeChanged, this._clearState, this);
    WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.NodeHighlightedInOverlay, this._highlightNode, this);
    this._treeOutline.domModel().addEventListener(WebInspector.DOMModel.Events.InspectModeWillBeToggled, this._clearState, this);
}

WebInspector.ElementsTreeElementHighlighter.prototype = {
    /**
     * @param {!WebInspector.Event} event
     */
    _highlightNode: function(event)
    {
        var domNode = /** @type {!WebInspector.DOMNode} */ (event.data);

        this._throttler.schedule(callback.bind(this));
        this._pendingHighlightNode = this._treeOutline.domModel() === domNode.domModel() ? domNode : null;

        /**
         * @this {WebInspector.ElementsTreeElementHighlighter}
         */
        function callback()
        {
            this._highlightNodeInternal(this._pendingHighlightNode);
            delete this._pendingHighlightNode;
            return Promise.resolve();
        }
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    _highlightNodeInternal: function(node)
    {
        this._isModifyingTreeOutline = true;
        var treeElement = null;

        if (this._currentHighlightedElement) {
            var currentTreeElement = this._currentHighlightedElement;
            while (currentTreeElement !== this._alreadyExpandedParentElement) {
                if (currentTreeElement.expanded)
                    currentTreeElement.collapse();

                currentTreeElement = currentTreeElement.parent;
            }
        }

        delete this._currentHighlightedElement;
        delete this._alreadyExpandedParentElement;
        if (node) {
            var deepestExpandedParent = node;
            var treeElementSymbol = this._treeOutline.treeElementSymbol();
            while (deepestExpandedParent && (!deepestExpandedParent[treeElementSymbol] || !deepestExpandedParent[treeElementSymbol].expanded))
                deepestExpandedParent = deepestExpandedParent.parentNode;

            this._alreadyExpandedParentElement = deepestExpandedParent ? deepestExpandedParent[treeElementSymbol] : this._treeOutline.rootElement();
            treeElement = this._treeOutline.createTreeElementFor(node);
        }

        this._currentHighlightedElement = treeElement;
        this._treeOutline.setHoverEffect(treeElement);
        if (treeElement)
            treeElement.reveal();

        this._isModifyingTreeOutline = false;
    },

    _clearState: function()
    {
        if (this._isModifyingTreeOutline)
            return;

        delete this._currentHighlightedElement;
        delete this._alreadyExpandedParentElement;
        delete this._pendingHighlightNode;
    }

}