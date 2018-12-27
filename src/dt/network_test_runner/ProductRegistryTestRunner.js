// Copyright 2017 The Chromium Authors. All
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview using private properties isn't a Closure violation in tests.
 * @suppress {accessControls}
 */

NetworkTestRunner.resetProductRegistry = function() {
  TestRunner.addResult('Cleared ProductRegistryImpl');
  ProductRegistryImpl._productsByDomainHash.clear();
};

NetworkTestRunner.addProductRegistryEntry = function(domainPattern, productName, type) {
  TestRunner.addResult('Adding entry: ' + domainPattern);
  const wildCardPosition = domainPattern.indexOf('*');
  let prefix = '';

  if (wildCardPosition === -1) {
  } else if (wildCardPosition === 0) {
    prefix = '*';
    console.assert(domainPattern.substr(1, 1) === '.', 'Domain pattern wildcard must be followed by \'.\'');
    domainPattern = domainPattern.substr(2);
  } else {
    prefix = domainPattern.substr(0, wildCardPosition);
    console.assert(
        domainPattern.substr(wildCardPosition + 1, 1) === '.', 'Domain pattern wildcard must be followed by \'.\'');
    domainPattern = domainPattern.substr(wildCardPosition + 2);
  }

  console.assert(domainPattern.indexOf('*') === -1, 'Domain pattern may only have 1 wildcard.');
  const prefixes = {};

  prefixes[prefix] = {product: 0, type: type};

  ProductRegistryImpl.register(
      [productName], [{hash: ProductRegistryImpl._hashForDomain(domainPattern), prefixes: prefixes}]);
};
