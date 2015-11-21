// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.ThrottledWidget}
 */
WebInspector.AccessibilitySidebarView = function()
{
    WebInspector.ThrottledWidget.call(this);
    this._computedTextSubPane = null;
    this._axNodeSubPane = null;
    this._node = null;
    this._sidebarPaneStack = null;
    WebInspector.context.addFlavorChangeListener(WebInspector.DOMNode, this._pullNode, this);
    this._pullNode();
}

WebInspector.AccessibilitySidebarView.prototype = {
    /**
     * @return {?WebInspector.DOMNode}
     */
    node: function()
    {
        return this._node;
    },

    /**
     * @override
     * @protected
     * @return {!Promise.<?>}
     */
    doUpdate: function()
    {
        /**
         * @param {?AccessibilityAgent.AXNode} accessibilityNode
         * @this {WebInspector.AccessibilitySidebarView}
         */
        function accessibilityNodeCallback(accessibilityNode)
        {
            if (this._computedTextSubPane)
                this._computedTextSubPane.setAXNode(accessibilityNode);
            if (this._axNodeSubPane)
                this._axNodeSubPane.setAXNode(accessibilityNode);
        }
        var node = this.node();
        return WebInspector.AccessibilityModel.fromTarget(node.target()).getAXNode(node.id)
            .then(accessibilityNodeCallback.bind(this))
    },

    /**
     * @override
     */
    wasShown: function()
    {
        WebInspector.ThrottledWidget.prototype.wasShown.call(this);

        if (!this._sidebarPaneStack) {
            this._computedTextSubPane = new WebInspector.AXComputedTextSubPane();
            this._computedTextSubPane.setNode(this.node());
            this._computedTextSubPane.show(this.element);
            this._computedTextSubPane.expand();

            this._axNodeSubPane = new WebInspector.AXNodeSubPane();
            this._axNodeSubPane.setNode(this.node());
            this._axNodeSubPane.show(this.element);
            this._axNodeSubPane.expand();

            this._sidebarPaneStack = new WebInspector.SidebarPaneStack();
            this._sidebarPaneStack.element.classList.add("flex-auto");
            this._sidebarPaneStack.show(this.element);
            this._sidebarPaneStack.addPane(this._computedTextSubPane);
            this._sidebarPaneStack.addPane(this._axNodeSubPane);
        }

        WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrModified, this._onAttrChange, this);
        WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrRemoved, this._onAttrChange, this);
        WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.CharacterDataModified, this._onNodeChange, this);
        WebInspector.targetManager.addModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.ChildNodeCountUpdated, this._onNodeChange, this);
    },

    /**
     * @override
     */
    willHide: function()
    {
        WebInspector.targetManager.removeModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrModified, this._onAttrChange, this);
        WebInspector.targetManager.removeModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.AttrRemoved, this._onAttrChange, this);
        WebInspector.targetManager.removeModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.CharacterDataModified, this._onNodeChange, this);
        WebInspector.targetManager.removeModelListener(WebInspector.DOMModel, WebInspector.DOMModel.Events.ChildNodeCountUpdated, this._onNodeChange, this);
    },

    _pullNode: function()
    {
        this._node = WebInspector.context.flavor(WebInspector.DOMNode);
        if (this._computedTextSubPane)
            this._computedTextSubPane.setNode(this._node);
        if (this._axNodeSubPane)
            this._axNodeSubPane.setNode(this._node);
        this.update();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onAttrChange: function(event)
    {
        if (!this.node())
            return;
        var node = event.data.node;
        if (this.node() !== node)
            return;
        this.update();
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _onNodeChange: function(event)
    {
        if (!this.node())
            return;
        var node = event.data;
        if (this.node() !== node)
            return;
        this.update();
    },


    __proto__: WebInspector.ThrottledWidget.prototype
};

/**
 * @param {string} tooltip
 * @return {!Element}
 */
WebInspector.AccessibilitySidebarView.createExclamationMark = function(tooltip)
{
    var exclamationElement = createElement("label", "dt-icon-label");
    exclamationElement.type = "warning-icon";
    exclamationElement.title = tooltip;
    return exclamationElement;
};

/**
 * @constructor
 * @extends {WebInspector.SidebarPane}
 * @param {string} name
 */
WebInspector.AccessibilitySubPane = function(name)
{
    WebInspector.SidebarPane.call(this, name);

    this._axNode = null;
    this.registerRequiredCSS("accessibility/accessibilityNode.css");
}

WebInspector.AccessibilitySubPane.prototype = {
    /**
     * @param {?AccessibilityAgent.AXNode} axNode
     * @protected
     */
    setAXNode: function(axNode)
    {
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    node: function()
    {
        return this._node;
    },

    /**
     * @param {?WebInspector.DOMNode} node
     */
    setNode: function(node)
    {
        this._node = node;
    },

    /**
     * @param {string} textContent
     * @param {string=} className
     * @return {!Element}
     */
    createInfo: function(textContent, className)
    {
        var classNameOrDefault = className || "info";
        var info = this.element.createChild("div", classNameOrDefault);
        info.textContent = textContent;
        return info;
    },

    /**
     * @param {string=} className
     * @return {!TreeOutline}
     */
    createTreeOutline: function(className)
    {
        var treeOutline = new TreeOutlineInShadow(className);
        treeOutline.registerRequiredCSS("accessibility/accessibilityNode.css");
        treeOutline.registerRequiredCSS("components/objectValue.css");

        treeOutline.element.classList.add("hidden");
        this.element.appendChild(treeOutline.element);
        return treeOutline;
    },

    __proto__: WebInspector.SidebarPane.prototype
}

/**
 * @constructor
 * @extends {WebInspector.AccessibilitySubPane}
 */
WebInspector.AXComputedTextSubPane = function()
{
    WebInspector.AccessibilitySubPane.call(this, WebInspector.UIString("Computed Text"));

    this._computedTextElement = this.element.createChild("div", "ax-computed-text hidden");

    this._noTextInfo = this.createInfo(WebInspector.UIString("Node has no text alternative."));
    this._treeOutline = this.createTreeOutline();
};


WebInspector.AXComputedTextSubPane.prototype = {
    /**
     * @param {?AccessibilityAgent.AXNode} axNode
     * @override
     */
    setAXNode: function(axNode)
    {
        if (this._axNode === axNode)
            return;
        this._axNode = axNode;

        var treeOutline = this._treeOutline;
        treeOutline.removeChildren();
        var target = this.node().target();

        if (!axNode || axNode.ignored) {
            this._computedTextElement.classList.add("hidden");
            treeOutline.element.classList.add("hidden");

            this._noTextInfo.classList.remove("hidden");
            return;
        }
        this._computedTextElement.removeChildren();

        // TODO(aboxhall): include contents where appropriate (requires protocol change)
        this._computedTextElement.classList.toggle("hidden", !axNode.name || !axNode.name.value);
        if (axNode.name && axNode.name.value)
            this._computedTextElement.createChild("div").textContent = axNode.name.value;

        var foundProperty = false;
        /**
         * @param {!AccessibilityAgent.AXProperty} property
         */
        function addProperty(property)
        {
            foundProperty = true;
            treeOutline.appendChild(new WebInspector.AXNodePropertyTreePropertyElement(property, target));
        }

        if (axNode.value && axNode.value.type === AccessibilityAgent.AXValueType.String)
            addProperty(/** @type {!AccessibilityAgent.AXProperty} */ ({name: "value", value: axNode.value}));

        var propertiesArray = /** @type {!Array.<!AccessibilityAgent.AXProperty> } */ (axNode.properties);
        for (var property of propertiesArray) {
            if (property.name == AccessibilityAgent.AXWidgetAttributes.Valuetext) {
                addProperty(property);
                break;
            }
        }

        treeOutline.element.classList.toggle("hidden", !foundProperty)
        this._noTextInfo.classList.toggle("hidden", !treeOutline.element.classList.contains("hidden") || !this._computedTextElement.classList.contains("hidden"));
    },

    __proto__: WebInspector.AccessibilitySubPane.prototype
};

/**
 * @constructor
 * @extends {WebInspector.AccessibilitySubPane}
 */
WebInspector.AXNodeSubPane = function()
{
    WebInspector.AccessibilitySubPane.call(this, WebInspector.UIString("Accessibility Node"));

    this._noNodeInfo = this.createInfo(WebInspector.UIString("No accessibility node"));
    this._ignoredInfo = this.createInfo(WebInspector.UIString("Accessibility node not exposed"), "ax-ignored-info hidden");

    this._treeOutline = this.createTreeOutline();
    this._ignoredReasonsTree = this.createTreeOutline();
};


WebInspector.AXNodeSubPane.prototype = {
    /**
     * @param {?AccessibilityAgent.AXNode} axNode
     * @override
     */
    setAXNode: function(axNode)
    {
        if (this._axNode === axNode)
            return;
        this._axNode = axNode;

        var treeOutline = this._treeOutline;
        treeOutline.removeChildren();
        var ignoredReasons = this._ignoredReasonsTree;
        ignoredReasons.removeChildren();
        var target = this.node().target();

        if (!axNode) {
            treeOutline.element.classList.add("hidden");
            this._ignoredInfo.classList.add("hidden");
            ignoredReasons.element.classList.add("hidden");

            this._noNodeInfo.classList.remove("hidden");
            this.element.classList.add("ax-ignored-node-pane");

            return;
        } else if (axNode.ignored) {
            this._noNodeInfo.classList.add("hidden");
            treeOutline.element.classList.add("hidden");
            this.element.classList.add("ax-ignored-node-pane");

            this._ignoredInfo.classList.remove("hidden");
            ignoredReasons.element.classList.remove("hidden");
            /**
             * @param {!AccessibilityAgent.AXProperty} property
             */
            function addIgnoredReason(property)
            {
                ignoredReasons.appendChild(new WebInspector.AXNodeIgnoredReasonTreeElement(property, axNode, target));
            }
            var ignoredReasonsArray = /** @type {!Array.<!Object>} */(axNode.ignoredReasons);
            for (var reason of ignoredReasonsArray)
                addIgnoredReason(reason);
            if (!ignoredReasons.firstChild())
                ignoredReasons.element.classList.add("hidden");
            return;
        }
        this.element.classList.remove("ax-ignored-node-pane");

        this._ignoredInfo.classList.add("hidden");
        ignoredReasons.element.classList.add("hidden");
        this._noNodeInfo.classList.add("hidden");

        treeOutline.element.classList.remove("hidden");

        /**
         * @param {!AccessibilityAgent.AXProperty} property
         */
        function addProperty(property)
        {
            treeOutline.appendChild(new WebInspector.AXNodePropertyTreePropertyElement(property, target));
        }

        for (var propertyName of ["name", "description", "help", "value"]) {
            if (propertyName in axNode) {
                var defaultProperty = /** @type {!AccessibilityAgent.AXProperty} */ ({name: propertyName, value: axNode[propertyName]});
                addProperty(defaultProperty);
            }
        }

        var roleProperty = /** @type {!AccessibilityAgent.AXProperty} */ ({name: "role", value: axNode.role});
        addProperty(roleProperty);

        var propertyMap = {};
        var propertiesArray = /** @type {!Array.<!AccessibilityAgent.AXProperty>} */ (axNode.properties);
        for (var property of propertiesArray)
            propertyMap[property.name] = property;

        for (var propertySet of [AccessibilityAgent.AXWidgetAttributes, AccessibilityAgent.AXWidgetStates, AccessibilityAgent.AXGlobalStates, AccessibilityAgent.AXLiveRegionAttributes, AccessibilityAgent.AXRelationshipAttributes]) {
            for (var propertyKey in propertySet) {
                var property = propertySet[propertyKey];
                if (property in propertyMap)
                    addProperty(propertyMap[property]);
            }
        }
    },

    __proto__: WebInspector.AccessibilitySubPane.prototype
};

/**
 * @param {?AccessibilityAgent.AXValueType} type
 * @param {string} value
 * @return {!Element}
 */
WebInspector.AccessibilitySidebarView.createSimpleValueElement = function(type, value)
{
    var valueElement;
    var AXValueType = AccessibilityAgent.AXValueType;
    if (!type || type === AXValueType.ValueUndefined || type === AXValueType.ComputedString)
        valueElement = createElement("span");
    else
        valueElement = createElementWithClass("span", "monospace");
    var prefix;
    var valueText;
    var suffix;
    if (type === AXValueType.String || type === AXValueType.ComputedString || type === AXValueType.IdrefList || type === AXValueType.Idref) {
        prefix = "\"";
        // Render \n as a nice unicode cr symbol.
        valueText = value.replace(/\n/g, "\u21B5");
        suffix = "\"";
        valueElement._originalTextContent = "\"" + value + "\"";
    } else {
        valueText = String(value);
    }

    if (type && type in WebInspector.AXNodePropertyTreeElement.TypeStyles)
        valueElement.classList.add(WebInspector.AXNodePropertyTreeElement.TypeStyles[type]);

    valueElement.setTextContentTruncatedIfNeeded(valueText || "");
    if (prefix)
        valueElement.insertBefore(createTextNode(prefix), valueElement.firstChild);
    if (suffix)
        valueElement.createTextChild(suffix);

    valueElement.title = String(value) || "";

    return valueElement;
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {!WebInspector.Target} target
 */
WebInspector.AXNodePropertyTreeElement = function(target)
{
    this._target = target;

    // Pass an empty title, the title gets made later in onattach.
    TreeElement.call(this, "");
}

WebInspector.AXNodePropertyTreeElement.prototype = {
    /**
     * @param {string} name
     */
    appendNameElement: function(name)
    {
        var nameElement = createElement("span");
        var AXAttributes = WebInspector.AccessibilityStrings.AXAttributes;
        if (name in AXAttributes) {
            nameElement.textContent = WebInspector.UIString(AXAttributes[name].name);
            nameElement.title = AXAttributes[name].description;
            nameElement.classList.add("ax-readable-name");
        } else {
            nameElement.textContent = name;
            nameElement.classList.add("ax-name");
            nameElement.classList.add("monospace");
        }
        this.listItemElement.appendChild(nameElement);
    },

    /**
     * @param {!AccessibilityAgent.AXValue} value
     */
    appendValueElement: function(value)
    {
        var AXValueType = AccessibilityAgent.AXValueType;
        if (value.type === AXValueType.Idref || value.type === AXValueType.Node) {
            this.appendRelationshipValueElement(value);
            return;
        }
        if (value.type === AXValueType.IdrefList || value.type === AXValueType.NodeList) {
            this.appendRelatedNodeListValueElement(value);
            return;
        }
        if (value.sources) {
            var sources = value.sources;
            for (var i = 0; i < sources.length; i++) {
                var source = sources[i];
                var child = new WebInspector.AXValueSourceTreeElement(source, this._target);
                this.appendChild(child);
            }
        }
        var valueElement = WebInspector.AccessibilitySidebarView.createSimpleValueElement(value.type, String(value.value));
        this.listItemElement.appendChild(valueElement);
    },

    /**
     * @param {!AccessibilityAgent.AXValue} value
     */
    appendRelationshipValueElement: function(value)
    {
        var relatedNode = value.relatedNodes[0];
        var deferredNode = new WebInspector.DeferredDOMNode(this._target, relatedNode.backendNodeId);
        var valueElement = createElement("span");

        /**
         * @param {?WebInspector.DOMNode} node
         */
        function onNodeResolved(node)
        {
            valueElement.appendChild(WebInspector.DOMPresentationUtils.linkifyNodeReference(node));
            if (relatedNode.text) {
                var textElement = WebInspector.AccessibilitySidebarView.createSimpleValueElement(AccessibilityAgent.AXValueType.ComputedString, relatedNode.text);
                valueElement.appendChild(textElement);
            }
        }
        deferredNode.resolve(onNodeResolved);

        this.listItemElement.appendChild(valueElement);
    },

    /**
     * @param {!AccessibilityAgent.AXValue} value
     */
    appendRelatedNodeListValueElement: function(value)
    {
        var relatedNodes = value.relatedNodes;
        var numNodes = relatedNodes.length;
        var valueElement;
        if (value.type === AccessibilityAgent.AXValueType.IdrefList) {
            var idrefs = value.value.split(/\s/);
            for (var idref of idrefs) {
                var matchingNode = null;
                /**
                 * @param {!AccessibilityAgent.AXRelatedNode} relatedNode
                 * @return {boolean}
                 */
                function matchesIDRef(relatedNode)
                {
                    if (relatedNode.idref !== idref)
                        return false;
                    matchingNode = relatedNode;
                    return true;
                }
                relatedNodes.some(matchesIDRef);
                if (matchingNode) {
                    var relatedNode = /** @type {!AccessibilityAgent.AXRelatedNode} */ (matchingNode);
                    var backendNodeId = matchingNode.backendNodeId;
                    var deferredNode = new WebInspector.DeferredDOMNode(this._target, backendNodeId);
                    var child = new WebInspector.AXRelatedNodeTreeElement({ deferredNode: deferredNode, idref: idref }, relatedNode);
                    this.appendChild(child);
                } else {
                    this.appendChild(new WebInspector.AXRelatedNodeTreeElement({ idref: idref }));
                }
            }
            valueElement = WebInspector.AccessibilitySidebarView.createSimpleValueElement(value.type, String(value.value));
        } else {
            for (var i = 0; i < numNodes; i++) {
                var relatedNode = relatedNodes[i];
                var deferredNode = new WebInspector.DeferredDOMNode(this._target, relatedNode.backendNodeId);
                var child = new WebInspector.AXRelatedNodeTreeElement({ deferredNode: deferredNode }, relatedNode);
                this.appendChild(child);
            }
            var numNodesString = "(" + numNodes + (numNodes === 1 ? " node" : " nodes") + ")";
            valueElement = WebInspector.AccessibilitySidebarView.createSimpleValueElement(null, numNodesString);
        }
        if (relatedNodes.length <= 3)
            this.expand();
        else
            this.collapse();
        this.listItemElement.appendChild(valueElement);
    },

    __proto__: TreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.AXNodePropertyTreeElement}
 * @param {!AccessibilityAgent.AXProperty} property
 * @param {!WebInspector.Target} target
 */
WebInspector.AXNodePropertyTreePropertyElement = function(property, target)
{
    this._property = property;
    this.toggleOnClick = true;
    this.selectable = false;

    WebInspector.AXNodePropertyTreeElement.call(this, target);
}

WebInspector.AXNodePropertyTreePropertyElement.prototype = {
    /**
     * @override
     */
    onattach: function()
    {
        this._update();
    },

    _update: function()
    {
        this.listItemElement.removeChildren();

        this.appendNameElement(this._property.name);

        this.listItemElement.createChild("span", "separator").textContent = ": ";

        this.appendValueElement(this._property.value);
    },

    __proto__: WebInspector.AXNodePropertyTreeElement.prototype
}

/**
 * @constructor
 * @extends {WebInspector.AXNodePropertyTreeElement}
 * @param {!AccessibilityAgent.AXValueSource} source
 * @param {!WebInspector.Target} target
 */
WebInspector.AXValueSourceTreeElement = function(source, target)
{
    this._source = source;
    WebInspector.AXNodePropertyTreeElement.call(this, target);
}

WebInspector.AXValueSourceTreeElement.prototype = {
    /**
     * @override
     */
    onattach: function()
    {
        this._update();
    },

    /**
     * @param {!AccessibilityAgent.AXValueSource} source
     */
    appendSourceNameElement: function(source)
    {
        var nameElement = createElement("span");
        var AXValueSourceType = AccessibilityAgent.AXValueSourceType;
        var type = source.type;
        var name;
        switch (type) {
        case AXValueSourceType.Attribute:
        case AXValueSourceType.Placeholder:
        case AXValueSourceType.RelatedElement:
            if (source.nativeSource) {
                var AXNativeSourceTypes = WebInspector.AccessibilityStrings.AXNativeSourceTypes;
                var nativeSource = source.nativeSource;
                nameElement.textContent = WebInspector.UIString(AXNativeSourceTypes[nativeSource].name);
                nameElement.title = WebInspector.UIString(AXNativeSourceTypes[nativeSource].description);
                nameElement.classList.add("ax-readable-name");
                break;
            }
            nameElement.textContent = source.attribute;
            nameElement.classList.add("ax-name");
            nameElement.classList.add("monospace");
            break;
        default:
            var AXSourceTypes = WebInspector.AccessibilityStrings.AXSourceTypes;
            if (type in AXSourceTypes) {
                nameElement.textContent = WebInspector.UIString(AXSourceTypes[type].name);
                nameElement.title = WebInspector.UIString(AXSourceTypes[type].description);
                nameElement.classList.add("ax-readable-name");
            } else {
                console.warn(type, "not in AXSourceTypes");
                nameElement.textContent = WebInspector.UIString(type);
            }
        }
        this.listItemElement.appendChild(nameElement);
    },

    _update: function() {
        this.listItemElement.removeChildren();

        if (this._source.invalid) {
            var exclamationMark = WebInspector.AccessibilitySidebarView.createExclamationMark(WebInspector.UIString("Invalid source."));
            this.listItemElement.appendChild(exclamationMark);
            this.listItemElement.classList.add("ax-value-source-invalid");
        } else if (this._source.superseded) {
            this.listItemElement.classList.add("ax-value-source-unused");
        }

        this.appendSourceNameElement(this._source);

        this.listItemElement.createChild("span", "separator").textContent = ": ";

        if (this._source.value) {
            this.appendValueElement(this._source.value);
            if (this._source.superseded)
                this.listItemElement.classList.add("ax-value-source-superseded");
        } else {
            var valueElement = WebInspector.AccessibilitySidebarView.createSimpleValueElement(AccessibilityAgent.AXValueType.ValueUndefined, WebInspector.UIString("Not specified"));
            this.listItemElement.appendChild(valueElement);
            this.listItemElement.classList.add("ax-value-source-unused");
        }
    },

    __proto__: WebInspector.AXNodePropertyTreeElement.prototype
}

/**
 * @constructor
 * @extends {TreeElement}
 * @param {{deferredNode: (!WebInspector.DeferredDOMNode|undefined), idref: (string|undefined)}} node
 * @param {!AccessibilityAgent.AXRelatedNode=} value
 */
WebInspector.AXRelatedNodeTreeElement = function(node, value)
{
    this._deferredNode = node.deferredNode;
    this._idref = node.idref;
    this._value = value;

    TreeElement.call(this, "");
};

WebInspector.AXRelatedNodeTreeElement.prototype = {
    onattach: function()
    {
        this._update();
    },

    _update: function()
    {
        var valueElement;

        /**
         * @param {?WebInspector.DOMNode} node
         */
        function onNodeResolved(node)
        {
            valueElement.appendChild(WebInspector.DOMPresentationUtils.linkifyNodeReference(node));
        }
        if (this._deferredNode) {
            valueElement = createElement("span");
            this.listItemElement.appendChild(valueElement);
            this._deferredNode.resolve(onNodeResolved);
        } else if (this._idref) {
            this.listItemElement.classList.add("invalid");
            valueElement = WebInspector.AccessibilitySidebarView.createExclamationMark(WebInspector.UIString("No node with this ID."));
            valueElement.createTextChild(this._idref);
        }
        this.listItemElement.appendChild(valueElement);
        if (this._value && this._value.text) {
            var textElement = WebInspector.AccessibilitySidebarView.createSimpleValueElement(AccessibilityAgent.AXValueType.ComputedString, this._value.text);
            this.listItemElement.createTextChild(" ");
            this.listItemElement.appendChild(textElement);
        }
    },

    __proto__: TreeElement.prototype
};

/** @type {!Object<string, string>} */
WebInspector.AXNodePropertyTreeElement.TypeStyles = {
    attribute: "object-value-string",
    boolean: "object-value-boolean",
    booleanOrUndefined: "object-value-boolean",
    computedString: "ax-readable-string",
    idref: "object-value-string",
    idrefList: "object-value-string",
    integer: "object-value-number",
    internalRole: "ax-internal-role",
    number: "object-value-number",
    role: "ax-role",
    string: "object-value-string",
    tristate: "object-value-boolean",
    valueUndefined: "ax-value-undefined"
};

/**
 * @constructor
 * @extends {WebInspector.AXNodePropertyTreeElement}
 * @param {!AccessibilityAgent.AXProperty} property
 * @param {?AccessibilityAgent.AXNode} axNode
 * @param {!WebInspector.Target} target
 */
WebInspector.AXNodeIgnoredReasonTreeElement = function(property, axNode, target)
{
    this._property = property;
    this._axNode = axNode;

    WebInspector.AXNodePropertyTreeElement.call(this, target);
    this.toggleOnClick = true;
    this.selectable = false;
}

WebInspector.AXNodeIgnoredReasonTreeElement.prototype = {
    /**
     * @override
     */
    onattach: function()
    {
        this.listItemElement.removeChildren();

        this._reasonElement = WebInspector.AXNodeIgnoredReasonTreeElement.createReasonElement(this._property.name, this._axNode);
        this.listItemElement.appendChild(this._reasonElement);

        var value = this._property.value;
        if (value.type === AccessibilityAgent.AXValueType.Idref)
            this.appendRelationshipValueElement(value);
    },

    __proto__: WebInspector.AXNodePropertyTreeElement.prototype
};

/**
 * @param {?string} reason
 * @param {?AccessibilityAgent.AXNode} axNode
 * @return {?Element}
 */
WebInspector.AXNodeIgnoredReasonTreeElement.createReasonElement = function(reason, axNode)
{
    var reasonElement = null;
    switch(reason) {
    case "activeModalDialog":
        reasonElement = WebInspector.formatLocalized("Element is hidden by active modal dialog: ", [], "");
        break;
    case "ancestorDisallowsChild":
        reasonElement = WebInspector.formatLocalized("Element is not permitted as child of ", [], "");
        break;
    // http://www.w3.org/TR/wai-aria/roles#childrenArePresentational
    case "ancestorIsLeafNode":
        reasonElement = WebInspector.formatLocalized("Ancestor's children are all presentational: ", [], "");
        break;
    case "ariaHidden":
        var ariaHiddenSpan = createElement("span", "source-code").textContent = "aria-hidden";
        reasonElement = WebInspector.formatLocalized("Element is %s.", [ ariaHiddenSpan ], "");
        break;
    case "ariaHiddenRoot":
        var ariaHiddenSpan = createElement("span", "source-code").textContent = "aria-hidden";
        var trueSpan = createElement("span", "source-code").textContent = "true";
        reasonElement = WebInspector.formatLocalized("%s is %s on ancestor: ", [ ariaHiddenSpan, trueSpan ], "");
        break;
    case "emptyAlt":
        reasonElement = WebInspector.formatLocalized("Element has empty alt text.", [], "");
        break;
    case "emptyText":
        reasonElement = WebInspector.formatLocalized("No text content.", [], "");
        break;
    case "inert":
        reasonElement = WebInspector.formatLocalized("Element is inert.", [], "");
        break;
    case "inheritsPresentation":
        reasonElement = WebInspector.formatLocalized("Element inherits presentational role from ", [], "");
        break;
    case "labelContainer":
        reasonElement = WebInspector.formatLocalized("Part of label element: ", [], "");
        break;
    case "labelFor":
        reasonElement = WebInspector.formatLocalized("Label for ", [], "");
        break;
    case "notRendered":
        reasonElement = WebInspector.formatLocalized("Element is not rendered.", [], "");
        break;
    case "notVisible":
        reasonElement = WebInspector.formatLocalized("Element is not visible.", [], "");
        break;
    case "presentationalRole":
        var rolePresentationSpan = createElement("span", "source-code").textContent = "role=" + axNode.role.value;
        reasonElement = WebInspector.formatLocalized("Element has %s.", [ rolePresentationSpan ], "");
        break;
    case "probablyPresentational":
        reasonElement = WebInspector.formatLocalized("Element is presentational.", [], "");
        break;
    case "staticTextUsedAsNameFor":
        reasonElement = WebInspector.formatLocalized("Static text node is used as name for ", [], "");
        break;
    case "uninteresting":
        reasonElement = WebInspector.formatLocalized("Element not interesting for accessibility.", [], "")
        break;
    }
    if (reasonElement)
        reasonElement.classList.add("ax-reason");
    return reasonElement;
}
