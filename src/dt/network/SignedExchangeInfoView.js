// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Network.SignedExchangeInfoView = class extends UI.VBox {
  /**
   * @param {!SDK.NetworkRequest} request
   */
  constructor(request) {
    super();
    const signedExchangeInfo = request.signedExchangeInfo();
    console.assert(signedExchangeInfo);

    this.registerRequiredCSS('network/signedExchangeInfoView.css');
    this.element.classList.add('signed-exchange-info-view');

    const root = new UI.TreeOutlineInShadow();
    root.registerRequiredCSS('network/signedExchangeInfoTree.css');
    root.element.classList.add('signed-exchange-info-tree');
    root.setFocusable(false);
    root.makeDense();
    root.expandTreeElementsWhenArrowing = true;
    this.element.appendChild(root.element);

    /** @type {!Map<number|undefined, !Set<string>>} */
    const errorFieldSetMap = new Map();

    if (signedExchangeInfo.errors && signedExchangeInfo.errors.length) {
      const errorMessagesCategory = new Network.SignedExchangeInfoView.Category(root, Common.UIString('Errors'));
      for (const error of signedExchangeInfo.errors) {
        const fragment = createDocumentFragment();
        fragment.appendChild(UI.Icon.create('smallicon-error', 'prompt-icon'));
        fragment.createChild('div', 'error-log').textContent = error.message;
        errorMessagesCategory.createLeaf(fragment);
        if (error.errorField) {
          let errorFieldSet = errorFieldSetMap.get(error.signatureIndex);
          if (!errorFieldSet) {
            errorFieldSet = new Set();
            errorFieldSetMap.set(error.signatureIndex, errorFieldSet);
          }
          errorFieldSet.add(error.errorField);
        }
      }
    }

    const titleElement = createDocumentFragment();
    titleElement.createChild('div', 'header-name').textContent = Common.UIString('Signed HTTP exchange');
    const learnMoreNode =
        UI.XLink.create('https://github.com/WICG/webpackage', Common.UIString('Learn\xa0more'), 'header-toggle');
    titleElement.appendChild(learnMoreNode);
    const headerCategory = new Network.SignedExchangeInfoView.Category(root, titleElement);
    if (signedExchangeInfo.header) {
      const header = signedExchangeInfo.header;
      const redirectDestination = request.redirectDestination();
      const requestURLElement = this._formatHeader(Common.UIString('Request URL'), header.requestUrl);
      if (redirectDestination) {
        const viewRequestLink = Components.Linkifier.linkifyRevealable(redirectDestination, 'View request');
        viewRequestLink.classList.add('header-toggle');
        requestURLElement.appendChild(viewRequestLink);
      }
      headerCategory.createLeaf(requestURLElement);
      headerCategory.createLeaf(this._formatHeader(Common.UIString('Request method'), header.requestMethod));
      headerCategory.createLeaf(this._formatHeader(Common.UIString('Response code'), header.responseCode + ''));

      this._responseHeadersItem =
          headerCategory.createLeaf(this._formatHeader(Common.UIString('Response headers'), ''));
      const responseHeaders = header.responseHeaders;
      for (const name in responseHeaders) {
        const headerTreeElement = new UI.TreeElement(this._formatHeader(name, responseHeaders[name]));
        headerTreeElement.selectable = false;
        this._responseHeadersItem.appendChild(headerTreeElement);
      }
      this._responseHeadersItem.expand();

      for (let i = 0; i < header.signatures.length; ++i) {
        const errorFieldSet = errorFieldSetMap.get(i) || new Set();
        const signature = header.signatures[i];
        const signatureCategory = new Network.SignedExchangeInfoView.Category(root, Common.UIString('Signature'));
        signatureCategory.createLeaf(this._formatHeader(Common.UIString('Label'), signature.label));
        signatureCategory.createLeaf(this._formatHeaderForHexData(
            Common.UIString('Signature'), signature.signature,
            errorFieldSet.has(Protocol.Network.SignedExchangeErrorField.SignatureSig)));

        if (signature.certUrl) {
          const certURLElement = this._formatHeader(
              Common.UIString('Certificate URL'), signature.certUrl,
              errorFieldSet.has(Protocol.Network.SignedExchangeErrorField.SignatureCertUrl));
          if (signature.certificates) {
            const viewCertLink = certURLElement.createChild('span', 'devtools-link header-toggle');
            viewCertLink.textContent = Common.UIString('View certificate');
            viewCertLink.addEventListener(
                'click', InspectorFrontendHost.showCertificateViewer.bind(null, signature.certificates), false);
          }
          signatureCategory.createLeaf(certURLElement);
        }
        signatureCategory.createLeaf(this._formatHeader(
            Common.UIString('Integrity'), signature.integrity,
            errorFieldSet.has(Protocol.Network.SignedExchangeErrorField.SignatureIntegrity)));
        if (signature.certSha256) {
          signatureCategory.createLeaf(this._formatHeaderForHexData(
              Common.UIString('Certificate SHA256'), signature.certSha256,
              errorFieldSet.has(Protocol.Network.SignedExchangeErrorField.SignatureCertSha256)));
        }
        signatureCategory.createLeaf(this._formatHeader(
            Common.UIString('Validity URL'), signature.validityUrl,
            errorFieldSet.has(Protocol.Network.SignedExchangeErrorField.SignatureValidityUrl)));
        signatureCategory.createLeaf().title = this._formatHeader(
            Common.UIString('Date'), new Date(1000 * signature.date).toUTCString(),
            errorFieldSet.has(Protocol.Network.SignedExchangeErrorField.SignatureTimestamps));
        signatureCategory.createLeaf().title = this._formatHeader(
            Common.UIString('Expires'), new Date(1000 * signature.expires).toUTCString(),
            errorFieldSet.has(Protocol.Network.SignedExchangeErrorField.SignatureTimestamps));
      }
    }
    if (signedExchangeInfo.securityDetails) {
      const securityDetails = signedExchangeInfo.securityDetails;
      const securityCategory = new Network.SignedExchangeInfoView.Category(root, Common.UIString('Certificate'));
      securityCategory.createLeaf(this._formatHeader(Common.UIString('Subject'), securityDetails.subjectName));
      securityCategory.createLeaf(
          this._formatHeader(Common.UIString('Valid from'), new Date(1000 * securityDetails.validFrom).toUTCString()));
      securityCategory.createLeaf(
          this._formatHeader(Common.UIString('Valid until'), new Date(1000 * securityDetails.validTo).toUTCString()));
      securityCategory.createLeaf(this._formatHeader(Common.UIString('Issuer'), securityDetails.issuer));
    }
  }

  /**
   * @param {string} name
   * @param {string} value
   * @param {boolean=} highlighted
   * @return {!DocumentFragment}
   */
  _formatHeader(name, value, highlighted) {
    const fragment = createDocumentFragment();
    const nameElement = fragment.createChild('div', 'header-name');
    nameElement.textContent = name + ': ';
    fragment.createChild('span', 'header-separator');
    const valueElement = fragment.createChild('div', 'header-value source-code');
    valueElement.textContent = value;
    if (highlighted) {
      nameElement.classList.add('error-field');
      valueElement.classList.add('error-field');
    }
    return fragment;
  }

  /**
   * @param {string} name
   * @param {string} value
   * @param {boolean=} highlighted
   * @return {!DocumentFragment}
   */
  _formatHeaderForHexData(name, value, highlighted) {
    const fragment = createDocumentFragment();
    const nameElement = fragment.createChild('div', 'header-name');
    nameElement.textContent = name + ': ';
    fragment.createChild('span', 'header-separator');
    const valueElement = fragment.createChild('div', 'header-value source-code hex-data');
    valueElement.textContent = value.replace(/(.{2})/g, '$1 ');
    if (highlighted) {
      nameElement.classList.add('error-field');
      valueElement.classList.add('error-field');
    }
    return fragment;
  }
};


/**
 * @unrestricted
 */
Network.SignedExchangeInfoView.Category = class extends UI.TreeElement {
  /**
   * @param {!UI.TreeOutline} root
   * @param {(string|!Node)=} title
   */
  constructor(root, title) {
    super(title, true);
    this.selectable = false;
    this.toggleOnClick = true;
    this.expanded = true;
    root.appendChild(this);
  }

  /**
   * @param {(string|!Node)=} title
   */
  createLeaf(title) {
    const leaf = new UI.TreeElement(title);
    leaf.selectable = false;
    this.appendChild(leaf);
    return leaf;
  }
};
