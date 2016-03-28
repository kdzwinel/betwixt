// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @param {!WebInspector.SectionCascade} cascade
 * @param {?WebInspector.CSSRule} rule
 * @param {!WebInspector.CSSStyleDeclaration} style
 * @param {string} customSelectorText
 * @param {?WebInspector.DOMNode=} inheritedFromNode
 */
WebInspector.StylesSectionModel = function(cascade, rule, style, customSelectorText, inheritedFromNode)
{
    this._cascade = cascade;
    this._rule = rule;
    this._style = style;
    this._customSelectorText = customSelectorText;
    this._editable = !!(this._style && this._style.styleSheetId);
    this._inheritedFromNode = inheritedFromNode || null;
}

WebInspector.StylesSectionModel.prototype = {
    /**
     * @return {!WebInspector.SectionCascade}
     */
    cascade: function()
    {
        return this._cascade;
    },

    /**
     * @return {boolean}
     */
    hasMatchingSelectors: function()
    {
        return this.rule() ? this.rule().matchingSelectors.length > 0 && this.mediaMatches() : true;
    },

    /**
     * @return {boolean}
     */
    mediaMatches: function()
    {
        var media = this.media();
        for (var i = 0; media && i < media.length; ++i) {
            if (!media[i].active())
                return false;
        }
        return true;
    },

    /**
     * @return {boolean}
     */
    inherited: function()
    {
        return !!this._inheritedFromNode;
    },

    /**
     * @return {?WebInspector.DOMNode}
     */
    parentNode: function()
    {
        return this._inheritedFromNode;
    },

    /**
     * @return {string}
     */
    selectorText: function()
    {
        if (this._customSelectorText)
            return this._customSelectorText;
        return this.rule() ? this.rule().selectorText() : "";
    },

    /**
     * @return {boolean}
     */
    editable: function()
    {
        return this._editable;
    },

    /**
     * @param {boolean} editable
     */
    setEditable: function(editable)
    {
        this._editable = editable;
    },

    /**
     * @return {!WebInspector.CSSStyleDeclaration}
     */
    style: function()
    {
        return this._style;
    },

    /**
     * @return {?WebInspector.CSSRule}
     */
    rule: function()
    {
        return this._rule;
    },

    /**
     * @return {?Array.<!WebInspector.CSSMedia>}
     */
    media: function()
    {
        return this.rule() ? this.rule().media : null;
    },

    resetCachedData: function()
    {
        this._cascade._resetUsedProperties();
    }
}

/**
 * @constructor
 */
WebInspector.SectionCascade = function()
{
    this._models = [];
    this._resetUsedProperties();
}

WebInspector.SectionCascade.prototype = {
    /**
     * @return {!Array.<!WebInspector.StylesSectionModel>}
     */
    sectionModels: function()
    {
        return this._models;
    },

    /**
     * @param {!WebInspector.CSSRule} rule
     * @param {!WebInspector.StylesSectionModel} insertAfterStyleRule
     * @return {!WebInspector.StylesSectionModel}
     */
    insertModelFromRule: function(rule, insertAfterStyleRule)
    {
        return this._insertModel(new WebInspector.StylesSectionModel(this, rule, rule.style, "", null), insertAfterStyleRule);
    },

    /**
     * @param {!WebInspector.CSSStyleDeclaration} style
     * @param {string} selectorText
     * @param {?WebInspector.DOMNode=} inheritedFromNode
     * @return {!WebInspector.StylesSectionModel}
     */
    appendModelFromStyle: function(style, selectorText, inheritedFromNode)
    {
        return this._insertModel(new WebInspector.StylesSectionModel(this, style.parentRule, style, selectorText, inheritedFromNode));
    },

    /**
     * @param {!WebInspector.StylesSectionModel} model
     * @param {!WebInspector.StylesSectionModel=} insertAfter
     * @return {!WebInspector.StylesSectionModel}
     */
    _insertModel: function(model, insertAfter)
    {
        if (insertAfter) {
            var index = this._models.indexOf(insertAfter);
            console.assert(index !== -1, "The insertAfter anchor could not be found in cascade");
            this._models.splice(index + 1, 0, model);
        } else {
            this._models.push(model);
        }
        this._resetUsedProperties();
        return model;
    },

    /**
     * @param {!WebInspector.CSSProperty} property
     * @return {?WebInspector.SectionCascade.PropertyState}
     */
    propertyState: function(property)
    {
        if (this._propertiesState.size === 0)
            this._propertiesState = WebInspector.SectionCascade._computeUsedProperties(this._models);
        return this._propertiesState.get(property) || null;
    },

    _resetUsedProperties: function()
    {
        /** @type {!Map<!WebInspector.CSSProperty, !WebInspector.SectionCascade.PropertyState>} */
        this._propertiesState = new Map();
    }
}

/**
 * @param {!Array.<!WebInspector.StylesSectionModel>} styleRules
 * @return {!Map<!WebInspector.CSSProperty, !WebInspector.SectionCascade.PropertyState>}
 */
WebInspector.SectionCascade._computeUsedProperties = function(styleRules)
{
    /** @type {!Set.<string>} */
    var foundImportantProperties = new Set();
    /** @type {!Map.<string, !Map<string, !WebInspector.CSSProperty>>} */
    var propertyToEffectiveRule = new Map();
    /** @type {!Map.<string, !WebInspector.DOMNode>} */
    var inheritedPropertyToNode = new Map();
    /** @type {!Set<string>} */
    var allUsedProperties = new Set();
    var result = new Map();
    for (var i = 0; i < styleRules.length; ++i) {
        var styleRule = styleRules[i];
        if (!styleRule.hasMatchingSelectors())
            continue;

        /** @type {!Map<string, !WebInspector.CSSProperty>} */
        var styleActiveProperties = new Map();
        var style = styleRule.style();
        var allProperties = style.allProperties;
        for (var j = 0; j < allProperties.length; ++j) {
            var property = allProperties[j];

            // Do not pick non-inherited properties from inherited styles.
            if (styleRule.inherited() && !WebInspector.CSSMetadata.isPropertyInherited(property.name))
                continue;

            if (!property.activeInStyle()) {
                result.set(property, WebInspector.SectionCascade.PropertyState.Overloaded);
                continue;
            }

            var canonicalName = WebInspector.CSSMetadata.canonicalPropertyName(property.name);
            if (foundImportantProperties.has(canonicalName)) {
                result.set(property, WebInspector.SectionCascade.PropertyState.Overloaded);
                continue;
            }

            if (!property.important && allUsedProperties.has(canonicalName)) {
                result.set(property, WebInspector.SectionCascade.PropertyState.Overloaded);
                continue;
            }

            var isKnownProperty = propertyToEffectiveRule.has(canonicalName);
            var parentNode = styleRule.parentNode();
            if (!isKnownProperty && parentNode && !inheritedPropertyToNode.has(canonicalName))
                inheritedPropertyToNode.set(canonicalName, parentNode);

            if (property.important) {
                if (styleRule.inherited() && isKnownProperty && styleRule.parentNode() !== inheritedPropertyToNode.get(canonicalName)) {
                    result.set(property, WebInspector.SectionCascade.PropertyState.Overloaded);
                    continue;
                }

                foundImportantProperties.add(canonicalName);
                if (isKnownProperty) {
                    var overloaded = propertyToEffectiveRule.get(canonicalName).get(canonicalName);
                    result.set(overloaded, WebInspector.SectionCascade.PropertyState.Overloaded);
                    propertyToEffectiveRule.get(canonicalName).delete(canonicalName);
                }
            }

            styleActiveProperties.set(canonicalName, property);
            allUsedProperties.add(canonicalName);
            propertyToEffectiveRule.set(canonicalName, styleActiveProperties);
            result.set(property, WebInspector.SectionCascade.PropertyState.Active);
        }

        // If every longhand of the shorthand is not active, then the shorthand is not active too.
        for (var property of style.leadingProperties()) {
            var canonicalName = WebInspector.CSSMetadata.canonicalPropertyName(property.name);
            if (!styleActiveProperties.has(canonicalName))
                continue;
            var longhands = style.longhandProperties(property.name);
            if (!longhands.length)
                continue;
            var notUsed = true;
            for (var longhand of longhands) {
                var longhandCanonicalName = WebInspector.CSSMetadata.canonicalPropertyName(longhand.name);
                notUsed = notUsed && !styleActiveProperties.has(longhandCanonicalName);
            }
            if (!notUsed)
                continue;
            styleActiveProperties.delete(canonicalName);
            allUsedProperties.delete(canonicalName);
            result.set(property, WebInspector.SectionCascade.PropertyState.Overloaded);
        }
    }
    return result;
}

/** @enum {string} */
WebInspector.SectionCascade.PropertyState = {
    Active: "Active",
    Overloaded: "Overloaded"
}