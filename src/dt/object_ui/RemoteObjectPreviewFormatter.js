// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
ObjectUI.RemoteObjectPreviewFormatter = class {
  /**
   * @param {!Protocol.Runtime.PropertyPreview} a
   * @param {!Protocol.Runtime.PropertyPreview} b
   * @return {number}
   */
  static _objectPropertyComparator(a, b) {
    return sortValue(a) - sortValue(b);

    /**
     * @param {!Protocol.Runtime.PropertyPreview} property
     * @return {number}
     */
    function sortValue(property) {
      const internalName = ObjectUI.RemoteObjectPreviewFormatter._internalName;
      if (property.name === internalName.PromiseStatus)
        return 1;
      else if (property.name === internalName.PromiseValue)
        return 2;
      else if (property.name === internalName.GeneratorStatus || internalName.PrimitiveValue)
        return 3;
      else if (property.type !== 'function')
        return 4;
      return 5;
    }
  }

  /**
   * @param {!DocumentFragment|!Element} parentElement
   * @param {!Protocol.Runtime.ObjectPreview} preview
   * @param {boolean} isEntry
   */
  appendObjectPreview(parentElement, preview, isEntry) {
    const description = preview.description;
    const subTypesWithoutValuePreview = new Set(['null', 'regexp', 'error', 'internal#entry']);
    if (preview.type !== 'object' || subTypesWithoutValuePreview.has(preview.subtype) || isEntry) {
      parentElement.appendChild(this.renderPropertyPreview(preview.type, preview.subtype, description));
      return;
    }
    const isArrayOrTypedArray = preview.subtype === 'array' || preview.subtype === 'typedarray';
    if (description) {
      let text;
      if (isArrayOrTypedArray) {
        const arrayLength = SDK.RemoteObject.arrayLength(preview);
        const arrayLengthText = arrayLength > 1 ? ('(' + arrayLength + ')') : '';
        const arrayName = SDK.RemoteObject.arrayNameFromDescription(description);
        text = arrayName === 'Array' ? arrayLengthText : (arrayName + arrayLengthText);
      } else {
        const hideDescription = description === 'Object';
        text = hideDescription ? '' : description;
      }
      if (text.length > 0)
        parentElement.createChild('span', 'object-description').textContent = text + '\u00a0';
    }

    const propertiesElement = parentElement.createChild('span', 'object-properties-preview');
    propertiesElement.createTextChild(isArrayOrTypedArray ? '[' : '{');
    if (preview.entries)
      this._appendEntriesPreview(propertiesElement, preview);
    else if (isArrayOrTypedArray)
      this._appendArrayPropertiesPreview(propertiesElement, preview);
    else
      this._appendObjectPropertiesPreview(propertiesElement, preview);
    if (preview.overflow) {
      const ellipsisText = propertiesElement.textContent.length > 1 ? ',\u00a0\u2026' : '\u2026';
      propertiesElement.createChild('span').textContent = ellipsisText;
    }
    propertiesElement.createTextChild(isArrayOrTypedArray ? ']' : '}');
  }

  /**
   * @param {string} description
   * @return {string}
   */
  _abbreviateFullQualifiedClassName(description) {
    const abbreviatedDescription = description.split('.');
    for (let i = 0; i < abbreviatedDescription.length - 1; ++i)
      abbreviatedDescription[i] = abbreviatedDescription[i].trimMiddle(3);
    return abbreviatedDescription.join('.');
  }

  /**
   * @param {!Element} parentElement
   * @param {!Protocol.Runtime.ObjectPreview} preview
   */
  _appendObjectPropertiesPreview(parentElement, preview) {
    const internalName = ObjectUI.RemoteObjectPreviewFormatter._internalName;
    const properties = preview.properties.filter(p => p.type !== 'accessor')
                           .stableSort(ObjectUI.RemoteObjectPreviewFormatter._objectPropertyComparator);
    for (let i = 0; i < properties.length; ++i) {
      if (i > 0)
        parentElement.createTextChild(', ');

      const property = properties[i];
      const name = property.name;
      // Internal properties are given special formatting, e.g. Promises `<rejected>: 123`.
      if (preview.subtype === 'promise' && name === internalName.PromiseStatus) {
        parentElement.appendChild(this._renderDisplayName('<' + property.value + '>'));
        const nextProperty = i + 1 < properties.length ? properties[i + 1] : null;
        if (nextProperty && nextProperty.name === internalName.PromiseValue) {
          if (property.value !== 'pending') {
            parentElement.createTextChild(': ');
            parentElement.appendChild(this._renderPropertyPreviewOrAccessor([nextProperty]));
          }
          i++;
        }
      } else if (preview.subtype === 'generator' && name === internalName.GeneratorStatus) {
        parentElement.appendChild(this._renderDisplayName('<' + property.value + '>'));
      } else if (name === internalName.PrimitiveValue) {
        parentElement.appendChild(this._renderPropertyPreviewOrAccessor([property]));
      } else {
        parentElement.appendChild(this._renderDisplayName(name));
        parentElement.createTextChild(': ');
        parentElement.appendChild(this._renderPropertyPreviewOrAccessor([property]));
      }
    }
  }

  /**
   * @param {!Element} parentElement
   * @param {!Protocol.Runtime.ObjectPreview} preview
   */
  _appendArrayPropertiesPreview(parentElement, preview) {
    const arrayLength = SDK.RemoteObject.arrayLength(preview);
    const indexProperties =
        preview.properties.filter(p => toArrayIndex(p.name) !== -1).stableSort(arrayEntryComparator);
    const otherProperties = preview.properties.filter(p => toArrayIndex(p.name) === -1)
                                .stableSort(ObjectUI.RemoteObjectPreviewFormatter._objectPropertyComparator);

    /**
     * @param {!Protocol.Runtime.PropertyPreview} a
     * @param {!Protocol.Runtime.PropertyPreview} b
     * @return {number}
     */
    function arrayEntryComparator(a, b) {
      return toArrayIndex(a.name) - toArrayIndex(b.name);
    }

    /**
     * @param {string} name
     * @return {number}
     */
    function toArrayIndex(name) {
      const index = name >>> 0;
      if (String(index) === name && index < arrayLength)
        return index;
      return -1;
    }

    // Gaps can be shown when all properties are guaranteed to be in the preview.
    const canShowGaps = !preview.overflow;
    let lastNonEmptyArrayIndex = -1;
    let elementsAdded = false;
    for (let i = 0; i < indexProperties.length; ++i) {
      if (elementsAdded)
        parentElement.createTextChild(', ');

      const property = indexProperties[i];
      const index = toArrayIndex(property.name);
      if (canShowGaps && index - lastNonEmptyArrayIndex > 1) {
        appendUndefined(index);
        parentElement.createTextChild(', ');
      }
      if (!canShowGaps && i !== index) {
        parentElement.appendChild(this._renderDisplayName(property.name));
        parentElement.createTextChild(': ');
      }
      parentElement.appendChild(this._renderPropertyPreviewOrAccessor([property]));
      lastNonEmptyArrayIndex = index;
      elementsAdded = true;
    }

    if (canShowGaps && arrayLength - lastNonEmptyArrayIndex > 1) {
      if (elementsAdded)
        parentElement.createTextChild(', ');
      appendUndefined(arrayLength);
    }

    for (let i = 0; i < otherProperties.length; ++i) {
      if (elementsAdded)
        parentElement.createTextChild(', ');

      const property = otherProperties[i];
      parentElement.appendChild(this._renderDisplayName(property.name));
      parentElement.createTextChild(': ');
      parentElement.appendChild(this._renderPropertyPreviewOrAccessor([property]));
      elementsAdded = true;
    }

    /**
     * @param {number} index
     */
    function appendUndefined(index) {
      const span = parentElement.createChild('span', 'object-value-undefined');
      const count = index - lastNonEmptyArrayIndex - 1;
      span.textContent = count !== 1 ? Common.UIString('empty × %d', count) : Common.UIString('empty');
      elementsAdded = true;
    }
  }

  /**
   * @param {!Element} parentElement
   * @param {!Protocol.Runtime.ObjectPreview} preview
   */
  _appendEntriesPreview(parentElement, preview) {
    for (let i = 0; i < preview.entries.length; ++i) {
      if (i > 0)
        parentElement.createTextChild(', ');

      const entry = preview.entries[i];
      if (entry.key) {
        this.appendObjectPreview(parentElement, entry.key, true /* isEntry */);
        parentElement.createTextChild(' => ');
      }
      this.appendObjectPreview(parentElement, entry.value, true /* isEntry */);
    }
  }

  /**
   * @param {string} name
   * @return {!Element}
   */
  _renderDisplayName(name) {
    const result = createElementWithClass('span', 'name');
    const needsQuotes = /^\s|\s$|^$|\n/.test(name);
    result.textContent = needsQuotes ? '"' + name.replace(/\n/g, '\u21B5') + '"' : name;
    return result;
  }

  /**
   * @param {!Array.<!Protocol.Runtime.PropertyPreview>} propertyPath
   * @return {!Element}
   */
  _renderPropertyPreviewOrAccessor(propertyPath) {
    const property = propertyPath.peekLast();
    return this.renderPropertyPreview(property.type, /** @type {string} */ (property.subtype), property.value);
  }

  /**
   * @param {string} type
   * @param {string=} subtype
   * @param {string=} description
   * @return {!Element}
   */
  renderPropertyPreview(type, subtype, description) {
    const span = createElementWithClass('span', 'object-value-' + (subtype || type));
    description = description || '';

    if (type === 'accessor') {
      span.textContent = '(...)';
      span.title = Common.UIString('The property is computed with a getter');
      return span;
    }

    if (type === 'function') {
      span.textContent = '\u0192';
      return span;
    }

    if (type === 'object' && subtype === 'node' && description) {
      ObjectUI.RemoteObjectPreviewFormatter.createSpansForNodeTitle(span, description);
      return span;
    }

    if (type === 'string') {
      span.createTextChildren('"', description.replace(/\n/g, '\u21B5'), '"');
      return span;
    }

    if (type === 'object' && !subtype) {
      let preview = this._abbreviateFullQualifiedClassName(description);
      if (preview === 'Object')
        preview = '{\u2026}';
      span.textContent = preview;
      span.title = description;
      return span;
    }

    span.textContent = description;
    return span;
  }
};

/** @enum {string} */
ObjectUI.RemoteObjectPreviewFormatter._internalName = {
  GeneratorStatus: '[[GeneratorStatus]]',
  PrimitiveValue: '[[PrimitiveValue]]',
  PromiseStatus: '[[PromiseStatus]]',
  PromiseValue: '[[PromiseValue]]'
};

/**
 * @param {!Element} container
 * @param {string} nodeTitle
 */
ObjectUI.RemoteObjectPreviewFormatter.createSpansForNodeTitle = function(container, nodeTitle) {
  const match = nodeTitle.match(/([^#.]+)(#[^.]+)?(\..*)?/);
  container.createChild('span', 'webkit-html-tag-name').textContent = match[1];
  if (match[2])
    container.createChild('span', 'webkit-html-attribute-value').textContent = match[2];
  if (match[3])
    container.createChild('span', 'webkit-html-attribute-name').textContent = match[3];
};
