// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
FormatterWorker.HTMLFormatter = class {
  /**
   * @param {!FormatterWorker.FormattedContentBuilder} builder
   */
  constructor(builder) {
    this._builder = builder;
    this._jsFormatter = new FormatterWorker.JavaScriptFormatter(builder);
    this._cssFormatter = new FormatterWorker.CSSFormatter(builder);
  }

  /**
   * @param {string} text
   * @param {!Array<number>} lineEndings
   */
  format(text, lineEndings) {
    this._text = text;
    this._lineEndings = lineEndings;
    this._model = new FormatterWorker.HTMLModel(text);
    this._walk(this._model.document());
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Element} element
   * @param {number} offset
   */
  _formatTokensTill(element, offset) {
    while (this._model.peekToken() && this._model.peekToken().startOffset < offset) {
      const token = this._model.nextToken();
      this._formatToken(element, token);
    }
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Element} element
   */
  _walk(element) {
    if (element.parent)
      this._formatTokensTill(element.parent, element.openTag.startOffset);
    this._beforeOpenTag(element);
    this._formatTokensTill(element, element.openTag.endOffset);
    this._afterOpenTag(element);
    for (let i = 0; i < element.children.length; ++i)
      this._walk(element.children[i]);

    this._formatTokensTill(element, element.closeTag.startOffset);
    this._beforeCloseTag(element);
    this._formatTokensTill(element, element.closeTag.endOffset);
    this._afterCloseTag(element);
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Element} element
   */
  _beforeOpenTag(element) {
    if (!element.children.length || element === this._model.document())
      return;
    this._builder.addNewLine();
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Element} element
   */
  _afterOpenTag(element) {
    if (!element.children.length || element === this._model.document())
      return;
    this._builder.increaseNestingLevel();
    this._builder.addNewLine();
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Element} element
   */
  _beforeCloseTag(element) {
    if (!element.children.length || element === this._model.document())
      return;
    this._builder.decreaseNestingLevel();
    this._builder.addNewLine();
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Element} element
   */
  _afterCloseTag(element) {
    this._builder.addNewLine();
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Element} element
   * @param {!FormatterWorker.HTMLModel.Token} token
   */
  _formatToken(element, token) {
    if (token.value.isWhitespace())
      return;
    if (token.type.has('comment') || token.type.has('meta')) {
      this._builder.addNewLine();
      this._builder.addToken(token.value.trim(), token.startOffset);
      this._builder.addNewLine();
      return;
    }

    const isBodyToken =
        element.openTag.endOffset <= token.startOffset && token.startOffset < element.closeTag.startOffset;
    if (isBodyToken && element.name === 'style') {
      this._builder.addNewLine();
      this._builder.increaseNestingLevel();
      this._cssFormatter.format(this._text, this._lineEndings, token.startOffset, token.endOffset);
      this._builder.decreaseNestingLevel();
      return;
    }
    if (isBodyToken && element.name === 'script') {
      this._builder.addNewLine();
      this._builder.increaseNestingLevel();
      if (this._scriptTagIsJavaScript(element)) {
        this._jsFormatter.format(this._text, this._lineEndings, token.startOffset, token.endOffset);
      } else {
        this._builder.addToken(token.value, token.startOffset);
        this._builder.addNewLine();
      }
      this._builder.decreaseNestingLevel();
      return;
    }

    if (!isBodyToken && token.type.has('attribute'))
      this._builder.addSoftSpace();

    this._builder.addToken(token.value, token.startOffset);
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Element} element
   * @return {boolean}
   */
  _scriptTagIsJavaScript(element) {
    if (!element.openTag.attributes.has('type'))
      return true;
    let type = element.openTag.attributes.get('type').toLowerCase();
    if (!type)
      return true;
    const isWrappedInQuotes = /^(["\'])(.*)\1$/.exec(type.trim());
    if (isWrappedInQuotes)
      type = isWrappedInQuotes[2];
    return FormatterWorker.HTMLFormatter.SupportedJavaScriptMimeTypes.has(type.trim());
  }
};

FormatterWorker.HTMLFormatter.SupportedJavaScriptMimeTypes = new Set([
  'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
  'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
  'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript',
  'text/x-ecmascript', 'text/x-javascript'
]);

/**
 * @unrestricted
 */
FormatterWorker.HTMLModel = class {
  /**
   * @param {string} text
   */
  constructor(text) {
    this._state = FormatterWorker.HTMLModel.ParseState.Initial;
    this._document = new FormatterWorker.HTMLModel.Element('document');
    this._document.openTag = new FormatterWorker.HTMLModel.Tag('document', 0, 0, new Map(), true, false);
    this._document.closeTag =
        new FormatterWorker.HTMLModel.Tag('document', text.length, text.length, new Map(), false, false);

    this._stack = [this._document];

    this._tokens = [];
    this._tokenIndex = 0;
    this._build(text);
  }

  /**
   * @param {string} text
   */
  _build(text) {
    const tokenizer = FormatterWorker.createTokenizer('text/html');
    let lastOffset = 0;
    const lowerCaseText = text.toLowerCase();

    while (true) {
      tokenizer(text.substring(lastOffset), processToken.bind(this, lastOffset));
      if (lastOffset >= text.length)
        break;
      const element = this._stack.peekLast();
      lastOffset = lowerCaseText.indexOf('</' + element.name, lastOffset);
      if (lastOffset === -1)
        lastOffset = text.length;
      const tokenStart = element.openTag.endOffset;
      const tokenEnd = lastOffset;
      const tokenValue = text.substring(tokenStart, tokenEnd);
      this._tokens.push(new FormatterWorker.HTMLModel.Token(tokenValue, new Set(), tokenStart, tokenEnd));
    }

    while (this._stack.length > 1) {
      const element = this._stack.peekLast();
      this._popElement(
          new FormatterWorker.HTMLModel.Tag(element.name, text.length, text.length, new Map(), false, false));
    }

    /**
     * @param {number} baseOffset
     * @param {string} tokenValue
     * @param {?string} type
     * @param {number} tokenStart
     * @param {number} tokenEnd
     * @return {(!Object|undefined)}
     * @this {FormatterWorker.HTMLModel}
     */
    function processToken(baseOffset, tokenValue, type, tokenStart, tokenEnd) {
      tokenStart += baseOffset;
      tokenEnd += baseOffset;
      lastOffset = tokenEnd;

      const tokenType = type ? new Set(type.split(' ')) : new Set();
      const token = new FormatterWorker.HTMLModel.Token(tokenValue, tokenType, tokenStart, tokenEnd);
      this._tokens.push(token);
      this._updateDOM(token);

      const element = this._stack.peekLast();
      if (element && (element.name === 'script' || element.name === 'style') &&
          element.openTag.endOffset === lastOffset)
        return FormatterWorker.AbortTokenization;
    }
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Token} token
   */
  _updateDOM(token) {
    const S = FormatterWorker.HTMLModel.ParseState;
    const value = token.value;
    const type = token.type;
    switch (this._state) {
      case S.Initial:
        if (type.has('bracket') && (value === '<' || value === '</')) {
          this._onStartTag(token);
          this._state = S.Tag;
        }
        return;
      case S.Tag:
        if (type.has('tag') && !type.has('bracket')) {
          this._tagName = value.trim().toLowerCase();
        } else if (type.has('attribute')) {
          this._attributeName = value.trim().toLowerCase();
          this._attributes.set(this._attributeName, '');
          this._state = S.AttributeName;
        } else if (type.has('bracket') && (value === '>' || value === '/>')) {
          this._onEndTag(token);
          this._state = S.Initial;
        }
        return;
      case S.AttributeName:
        if (!type.size && value === '=') {
          this._state = S.AttributeValue;
        } else if (type.has('bracket') && (value === '>' || value === '/>')) {
          this._onEndTag(token);
          this._state = S.Initial;
        }
        return;
      case S.AttributeValue:
        if (type.has('string')) {
          this._attributes.set(this._attributeName, value);
          this._state = S.Tag;
        } else if (type.has('bracket') && (value === '>' || value === '/>')) {
          this._onEndTag(token);
          this._state = S.Initial;
        }
        return;
    }
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Token} token
   */
  _onStartTag(token) {
    this._tagName = '';
    this._tagStartOffset = token.startOffset;
    this._tagEndOffset = null;
    this._attributes = new Map();
    this._attributeName = '';
    this._isOpenTag = token.value === '<';
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Token} token
   */
  _onEndTag(token) {
    this._tagEndOffset = token.endOffset;
    const selfClosingTag = token.value === '/>' || FormatterWorker.HTMLModel.SelfClosingTags.has(this._tagName);
    const tag = new FormatterWorker.HTMLModel.Tag(
        this._tagName, this._tagStartOffset, this._tagEndOffset, this._attributes, this._isOpenTag, selfClosingTag);
    this._onTagComplete(tag);
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Tag} tag
   */
  _onTagComplete(tag) {
    if (tag.isOpenTag) {
      const topElement = this._stack.peekLast();
      if (topElement !== this._document && topElement.openTag.selfClosingTag)
        this._popElement(autocloseTag(topElement, topElement.openTag.endOffset));
      else if (
          (topElement.name in FormatterWorker.HTMLModel.AutoClosingTags) &&
          FormatterWorker.HTMLModel.AutoClosingTags[topElement.name].has(tag.name))
        this._popElement(autocloseTag(topElement, tag.startOffset));
      this._pushElement(tag);
      return;
    }

    while (this._stack.length > 1 && this._stack.peekLast().name !== tag.name)
      this._popElement(autocloseTag(this._stack.peekLast(), tag.startOffset));
    if (this._stack.length === 1)
      return;
    this._popElement(tag);

    /**
     * @param {!FormatterWorker.HTMLModel.Element} element
     * @param {number} offset
     * @return {!FormatterWorker.HTMLModel.Tag}
     */
    function autocloseTag(element, offset) {
      return new FormatterWorker.HTMLModel.Tag(element.name, offset, offset, new Map(), false, false);
    }
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Tag} closeTag
   */
  _popElement(closeTag) {
    const element = this._stack.pop();
    element.closeTag = closeTag;
  }

  /**
   * @param {!FormatterWorker.HTMLModel.Tag} openTag
   */
  _pushElement(openTag) {
    const topElement = this._stack.peekLast();
    const newElement = new FormatterWorker.HTMLModel.Element(openTag.name);
    newElement.parent = topElement;
    topElement.children.push(newElement);
    newElement.openTag = openTag;
    this._stack.push(newElement);
  }

  /**
   * @return {?FormatterWorker.HTMLModel.Token}
   */
  peekToken() {
    return this._tokenIndex < this._tokens.length ? this._tokens[this._tokenIndex] : null;
  }

  /**
   * @return {?FormatterWorker.HTMLModel.Token}
   */
  nextToken() {
    return this._tokens[this._tokenIndex++];
  }

  /**
   * @return {!FormatterWorker.HTMLModel.Element}
   */
  document() {
    return this._document;
  }
};

FormatterWorker.HTMLModel.SelfClosingTags = new Set([
  'area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source',
  'track', 'wbr'
]);

// @see https://www.w3.org/TR/html/syntax.html 8.1.2.4 Optional tags
FormatterWorker.HTMLModel.AutoClosingTags = {
  'head': new Set(['body']),
  'li': new Set(['li']),
  'dt': new Set(['dt', 'dd']),
  'dd': new Set(['dt', 'dd']),
  'p': new Set([
    'address', 'article', 'aside', 'blockquote', 'div', 'dl',      'fieldset', 'footer', 'form',
    'h1',      'h2',      'h3',    'h4',         'h5',  'h6',      'header',   'hgroup', 'hr',
    'main',    'nav',     'ol',    'p',          'pre', 'section', 'table',    'ul'
  ]),
  'rb': new Set(['rb', 'rt', 'rtc', 'rp']),
  'rt': new Set(['rb', 'rt', 'rtc', 'rp']),
  'rtc': new Set(['rb', 'rtc', 'rp']),
  'rp': new Set(['rb', 'rt', 'rtc', 'rp']),
  'optgroup': new Set(['optgroup']),
  'option': new Set(['option', 'optgroup']),
  'colgroup': new Set(['colgroup']),
  'thead': new Set(['tbody', 'tfoot']),
  'tbody': new Set(['tbody', 'tfoot']),
  'tfoot': new Set(['tbody']),
  'tr': new Set(['tr']),
  'td': new Set(['td', 'th']),
  'th': new Set(['td', 'th']),
};

/** @enum {string} */
FormatterWorker.HTMLModel.ParseState = {
  Initial: 'Initial',
  Tag: 'Tag',
  AttributeName: 'AttributeName',
  AttributeValue: 'AttributeValue'
};

/**
 * @unrestricted
 */
FormatterWorker.HTMLModel.Token = class {
  /**
   * @param {string} value
   * @param {!Set<string>} type
   * @param {number} startOffset
   * @param {number} endOffset
   */
  constructor(value, type, startOffset, endOffset) {
    this.value = value;
    this.type = type;
    this.startOffset = startOffset;
    this.endOffset = endOffset;
  }
};

/**
 * @unrestricted
 */
FormatterWorker.HTMLModel.Tag = class {
  /**
   * @param {string} name
   * @param {number} startOffset
   * @param {number} endOffset
   * @param {!Map<string, string>} attributes
   * @param {boolean} isOpenTag
   * @param {boolean} selfClosingTag
   */
  constructor(name, startOffset, endOffset, attributes, isOpenTag, selfClosingTag) {
    this.name = name;
    this.startOffset = startOffset;
    this.endOffset = endOffset;
    this.attributes = attributes;
    this.isOpenTag = isOpenTag;
    this.selfClosingTag = selfClosingTag;
  }
};

/**
 * @unrestricted
 */
FormatterWorker.HTMLModel.Element = class {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
    this.children = [];
    this.parent = null;
    this.openTag = null;
    this.closeTag = null;
  }
};
