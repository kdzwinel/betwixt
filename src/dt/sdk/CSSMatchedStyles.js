// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
SDK.CSSMatchedStyles = class {
  /**
   * @param {!SDK.CSSModel} cssModel
   * @param {!SDK.DOMNode} node
   * @param {?Protocol.CSS.CSSStyle} inlinePayload
   * @param {?Protocol.CSS.CSSStyle} attributesPayload
   * @param {!Array.<!Protocol.CSS.RuleMatch>} matchedPayload
   * @param {!Array.<!Protocol.CSS.PseudoElementMatches>} pseudoPayload
   * @param {!Array.<!Protocol.CSS.InheritedStyleEntry>} inheritedPayload
   * @param {!Array.<!Protocol.CSS.CSSKeyframesRule>} animationsPayload
   */
  constructor(
      cssModel,
      node,
      inlinePayload,
      attributesPayload,
      matchedPayload,
      pseudoPayload,
      inheritedPayload,
      animationsPayload) {
    this._cssModel = cssModel;
    this._node = node;
    /** @type {!Map<!SDK.CSSStyleDeclaration, !SDK.DOMNode>} */
    this._addedStyles = new Map();
    /** @type {!Map<!Protocol.DOM.NodeId, !Map<string, boolean>>} */
    this._matchingSelectors = new Map();
    this._keyframes = [];
    if (animationsPayload)
      this._keyframes = animationsPayload.map(rule => new SDK.CSSKeyframesRule(cssModel, rule));

    /** @type {!Map<!SDK.CSSStyleDeclaration, ?SDK.DOMNode>} */
    this._nodeForStyle = new Map();
    /** @type {!Set<!SDK.CSSStyleDeclaration>} */
    this._inheritedStyles = new Set();
    this._mainDOMCascade = this._buildMainCascade(inlinePayload, attributesPayload, matchedPayload, inheritedPayload);
    this._pseudoDOMCascades = this._buildPseudoCascades(pseudoPayload);

    /** @type {!Map<!SDK.CSSStyleDeclaration, !SDK.CSSMatchedStyles.DOMInheritanceCascade>} */
    this._styleToDOMCascade = new Map();
    for (const domCascade of Array.from(this._pseudoDOMCascades.values()).concat(this._mainDOMCascade)) {
      for (const style of domCascade.styles())
        this._styleToDOMCascade.set(style, domCascade);
    }
  }

  /**
   * @param {?Protocol.CSS.CSSStyle} inlinePayload
   * @param {?Protocol.CSS.CSSStyle} attributesPayload
   * @param {!Array.<!Protocol.CSS.RuleMatch>} matchedPayload
   * @param {!Array.<!Protocol.CSS.InheritedStyleEntry>} inheritedPayload
   * @return {!SDK.CSSMatchedStyles.DOMInheritanceCascade}
   */
  _buildMainCascade(inlinePayload, attributesPayload, matchedPayload, inheritedPayload) {
    /** @type {!Array<!SDK.CSSMatchedStyles.NodeCascade>} */
    const nodeCascades = [];

    /** @type {!Array<!SDK.CSSStyleDeclaration>} */
    const nodeStyles = [];

    /**
     * @this {SDK.CSSMatchedStyles}
     */
    function addAttributesStyle() {
      if (!attributesPayload)
        return;
      const style =
          new SDK.CSSStyleDeclaration(this._cssModel, null, attributesPayload, SDK.CSSStyleDeclaration.Type.Attributes);
      this._nodeForStyle.set(style, this._node);
      nodeStyles.push(style);
    }

    // Inline style has the greatest specificity.
    if (inlinePayload && this._node.nodeType() === Node.ELEMENT_NODE) {
      const style =
          new SDK.CSSStyleDeclaration(this._cssModel, null, inlinePayload, SDK.CSSStyleDeclaration.Type.Inline);
      this._nodeForStyle.set(style, this._node);
      nodeStyles.push(style);
    }

    // Add rules in reverse order to match the cascade order.
    let addedAttributesStyle;
    for (let i = matchedPayload.length - 1; i >= 0; --i) {
      const rule = new SDK.CSSStyleRule(this._cssModel, matchedPayload[i].rule);
      if ((rule.isInjected() || rule.isUserAgent()) && !addedAttributesStyle) {
        // Show element's Style Attributes after all author rules.
        addedAttributesStyle = true;
        addAttributesStyle.call(this);
      }
      this._nodeForStyle.set(rule.style, this._node);
      nodeStyles.push(rule.style);
      this._addMatchingSelectors(this._node, rule, matchedPayload[i].matchingSelectors);
    }

    if (!addedAttributesStyle)
      addAttributesStyle.call(this);
    nodeCascades.push(new SDK.CSSMatchedStyles.NodeCascade(this, nodeStyles, false /* isInherited */));

    // Walk the node structure and identify styles with inherited properties.
    let parentNode = this._node.parentNode;
    for (let i = 0; parentNode && inheritedPayload && i < inheritedPayload.length; ++i) {
      const inheritedStyles = [];
      const entryPayload = inheritedPayload[i];
      const inheritedInlineStyle = entryPayload.inlineStyle ?
          new SDK.CSSStyleDeclaration(
              this._cssModel, null, entryPayload.inlineStyle, SDK.CSSStyleDeclaration.Type.Inline) :
          null;
      if (inheritedInlineStyle && this._containsInherited(inheritedInlineStyle)) {
        this._nodeForStyle.set(inheritedInlineStyle, parentNode);
        inheritedStyles.push(inheritedInlineStyle);
        this._inheritedStyles.add(inheritedInlineStyle);
      }

      const inheritedMatchedCSSRules = entryPayload.matchedCSSRules || [];
      for (let j = inheritedMatchedCSSRules.length - 1; j >= 0; --j) {
        const inheritedRule = new SDK.CSSStyleRule(this._cssModel, inheritedMatchedCSSRules[j].rule);
        this._addMatchingSelectors(parentNode, inheritedRule, inheritedMatchedCSSRules[j].matchingSelectors);
        if (!this._containsInherited(inheritedRule.style))
          continue;
        this._nodeForStyle.set(inheritedRule.style, parentNode);
        inheritedStyles.push(inheritedRule.style);
        this._inheritedStyles.add(inheritedRule.style);
      }
      parentNode = parentNode.parentNode;
      nodeCascades.push(new SDK.CSSMatchedStyles.NodeCascade(this, inheritedStyles, true /* isInherited */));
    }

    return new SDK.CSSMatchedStyles.DOMInheritanceCascade(nodeCascades);
  }

  /**
   * @param {!Array.<!Protocol.CSS.PseudoElementMatches>} pseudoPayload
   * @return {!Map<!Protocol.DOM.PseudoType, !SDK.CSSMatchedStyles.DOMInheritanceCascade>}
   */
  _buildPseudoCascades(pseudoPayload) {
    /** @type {!Map<!Protocol.DOM.PseudoType, !SDK.CSSMatchedStyles.DOMInheritanceCascade>} */
    const pseudoCascades = new Map();
    if (!pseudoPayload)
      return pseudoCascades;
    for (let i = 0; i < pseudoPayload.length; ++i) {
      const entryPayload = pseudoPayload[i];
      // PseudoElement nodes are not created unless "content" css property is set.
      const pseudoElement = this._node.pseudoElements().get(entryPayload.pseudoType) || null;
      const pseudoStyles = [];
      const rules = entryPayload.matches || [];
      for (let j = rules.length - 1; j >= 0; --j) {
        const pseudoRule = new SDK.CSSStyleRule(this._cssModel, rules[j].rule);
        pseudoStyles.push(pseudoRule.style);
        this._nodeForStyle.set(pseudoRule.style, pseudoElement);
        if (pseudoElement)
          this._addMatchingSelectors(pseudoElement, pseudoRule, rules[j].matchingSelectors);
      }
      const nodeCascade = new SDK.CSSMatchedStyles.NodeCascade(this, pseudoStyles, false /* isInherited */);
      pseudoCascades.set(entryPayload.pseudoType, new SDK.CSSMatchedStyles.DOMInheritanceCascade([nodeCascade]));
    }
    return pseudoCascades;
  }

  /**
   * @param {!SDK.DOMNode} node
   * @param {!SDK.CSSStyleRule} rule
   * @param {!Array<number>} matchingSelectorIndices
   * @this {SDK.CSSMatchedStyles}
   */
  _addMatchingSelectors(node, rule, matchingSelectorIndices) {
    for (const matchingSelectorIndex of matchingSelectorIndices) {
      const selector = rule.selectors[matchingSelectorIndex];
      this._setSelectorMatches(node, selector.text, true);
    }
  }

  /**
   * @return {!SDK.DOMNode}
   */
  node() {
    return this._node;
  }

  /**
   * @return {!SDK.CSSModel}
   */
  cssModel() {
    return this._cssModel;
  }

  /**
   * @param {!SDK.CSSStyleRule} rule
   * @return {boolean}
   */
  hasMatchingSelectors(rule) {
    const matchingSelectors = this.matchingSelectors(rule);
    return matchingSelectors.length > 0 && this.mediaMatches(rule.style);
  }

  /**
   * @param {!SDK.CSSStyleRule} rule
   * @return {!Array<number>}
   */
  matchingSelectors(rule) {
    const node = this.nodeForStyle(rule.style);
    if (!node)
      return [];
    const map = this._matchingSelectors.get(node.id);
    if (!map)
      return [];
    const result = [];
    for (let i = 0; i < rule.selectors.length; ++i) {
      if (map.get(rule.selectors[i].text))
        result.push(i);
    }
    return result;
  }

  /**
   * @param {!SDK.CSSStyleRule} rule
   * @return {!Promise}
   */
  recomputeMatchingSelectors(rule) {
    const node = this.nodeForStyle(rule.style);
    if (!node)
      return Promise.resolve();
    const promises = [];
    for (const selector of rule.selectors)
      promises.push(querySelector.call(this, node, selector.text));
    return Promise.all(promises);

    /**
     * @param {!SDK.DOMNode} node
     * @param {string} selectorText
     * @this {SDK.CSSMatchedStyles}
     */
    async function querySelector(node, selectorText) {
      const ownerDocument = node.ownerDocument || null;
      // We assume that "matching" property does not ever change during the
      // MatchedStyleResult's lifetime.
      const map = this._matchingSelectors.get(node.id);
      if ((map && map.has(selectorText)) || !ownerDocument)
        return;

      const matchingNodeIds = await this._node.domModel().querySelectorAll(ownerDocument.id, selectorText);

      if (matchingNodeIds)
        this._setSelectorMatches(node, selectorText, matchingNodeIds.indexOf(node.id) !== -1);
    }
  }

  /**
   * @param {!SDK.CSSStyleRule} rule
   * @param {!SDK.DOMNode} node
   * @return {!Promise}
   */
  addNewRule(rule, node) {
    this._addedStyles.set(rule.style, node);
    return this.recomputeMatchingSelectors(rule);
  }

  /**
   * @param {!SDK.DOMNode} node
   * @param {string} selectorText
   * @param {boolean} value
   */
  _setSelectorMatches(node, selectorText, value) {
    let map = this._matchingSelectors.get(node.id);
    if (!map) {
      map = new Map();
      this._matchingSelectors.set(node.id, map);
    }
    map.set(selectorText, value);
  }

  /**
   * @param {!SDK.CSSStyleDeclaration} style
   * @return {boolean}
   */
  mediaMatches(style) {
    const media = style.parentRule ? style.parentRule.media : [];
    for (let i = 0; media && i < media.length; ++i) {
      if (!media[i].active())
        return false;
    }
    return true;
  }

  /**
   * @return {!Array<!SDK.CSSStyleDeclaration>}
   */
  nodeStyles() {
    return this._mainDOMCascade.styles();
  }

  /**
   * @return {!Array.<!SDK.CSSKeyframesRule>}
   */
  keyframes() {
    return this._keyframes;
  }

  /**
   * @param {!Protocol.DOM.PseudoType} pseudoType
   * @return {!Array<!SDK.CSSStyleDeclaration>}
   */
  pseudoStyles(pseudoType) {
    const domCascade = this._pseudoDOMCascades.get(pseudoType);
    return domCascade ? domCascade.styles() : [];
  }

  /**
   * @return {!Set<!Protocol.DOM.PseudoType>}
   */
  pseudoTypes() {
    return new Set(this._pseudoDOMCascades.keys());
  }

  /**
   * @param {!SDK.CSSStyleDeclaration} style
   * @return {boolean}
   */
  _containsInherited(style) {
    const properties = style.allProperties();
    for (let i = 0; i < properties.length; ++i) {
      const property = properties[i];
      // Does this style contain non-overridden inherited property?
      if (property.activeInStyle() && SDK.cssMetadata().isPropertyInherited(property.name))
        return true;
    }
    return false;
  }

  /**
   * @param {!SDK.CSSStyleDeclaration} style
   * @return {?SDK.DOMNode}
   */
  nodeForStyle(style) {
    return this._addedStyles.get(style) || this._nodeForStyle.get(style) || null;
  }

  /**
   * @param {!SDK.CSSStyleDeclaration} style
   * @return {!Array<string>}
   */
  availableCSSVariables(style) {
    const domCascade = this._styleToDOMCascade.get(style) || null;
    return domCascade ? domCascade.availableCSSVariables(style) : [];
  }

  /**
   * @param {!SDK.CSSStyleDeclaration} style
   * @param {string} variableName
   * @return {?string}
   */
  computeCSSVariable(style, variableName) {
    const domCascade = this._styleToDOMCascade.get(style) || null;
    return domCascade ? domCascade.computeCSSVariable(style, variableName) : null;
  }

  /**
   * @param {!SDK.CSSStyleDeclaration} style
   * @param {string} value
   * @return {?string}
   */
  computeValue(style, value) {
    const domCascade = this._styleToDOMCascade.get(style) || null;
    return domCascade ? domCascade.computeValue(style, value) : null;
  }

  /**
   * @param {!SDK.CSSStyleDeclaration} style
   * @return {boolean}
   */
  isInherited(style) {
    return this._inheritedStyles.has(style);
  }

  /**
   * @param {!SDK.CSSProperty} property
   * @return {?SDK.CSSMatchedStyles.PropertyState}
   */
  propertyState(property) {
    const domCascade = this._styleToDOMCascade.get(property.ownerStyle);
    return domCascade ? domCascade.propertyState(property) : null;
  }

  resetActiveProperties() {
    this._mainDOMCascade.reset();
    for (const domCascade of this._pseudoDOMCascades.values())
      domCascade.reset();
  }
};

SDK.CSSMatchedStyles.NodeCascade = class {
  /**
   * @param {!SDK.CSSMatchedStyles} matchedStyles
   * @param {!Array<!SDK.CSSStyleDeclaration>} styles
   * @param {boolean} isInherited
   */
  constructor(matchedStyles, styles, isInherited) {
    this._matchedStyles = matchedStyles;
    this._styles = styles;
    this._isInherited = isInherited;
    /** @type {!Map<!SDK.CSSProperty, !SDK.CSSMatchedStyles.PropertyState>} */
    this._propertiesState = new Map();
    /** @type {!Map.<string, !SDK.CSSProperty>} */
    this._activeProperties = new Map();
  }

  _computeActiveProperties() {
    this._propertiesState.clear();
    this._activeProperties.clear();

    for (const style of this._styles) {
      const rule = style.parentRule;
      // Compute cascade for CSSStyleRules only.
      if (rule && !(rule instanceof SDK.CSSStyleRule))
        continue;
      if (rule && !this._matchedStyles.hasMatchingSelectors(rule))
        continue;

      for (const property of style.allProperties()) {
        // Do not pick non-inherited properties from inherited styles.
        if (this._isInherited && !SDK.cssMetadata().isPropertyInherited(property.name))
          continue;

        if (!property.activeInStyle()) {
          this._propertiesState.set(property, SDK.CSSMatchedStyles.PropertyState.Overloaded);
          continue;
        }

        const canonicalName = SDK.cssMetadata().canonicalPropertyName(property.name);
        const activeProperty = this._activeProperties.get(canonicalName);
        if (activeProperty && (activeProperty.important || !property.important)) {
          this._propertiesState.set(property, SDK.CSSMatchedStyles.PropertyState.Overloaded);
          continue;
        }

        if (activeProperty)
          this._propertiesState.set(activeProperty, SDK.CSSMatchedStyles.PropertyState.Overloaded);
        this._propertiesState.set(property, SDK.CSSMatchedStyles.PropertyState.Active);
        this._activeProperties.set(canonicalName, property);
      }
    }
  }
};

SDK.CSSMatchedStyles.DOMInheritanceCascade = class {
  /**
   * @param {!Array<!SDK.CSSMatchedStyles.NodeCascade>} nodeCascades
   */
  constructor(nodeCascades) {
    this._nodeCascades = nodeCascades;
    /** @type {!Map<!SDK.CSSProperty, !SDK.CSSMatchedStyles.PropertyState>} */
    this._propertiesState = new Map();
    /** @type {!Map<!SDK.CSSMatchedStyles.NodeCascade, !Map<string, string>>} */
    this._availableCSSVariables = new Map();
    /** @type {!Map<!SDK.CSSMatchedStyles.NodeCascade, !Map<string, ?string>>} */
    this._computedCSSVariables = new Map();
    this._initialized = false;

    /** @type {!Map<!SDK.CSSStyleDeclaration, !SDK.CSSMatchedStyles.NodeCascade>} */
    this._styleToNodeCascade = new Map();
    for (const nodeCascade of nodeCascades) {
      for (const style of nodeCascade._styles)
        this._styleToNodeCascade.set(style, nodeCascade);
    }
  }

  /**
   * @param {!SDK.CSSStyleDeclaration} style
   * @return {!Array<string>}
   */
  availableCSSVariables(style) {
    const nodeCascade = this._styleToNodeCascade.get(style);
    if (!nodeCascade)
      return [];
    this._ensureInitialized();
    return Array.from(this._availableCSSVariables.get(nodeCascade).keys());
  }

  /**
   * @param {!SDK.CSSStyleDeclaration} style
   * @param {string} variableName
   * @return {?string}
   */
  computeCSSVariable(style, variableName) {
    const nodeCascade = this._styleToNodeCascade.get(style);
    if (!nodeCascade)
      return null;
    this._ensureInitialized();
    const availableCSSVariables = this._availableCSSVariables.get(nodeCascade);
    const computedCSSVariables = this._computedCSSVariables.get(nodeCascade);
    return this._innerComputeCSSVariable(availableCSSVariables, computedCSSVariables, variableName);
  }

  /**
   * @param {!SDK.CSSStyleDeclaration} style
   * @param {string} value
   * @return {?string}
   */
  computeValue(style, value) {
    const nodeCascade = this._styleToNodeCascade.get(style);
    if (!nodeCascade)
      return null;
    this._ensureInitialized();
    const availableCSSVariables = this._availableCSSVariables.get(nodeCascade);
    const computedCSSVariables = this._computedCSSVariables.get(nodeCascade);
    return this._innerComputeValue(availableCSSVariables, computedCSSVariables, value);
  }

  /**
   * @param {!Map<string, string>} availableCSSVariables
   * @param {!Map<string, ?string>} computedCSSVariables
   * @param {string} variableName
   * @return {?string}
   */
  _innerComputeCSSVariable(availableCSSVariables, computedCSSVariables, variableName) {
    if (!availableCSSVariables.has(variableName))
      return null;
    if (computedCSSVariables.has(variableName))
      return computedCSSVariables.get(variableName);
    // Set dummy value to avoid infinite recursion.
    computedCSSVariables.set(variableName, null);
    const definedValue = availableCSSVariables.get(variableName);
    const computedValue = this._innerComputeValue(availableCSSVariables, computedCSSVariables, definedValue);
    computedCSSVariables.set(variableName, computedValue);
    return computedValue;
  }

  /**
   * @param {!Map<string, string>} availableCSSVariables
   * @param {!Map<string, ?string>} computedCSSVariables
   * @param {string} value
   * @return {?string}
   */
  _innerComputeValue(availableCSSVariables, computedCSSVariables, value) {
    const results = TextUtils.TextUtils.splitStringByRegexes(value, [SDK.CSSMetadata.VariableRegex]);
    const tokens = [];
    for (const result of results) {
      if (result.regexIndex === -1) {
        tokens.push(result.value);
        continue;
      }
      // process var() function
      const regexMatch = result.value.match(/^var\((--[a-zA-Z0-9-_]+)[,]?\s*(.*)\)$/);
      if (!regexMatch)
        return null;
      const cssVariable = regexMatch[1];
      const computedValue = this._innerComputeCSSVariable(availableCSSVariables, computedCSSVariables, cssVariable);
      if (computedValue === null && !regexMatch[2])
        return null;
      if (computedValue === null)
        tokens.push(regexMatch[2]);
      else
        tokens.push(computedValue);
    }
    return tokens.map(token => token.trim()).join(' ');
  }

  /**
   * @return {!Array<!SDK.CSSStyleDeclaration>}
   */
  styles() {
    return Array.from(this._styleToNodeCascade.keys());
  }

  /**
   * @param {!SDK.CSSProperty} property
   * @return {?SDK.CSSMatchedStyles.PropertyState}
   */
  propertyState(property) {
    this._ensureInitialized();
    return this._propertiesState.get(property) || null;
  }

  reset() {
    this._initialized = false;
    this._propertiesState.clear();
    this._availableCSSVariables.clear();
    this._computedCSSVariables.clear();
  }

  _ensureInitialized() {
    if (this._initialized)
      return;
    this._initialized = true;

    const activeProperties = new Map();
    for (const nodeCascade of this._nodeCascades) {
      nodeCascade._computeActiveProperties();
      for (const entry of nodeCascade._propertiesState.entries()) {
        const property = /** @type {!SDK.CSSProperty} */ (entry[0]);
        const state = /** @type {!SDK.CSSMatchedStyles.PropertyState} */ (entry[1]);
        if (state === SDK.CSSMatchedStyles.PropertyState.Overloaded) {
          this._propertiesState.set(property, SDK.CSSMatchedStyles.PropertyState.Overloaded);
          continue;
        }
        const canonicalName = SDK.cssMetadata().canonicalPropertyName(property.name);
        if (activeProperties.has(canonicalName)) {
          this._propertiesState.set(property, SDK.CSSMatchedStyles.PropertyState.Overloaded);
          continue;
        }
        activeProperties.set(canonicalName, property);
        this._propertiesState.set(property, SDK.CSSMatchedStyles.PropertyState.Active);
      }
    }
    // If every longhand of the shorthand is not active, then the shorthand is not active too.
    for (const entry of activeProperties.entries()) {
      const canonicalName = /** @type {string} */ (entry[0]);
      const shorthandProperty = /** @type {!SDK.CSSProperty} */ (entry[1]);
      const shorthandStyle = shorthandProperty.ownerStyle;
      const longhands = shorthandStyle.longhandProperties(shorthandProperty.name);
      if (!longhands.length)
        continue;
      let hasActiveLonghands = false;
      for (const longhand of longhands) {
        const longhandCanonicalName = SDK.cssMetadata().canonicalPropertyName(longhand.name);
        const longhandActiveProperty = activeProperties.get(longhandCanonicalName);
        if (!longhandActiveProperty)
          continue;
        if (longhandActiveProperty.ownerStyle === shorthandStyle) {
          hasActiveLonghands = true;
          break;
        }
      }
      if (hasActiveLonghands)
        continue;
      activeProperties.delete(canonicalName);
      this._propertiesState.set(shorthandProperty, SDK.CSSMatchedStyles.PropertyState.Overloaded);
    }

    // Work inheritance chain backwards to compute visible CSS Variables.
    const accumulatedCSSVariables = new Map();
    for (let i = this._nodeCascades.length - 1; i >= 0; --i) {
      const nodeCascade = this._nodeCascades[i];
      for (const entry of nodeCascade._activeProperties.entries()) {
        const propertyName = /** @type {string} */ (entry[0]);
        const property = /** @type {!SDK.CSSProperty} */ (entry[1]);
        if (propertyName.startsWith('--'))
          accumulatedCSSVariables.set(propertyName, property.value);
      }
      this._availableCSSVariables.set(nodeCascade, new Map(accumulatedCSSVariables));
      this._computedCSSVariables.set(nodeCascade, new Map());
    }
  }
};

/** @enum {string} */
SDK.CSSMatchedStyles.PropertyState = {
  Active: 'Active',
  Overloaded: 'Overloaded'
};
