/*
 * Copyright (C) 2009 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 * Copyright (C) 2010 Google Inc. All rights reserved.
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
CookieTable.CookiesTable = class extends UI.VBox {
  /**
   * @param {function(!SDK.Cookie, ?SDK.Cookie): !Promise<boolean>=} saveCallback
   * @param {function()=} refreshCallback
   * @param {function()=} selectedCallback
   * @param {function(!SDK.Cookie, function())=} deleteCallback
   */
  constructor(saveCallback, refreshCallback, selectedCallback, deleteCallback) {
    super();

    this._saveCallback = saveCallback;
    this._refreshCallback = refreshCallback;
    this._deleteCallback = deleteCallback;

    const editable = !!saveCallback;

    const columns = /** @type {!Array<!DataGrid.DataGrid.ColumnDescriptor>} */ ([
      {
        id: 'name',
        title: Common.UIString('Name'),
        sortable: true,
        disclosure: editable,
        sort: DataGrid.DataGrid.Order.Ascending,
        longText: true,
        weight: 24,
        editable: editable
      },
      {id: 'value', title: Common.UIString('Value'), sortable: true, longText: true, weight: 34, editable: editable},
      {id: 'domain', title: Common.UIString('Domain'), sortable: true, weight: 7, editable: editable},
      {id: 'path', title: Common.UIString('Path'), sortable: true, weight: 7, editable: editable},
      {id: 'expires', title: Common.UIString('Expires / Max-Age'), sortable: true, weight: 7, editable: editable},
      {id: 'size', title: Common.UIString('Size'), sortable: true, align: DataGrid.DataGrid.Align.Right, weight: 7}, {
        id: 'httpOnly',
        title: Common.UIString('HTTP'),
        sortable: true,
        align: DataGrid.DataGrid.Align.Center,
        weight: 7
      },
      {
        id: 'secure',
        title: Common.UIString('Secure'),
        sortable: true,
        align: DataGrid.DataGrid.Align.Center,
        weight: 7
      },
      {
        id: 'sameSite',
        title: Common.UIString('SameSite'),
        sortable: true,
        align: DataGrid.DataGrid.Align.Center,
        weight: 7
      }
    ]);

    if (editable) {
      this._dataGrid = new DataGrid.DataGrid(
          columns, this._onUpdateCookie.bind(this), this._onDeleteCookie.bind(this), refreshCallback);
    } else {
      this._dataGrid = new DataGrid.DataGrid(columns);
    }
    this._dataGrid.setStriped(true);

    this._dataGrid.setName('cookiesTable');
    this._dataGrid.addEventListener(DataGrid.DataGrid.Events.SortingChanged, this._rebuildTable, this);

    if (selectedCallback)
      this._dataGrid.addEventListener(DataGrid.DataGrid.Events.SelectedNode, selectedCallback, this);

    /** @type {?string} */
    this._lastEditedColumnId = null;

    this._dataGrid.asWidget().show(this.element);
    this._data = [];

    /** @type {string} */
    this._cookieDomain = '';
  }

  /**
   * @param {!Array.<!SDK.Cookie>} cookies
   */
  setCookies(cookies) {
    this.setCookieFolders([{cookies: cookies}]);
  }

  /**
   * @param {!Array.<!{folderName: ?string, cookies: ?Array.<!SDK.Cookie>}>} cookieFolders
   */
  setCookieFolders(cookieFolders) {
    this._data = cookieFolders;
    this._rebuildTable();
  }

  /**
   * @param {string} cookieDomain
   */
  setCookieDomain(cookieDomain) {
    this._cookieDomain = cookieDomain;
  }

  /**
   * @return {?SDK.Cookie}
   */
  selectedCookie() {
    const node = this._dataGrid.selectedNode;
    return node ? node.cookie : null;
  }

  /**
   * @return {{current: ?SDK.Cookie, neighbor: ?SDK.Cookie}}
   */
  _getSelectionCookies() {
    const node = this._dataGrid.selectedNode;
    const nextNeighbor = node && node.traverseNextNode(true);
    const previousNeighbor = node && node.traversePreviousNode(true);

    return {
      current: node && node.cookie,
      neighbor: (nextNeighbor && nextNeighbor.cookie) || (previousNeighbor && previousNeighbor.cookie)
    };
  }

  /**
   * @override
   */
  willHide() {
    this._lastEditedColumnId = null;
  }

  /**
   * @param {{current: ?SDK.Cookie, neighbor: ?SDK.Cookie}} selectionCookies
   * @param {?Array<!SDK.Cookie>} cookies
   * @return {?SDK.Cookie}
   */
  _findSelectedCookie(selectionCookies, cookies) {
    if (!cookies)
      return null;

    const current = selectionCookies.current;
    const foundCurrent = cookies.find(cookie => this._isSameCookie(cookie, current));
    if (foundCurrent)
      return foundCurrent;

    const neighbor = selectionCookies.neighbor;
    const foundNeighbor = cookies.find(cookie => this._isSameCookie(cookie, neighbor));
    if (foundNeighbor)
      return foundNeighbor;

    return null;
  }

  /**
   * @param {!SDK.Cookie} cookieA
   * @param {?SDK.Cookie} cookieB
   * @return {boolean}
   */
  _isSameCookie(cookieA, cookieB) {
    return !!cookieB && cookieB.name() === cookieA.name() && cookieB.domain() === cookieA.domain() &&
        cookieB.path() === cookieA.path();
  }

  _rebuildTable() {
    const selectionCookies = this._getSelectionCookies();
    const lastEditedColumnId = this._lastEditedColumnId;
    this._lastEditedColumnId = null;
    this._dataGrid.rootNode().removeChildren();
    for (let i = 0; i < this._data.length; ++i) {
      const item = this._data[i];
      const selectedCookie = this._findSelectedCookie(selectionCookies, item.cookies);
      if (item.folderName) {
        const groupData = {
          name: item.folderName,
          value: '',
          domain: '',
          path: '',
          expires: '',
          size: this._totalSize(item.cookies),
          httpOnly: '',
          secure: '',
          sameSite: ''
        };
        const groupNode = new DataGrid.DataGridNode(groupData);
        groupNode.selectable = true;
        this._dataGrid.rootNode().appendChild(groupNode);
        groupNode.element().classList.add('row-group');
        this._populateNode(groupNode, item.cookies, selectedCookie, lastEditedColumnId);
        groupNode.expand();
      } else {
        this._populateNode(this._dataGrid.rootNode(), item.cookies, selectedCookie, lastEditedColumnId);
      }
    }
    if (selectionCookies.current && lastEditedColumnId && !this._dataGrid.selectedNode)
      this._addInactiveNode(this._dataGrid.rootNode(), selectionCookies.current, lastEditedColumnId);
    if (this._saveCallback)
      this._dataGrid.addCreationNode(false);
  }

  /**
   * @param {!DataGrid.DataGridNode} parentNode
   * @param {?Array.<!SDK.Cookie>} cookies
   * @param {?SDK.Cookie} selectedCookie
   * @param {?string} lastEditedColumnId
   */
  _populateNode(parentNode, cookies, selectedCookie, lastEditedColumnId) {
    parentNode.removeChildren();
    if (!cookies)
      return;

    this._sortCookies(cookies);
    for (let i = 0; i < cookies.length; ++i) {
      const cookie = cookies[i];
      const cookieNode = this._createGridNode(cookie);
      parentNode.appendChild(cookieNode);
      if (this._isSameCookie(cookie, selectedCookie)) {
        cookieNode.select();
        if (lastEditedColumnId !== null)
          this._dataGrid.startEditingNextEditableColumnOfDataGridNode(cookieNode, lastEditedColumnId);
      }
    }
  }

  /**
   * @param {!DataGrid.DataGridNode} parentNode
   * @param {!SDK.Cookie} cookie
   * @param {?string} editedColumnId
   */
  _addInactiveNode(parentNode, cookie, editedColumnId) {
    const cookieNode = this._createGridNode(cookie);
    parentNode.appendChild(cookieNode);
    cookieNode.select();
    cookieNode.setInactive(true);
    if (editedColumnId !== null)
      this._dataGrid.startEditingNextEditableColumnOfDataGridNode(cookieNode, editedColumnId);
  }

  _totalSize(cookies) {
    let totalSize = 0;
    for (let i = 0; cookies && i < cookies.length; ++i)
      totalSize += cookies[i].size();
    return totalSize;
  }

  /**
   * @param {!Array.<!SDK.Cookie>} cookies
   */
  _sortCookies(cookies) {
    const sortDirection = this._dataGrid.isSortOrderAscending() ? 1 : -1;

    /**
     * @param {!SDK.Cookie} cookie
     * @param {string} property
     * @return {string}
     */
    function getValue(cookie, property) {
      return typeof cookie[property] === 'function' ? String(cookie[property]()) : String(cookie.name());
    }

    /**
     * @param {string} property
     * @param {!SDK.Cookie} cookie1
     * @param {!SDK.Cookie} cookie2
     */
    function compareTo(property, cookie1, cookie2) {
      return sortDirection * getValue(cookie1, property).compareTo(getValue(cookie2, property));
    }

    /**
     * @param {!SDK.Cookie} cookie1
     * @param {!SDK.Cookie} cookie2
     */
    function numberCompare(cookie1, cookie2) {
      return sortDirection * (cookie1.size() - cookie2.size());
    }

    /**
     * @param {!SDK.Cookie} cookie1
     * @param {!SDK.Cookie} cookie2
     */
    function expiresCompare(cookie1, cookie2) {
      if (cookie1.session() !== cookie2.session())
        return sortDirection * (cookie1.session() ? 1 : -1);

      if (cookie1.session())
        return 0;

      if (cookie1.maxAge() && cookie2.maxAge())
        return sortDirection * (cookie1.maxAge() - cookie2.maxAge());
      if (cookie1.expires() && cookie2.expires())
        return sortDirection * (cookie1.expires() - cookie2.expires());
      return sortDirection * (cookie1.expires() ? 1 : -1);
    }

    let comparator;
    const columnId = this._dataGrid.sortColumnId() || 'name';
    if (columnId === 'expires')
      comparator = expiresCompare;
    else if (columnId === 'size')
      comparator = numberCompare;
    else
      comparator = compareTo.bind(null, columnId);
    cookies.sort(comparator);
  }

  /**
   * @param {!SDK.Cookie} cookie
   * @return {!DataGrid.DataGridNode}
   */
  _createGridNode(cookie) {
    const data = {};
    data.name = cookie.name();
    data.value = cookie.value();
    if (cookie.type() === SDK.Cookie.Type.Request) {
      data.domain = Common.UIString('N/A');
      data.path = Common.UIString('N/A');
      data.expires = Common.UIString('N/A');
    } else {
      data.domain = cookie.domain() || '';
      data.path = cookie.path() || '';
      if (cookie.maxAge()) {
        data.expires = Number.secondsToString(parseInt(cookie.maxAge(), 10));
      } else if (cookie.expires()) {
        if (cookie.expires() < 0)
          data.expires = 'N/A';
        else
          data.expires = new Date(cookie.expires()).toISOString();
      } else {
        data.expires = CookieTable.CookiesTable._expiresSessionValue;
      }
    }
    data.size = cookie.size();
    const checkmark = '\u2713';
    data.httpOnly = (cookie.httpOnly() ? checkmark : '');
    data.secure = (cookie.secure() ? checkmark : '');
    data.sameSite = cookie.sameSite() || '';

    const node = new DataGrid.DataGridNode(data);
    node.cookie = cookie;
    node.selectable = true;
    return node;
  }

  /**
   * @param {!DataGrid.DataGridNode} node
   */
  _onDeleteCookie(node) {
    if (node.cookie && this._deleteCallback)
      this._deleteCallback(node.cookie, () => this._refresh());
  }

  /**
   * @param {!DataGrid.DataGridNode} editingNode
   * @param {string} columnIdentifier
   * @param {string} oldText
   * @param {string} newText
   */
  _onUpdateCookie(editingNode, columnIdentifier, oldText, newText) {
    this._lastEditedColumnId = columnIdentifier;
    this._setDefaults(editingNode);
    if (this._isValidCookieData(editingNode.data))
      this._saveNode(editingNode);
    else
      editingNode.setDirty(true);
  }

  /**
   * @param {!DataGrid.DataGridNode} node
   */
  _setDefaults(node) {
    if (node.data.name === null)
      node.data.name = '';
    if (node.data.value === null)
      node.data.value = '';
    if (node.data.domain === null)
      node.data.domain = this._cookieDomain;
    if (node.data.path === null)
      node.data.path = '/';
    if (node.data.expires === null)
      node.data.expires = CookieTable.CookiesTable._expiresSessionValue;
  }

  /**
   * @param {!DataGrid.DataGridNode} node
   */
  _saveNode(node) {
    const oldCookie = node.cookie;
    const newCookie = this._createCookieFromData(node.data);
    node.cookie = newCookie;
    this._saveCallback(newCookie, oldCookie).then(success => {
      if (success)
        this._refresh();
      else
        node.setDirty(true);
    });
  }

  /**
   * @param {!Object.<string, *>} data
   * @returns {!SDK.Cookie}
   */
  _createCookieFromData(data) {
    const cookie = new SDK.Cookie(data.name, data.value, null);
    cookie.addAttribute('domain', data.domain);
    cookie.addAttribute('path', data.path);
    if (data.expires && data.expires !== CookieTable.CookiesTable._expiresSessionValue)
      cookie.addAttribute('expires', (new Date(data.expires)).toUTCString());
    if (data.httpOnly)
      cookie.addAttribute('httpOnly');
    if (data.secure)
      cookie.addAttribute('secure');
    if (data.sameSite)
      cookie.addAttribute('sameSite', data.sameSite);
    cookie.setSize(data.name.length + data.value.length);
    return cookie;
  }

  /**
   * @param {!Object.<string, *>} data
   * @returns {boolean}
   */
  _isValidCookieData(data) {
    return (data.name || data.value) && this._isValidDomain(data.domain) && this._isValidPath(data.path) &&
        this._isValidDate(data.expires);
  }

  /**
   * @param {string} domain
   * @returns {boolean}
   */
  _isValidDomain(domain) {
    if (!domain)
      return true;
    const parsedURL = ('http://' + domain).asParsedURL();
    return !!parsedURL && parsedURL.domain() === domain;
  }

  /**
   * @param {string} path
   * @returns {boolean}
   */
  _isValidPath(path) {
    const parsedURL = ('http://example.com' + path).asParsedURL();
    return !!parsedURL && parsedURL.path === path;
  }

  /**
   * @param {string} date
   * @returns {boolean}
   */
  _isValidDate(date) {
    return date === '' || date === CookieTable.CookiesTable._expiresSessionValue || !isNaN(Date.parse(date));
  }

  _refresh() {
    if (this._refreshCallback)
      this._refreshCallback();
  }
};

/** @const */
CookieTable.CookiesTable._expiresSessionValue = Common.UIString('Session');
