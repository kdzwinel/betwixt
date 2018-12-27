/*
 * Copyright (C) 2012 Google Inc.  All rights reserved.
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @unrestricted
 */
Common.ResourceType = class {
  /**
   * @param {string} name
   * @param {string} title
   * @param {!Common.ResourceCategory} category
   * @param {boolean} isTextType
   */
  constructor(name, title, category, isTextType) {
    this._name = name;
    this._title = title;
    this._category = category;
    this._isTextType = isTextType;
  }

  /**
   * @param {?string} mimeType
   * @return {!Common.ResourceType}
   */
  static fromMimeType(mimeType) {
    if (mimeType.startsWith('text/html'))
      return Common.resourceTypes.Document;
    if (mimeType.startsWith('text/css'))
      return Common.resourceTypes.Stylesheet;
    if (mimeType.startsWith('image/'))
      return Common.resourceTypes.Image;
    if (mimeType.startsWith('text/'))
      return Common.resourceTypes.Script;

    if (mimeType.includes('font'))
      return Common.resourceTypes.Font;
    if (mimeType.includes('script'))
      return Common.resourceTypes.Script;
    if (mimeType.includes('octet'))
      return Common.resourceTypes.Other;
    if (mimeType.includes('application'))
      return Common.resourceTypes.Script;

    return Common.resourceTypes.Other;
  }

  /**
   * @param {string} url
   * @return {?Common.ResourceType}
   */
  static fromURL(url) {
    return Common.ResourceType._resourceTypeByExtension.get(Common.ParsedURL.extractExtension(url)) || null;
  }

  /**
   * @param {string} name
   * @return {?Common.ResourceType}
   */
  static fromName(name) {
    for (const resourceTypeId in Common.resourceTypes) {
      const resourceType = Common.resourceTypes[resourceTypeId];
      if (resourceType.name() === name)
        return resourceType;
    }
    return null;
  }

  /**
   * @param {string} url
   * @return {string|undefined}
   */
  static mimeFromURL(url) {
    const name = Common.ParsedURL.extractName(url);
    if (Common.ResourceType._mimeTypeByName.has(name))
      return Common.ResourceType._mimeTypeByName.get(name);

    const ext = Common.ParsedURL.extractExtension(url).toLowerCase();
    return Common.ResourceType._mimeTypeByExtension.get(ext);
  }

  /**
   * @param {string} ext
   * @return {string|undefined}
   */
  static mimeFromExtension(ext) {
    return Common.ResourceType._mimeTypeByExtension.get(ext);
  }

  /**
   * @return {string}
   */
  name() {
    return this._name;
  }

  /**
   * @return {string}
   */
  title() {
    return this._title;
  }

  /**
   * @return {!Common.ResourceCategory}
   */
  category() {
    return this._category;
  }

  /**
   * @return {boolean}
   */
  isTextType() {
    return this._isTextType;
  }

  /**
   * @return {boolean}
   */
  isScript() {
    return this._name === 'script' || this._name === 'sm-script';
  }

  /**
   * @return {boolean}
   */
  hasScripts() {
    return this.isScript() || this.isDocument();
  }

  /**
   * @return {boolean}
   */
  isStyleSheet() {
    return this._name === 'stylesheet' || this._name === 'sm-stylesheet';
  }

  /**
   * @return {boolean}
   */
  isDocument() {
    return this._name === 'document';
  }

  /**
   * @return {boolean}
   */
  isDocumentOrScriptOrStyleSheet() {
    return this.isDocument() || this.isScript() || this.isStyleSheet();
  }

  /**
   * @return {boolean}
   */
  isFromSourceMap() {
    return this._name.startsWith('sm-');
  }

  /**
   * @override
   * @return {string}
   */
  toString() {
    return this._name;
  }

  /**
   * @return {string}
   */
  canonicalMimeType() {
    if (this.isDocument())
      return 'text/html';
    if (this.isScript())
      return 'text/javascript';
    if (this.isStyleSheet())
      return 'text/css';
    return '';
  }
};

/**
 * @unrestricted
 */
Common.ResourceCategory = class {
  /**
   * @param {string} title
   * @param {string} shortTitle
   */
  constructor(title, shortTitle) {
    this.title = title;
    this.shortTitle = shortTitle;
  }
};

Common.resourceCategories = {
  XHR: new Common.ResourceCategory('XHR and Fetch', 'XHR'),
  Script: new Common.ResourceCategory('Scripts', 'JS'),
  Stylesheet: new Common.ResourceCategory('Stylesheets', 'CSS'),
  Image: new Common.ResourceCategory('Images', 'Img'),
  Media: new Common.ResourceCategory('Media', 'Media'),
  Font: new Common.ResourceCategory('Fonts', 'Font'),
  Document: new Common.ResourceCategory('Documents', 'Doc'),
  WebSocket: new Common.ResourceCategory('WebSockets', 'WS'),
  Manifest: new Common.ResourceCategory('Manifest', 'Manifest'),
  Other: new Common.ResourceCategory('Other', 'Other')
};

/**
 * Keep these in sync with WebCore::InspectorPageAgent::resourceTypeJson
 * @enum {!Common.ResourceType}
 */
Common.resourceTypes = {
  XHR: new Common.ResourceType('xhr', 'XHR', Common.resourceCategories.XHR, true),
  Fetch: new Common.ResourceType('fetch', 'Fetch', Common.resourceCategories.XHR, true),
  EventSource: new Common.ResourceType('eventsource', 'EventSource', Common.resourceCategories.XHR, true),
  Script: new Common.ResourceType('script', 'Script', Common.resourceCategories.Script, true),
  Stylesheet: new Common.ResourceType('stylesheet', 'Stylesheet', Common.resourceCategories.Stylesheet, true),
  Image: new Common.ResourceType('image', 'Image', Common.resourceCategories.Image, false),
  Media: new Common.ResourceType('media', 'Media', Common.resourceCategories.Media, false),
  Font: new Common.ResourceType('font', 'Font', Common.resourceCategories.Font, false),
  Document: new Common.ResourceType('document', 'Document', Common.resourceCategories.Document, true),
  TextTrack: new Common.ResourceType('texttrack', 'TextTrack', Common.resourceCategories.Other, true),
  WebSocket: new Common.ResourceType('websocket', 'WebSocket', Common.resourceCategories.WebSocket, false),
  Other: new Common.ResourceType('other', 'Other', Common.resourceCategories.Other, false),
  SourceMapScript: new Common.ResourceType('sm-script', 'Script', Common.resourceCategories.Script, true),
  SourceMapStyleSheet:
      new Common.ResourceType('sm-stylesheet', 'Stylesheet', Common.resourceCategories.Stylesheet, true),
  Manifest: new Common.ResourceType('manifest', 'Manifest', Common.resourceCategories.Manifest, true),
  SignedExchange: new Common.ResourceType('signed-exchange', 'SignedExchange', Common.resourceCategories.Other, false),
};


Common.ResourceType._mimeTypeByName = new Map([
  // CoffeeScript
  ['Cakefile', 'text/x-coffeescript']
]);

Common.ResourceType._resourceTypeByExtension = new Map([
  ['js', Common.resourceTypes.Script], ['mjs', Common.resourceTypes.Script],

  ['css', Common.resourceTypes.Stylesheet], ['xsl', Common.resourceTypes.Stylesheet],

  ['jpeg', Common.resourceTypes.Image], ['jpg', Common.resourceTypes.Image], ['svg', Common.resourceTypes.Image],
  ['gif', Common.resourceTypes.Image], ['png', Common.resourceTypes.Image], ['ico', Common.resourceTypes.Image],
  ['tiff', Common.resourceTypes.Image], ['tif', Common.resourceTypes.Image], ['bmp', Common.resourceTypes.Image],

  ['webp', Common.resourceTypes.Media],

  ['ttf', Common.resourceTypes.Font], ['otf', Common.resourceTypes.Font], ['ttc', Common.resourceTypes.Font],
  ['woff', Common.resourceTypes.Font]
]);

Common.ResourceType._mimeTypeByExtension = new Map([
  // Web extensions
  ['js', 'text/javascript'], ['mjs', 'text/javascript'], ['css', 'text/css'], ['html', 'text/html'],
  ['htm', 'text/html'], ['xml', 'application/xml'], ['xsl', 'application/xml'],

  // HTML Embedded Scripts, ASP], JSP
  ['asp', 'application/x-aspx'], ['aspx', 'application/x-aspx'], ['jsp', 'application/x-jsp'],

  // C/C++
  ['c', 'text/x-c++src'], ['cc', 'text/x-c++src'], ['cpp', 'text/x-c++src'], ['h', 'text/x-c++src'],
  ['m', 'text/x-c++src'], ['mm', 'text/x-c++src'],

  // CoffeeScript
  ['coffee', 'text/x-coffeescript'],

  // Dart
  ['dart', 'text/javascript'],

  // TypeScript
  ['ts', 'text/typescript'], ['tsx', 'text/typescript-jsx'],

  // JSON
  ['json', 'application/json'], ['gyp', 'application/json'], ['gypi', 'application/json'],

  // C#
  ['cs', 'text/x-csharp'],

  // Java
  ['java', 'text/x-java'],

  // Less
  ['less', 'text/x-less'],

  // PHP
  ['php', 'text/x-php'], ['phtml', 'application/x-httpd-php'],

  // Python
  ['py', 'text/x-python'],

  // Shell
  ['sh', 'text/x-sh'],

  // SCSS
  ['scss', 'text/x-scss'],

  // Video Text Tracks.
  ['vtt', 'text/vtt'],

  // LiveScript
  ['ls', 'text/x-livescript'],

  // Markdown
  ['md', 'text/markdown'],

  // ClojureScript
  ['cljs', 'text/x-clojure'], ['cljc', 'text/x-clojure'], ['cljx', 'text/x-clojure'],

  // Stylus
  ['styl', 'text/x-styl'],

  // JSX
  ['jsx', 'text/jsx'],

  // Image
  ['jpeg', 'image/jpeg'], ['jpg', 'image/jpeg'], ['svg', 'image/svg+xml'], ['gif', 'image/gif'], ['webp', 'image/webp'],
  ['png', 'image/png'], ['ico', 'image/ico'], ['tiff', 'image/tiff'], ['tif', 'image/tif'], ['bmp', 'image/bmp'],

  // Font
  ['ttf', 'font/opentype'], ['otf', 'font/opentype'], ['ttc', 'font/opentype'], ['woff', 'application/font-woff']
]);
