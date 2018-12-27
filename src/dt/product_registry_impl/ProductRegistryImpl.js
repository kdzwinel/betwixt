// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @implements {ProductRegistry.Registry}
 */
ProductRegistryImpl.Registry = class {
  constructor() {
  }

  /**
   * @override
   * @param {!Common.ParsedURL} parsedUrl
   * @return {?string}
   */
  nameForUrl(parsedUrl) {
    const entry = this.entryForUrl(parsedUrl);
    if (entry)
      return entry.name;
    return null;
  }

  /**
   * @override
   * @param {!Common.ParsedURL} parsedUrl
   * @return {?ProductRegistry.Registry.ProductEntry}
   */
  entryForUrl(parsedUrl) {
    if (parsedUrl.isDataURL() || !parsedUrl.isValid)
      return null;
    // TODO(allada) This should be expanded to allow paths as as well as domain to find a product.
    const productsByDomainHash = ProductRegistryImpl._productsByDomainHash;
    // Remove leading www. if it is the only subdomain.
    const domain = parsedUrl.domain().replace(/^www\.(?=[^.]+\.[^.]+$)/, '');

    let previousIndex = -1;
    let index = -1;
    // Ensure we loop with full domain first, but do not loop over last part (ie: ".com").
    for (let nextIndex = domain.indexOf('.'); nextIndex !== -1; nextIndex = domain.indexOf('.', nextIndex + 1)) {
      const previousSubdomain = domain.substring(previousIndex + 1, index);
      const subDomain = domain.substring(index + 1);
      const prefixes = productsByDomainHash.get(ProductRegistryImpl._hashForDomain(subDomain));
      previousIndex = index;
      index = nextIndex;
      if (!prefixes)
        continue;
      // Exact match domains are always highest priority.
      if ('' in prefixes && domain === subDomain)
        return prefixes[''];
      if (previousSubdomain) {
        for (const prefix in prefixes) {
          const domainPrefix = previousSubdomain.substr(0, prefix.length);
          if (domainPrefix === prefix && prefix !== '')
            return prefixes[prefix];
        }
      }
      // Process wildcard subdomain if no better match found.
      if (prefixes && '*' in prefixes)
        return prefixes['*'];
    }
    return null;
  }

  /**
   * @override
   * @param {!Common.ParsedURL} parsedUrl
   * @return {?number}
   */
  typeForUrl(parsedUrl) {
    const entry = this.entryForUrl(parsedUrl);
    if (entry)
      return entry.type;
    return null;
  }
};

/**
 * @param {string} domain
 * @return {string}
 */
ProductRegistryImpl._hashForDomain = function(domain) {
  return ProductRegistryImpl.sha1(domain).substr(0, 16);
};

/**
 * @param {!Array<string>} productNames
 * @param {!Array<!{hash: string, prefixes: !Object<string, !{product: number, type: (number|undefined)}>}>} data
 */
ProductRegistryImpl.register = function(productNames, data) {
  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    const prefixes = {};
    for (const prefix in entry.prefixes) {
      const prefixEntry = entry.prefixes[prefix];
      const type = prefixEntry.type !== undefined ? prefixEntry.type : null;
      prefixes[prefix] = {name: productNames[prefixEntry.product], type: type};
    }
    ProductRegistryImpl._productsByDomainHash.set(entry.hash, prefixes);
  }
};

/** @type {!Map<string, !Object<string, !ProductRegistry.Registry.ProductEntry>>}} */
ProductRegistryImpl._productsByDomainHash = new Map();
