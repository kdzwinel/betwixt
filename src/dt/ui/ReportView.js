// Copyright (c) 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @unrestricted
 */
UI.ReportView = class extends UI.VBox {
  /**
   * @param {string=} title
   */
  constructor(title) {
    super(true);
    this.registerRequiredCSS('ui/reportView.css');

    this._contentBox = this.contentElement.createChild('div', 'report-content-box');
    this._headerElement = this._contentBox.createChild('div', 'report-header vbox');
    this._titleElement = this._headerElement.createChild('div', 'report-title');
    this._titleElement.textContent = title;

    this._sectionList = this._contentBox.createChild('div', 'vbox');
  }

  /**
   * @param {string} title
   */
  setTitle(title) {
    if (this._titleElement.textContent === title)
      return;
    this._titleElement.textContent = title;
  }

  /**
   * @param {string} subtitle
   */
  setSubtitle(subtitle) {
    if (this._subtitleElement && this._subtitleElement.textContent === subtitle)
      return;
    if (!this._subtitleElement)
      this._subtitleElement = this._headerElement.createChild('div', 'report-subtitle');
    this._subtitleElement.textContent = subtitle;
  }

  /**
   * @param {?Element} link
   */
  setURL(link) {
    if (!this._urlElement)
      this._urlElement = this._headerElement.createChild('div', 'report-url link');
    this._urlElement.removeChildren();
    if (link)
      this._urlElement.appendChild(link);
  }

  /**
   * @return {!UI.Toolbar}
   */
  createToolbar() {
    const toolbar = new UI.Toolbar('');
    this._headerElement.appendChild(toolbar.element);
    return toolbar;
  }

  /**
   * @param {string} title
   * @param {string=} className
   * @return {!UI.ReportView.Section}
   */
  appendSection(title, className) {
    const section = new UI.ReportView.Section(title, className);
    section.show(this._sectionList);
    return section;
  }

  /**
   * @param {function(!UI.ReportView.Section, !UI.ReportView.Section): number} comparator
   */
  sortSections(comparator) {
    const sections = /** @type {!Array<!UI.ReportView.Section>} */ (this.children().slice());
    const sorted = sections.every((e, i, a) => !i || comparator(a[i - 1], a[i]) <= 0);
    if (sorted)
      return;

    this.detachChildWidgets();
    sections.sort(comparator);
    for (const section of sections)
      section.show(this._sectionList);
  }

  /**
   * @param {boolean} visible
   */
  setHeaderVisible(visible) {
    this._headerElement.classList.toggle('hidden', !visible);
  }


  /**
   * @param {boolean} scrollable
   */
  setBodyScrollable(scrollable) {
    this._contentBox.classList.toggle('no-scroll', !scrollable);
  }
};

/**
 * @unrestricted
 */
UI.ReportView.Section = class extends UI.VBox {
  /**
   * @param {string} title
   * @param {string=} className
   */
  constructor(title, className) {
    super();
    this.element.classList.add('report-section');
    if (className)
      this.element.classList.add(className);
    this._headerElement = this.element.createChild('div', 'report-section-header');
    this._titleElement = this._headerElement.createChild('div', 'report-section-title');
    this._titleElement.textContent = title;
    this._fieldList = this.element.createChild('div', 'vbox');
    /** @type {!Map.<string, !Element>} */
    this._fieldMap = new Map();
  }

  /**
   * @return {string}
   */
  title() {
    return this._titleElement.textContent;
  }

  /**
   * @param {string} title
   */
  setTitle(title) {
    if (this._titleElement.textContent !== title)
      this._titleElement.textContent = title;
  }

  /**
   * @return {!UI.Toolbar}
   */
  createToolbar() {
    const toolbar = new UI.Toolbar('');
    this._headerElement.appendChild(toolbar.element);
    return toolbar;
  }

  /**
   * @param {string} title
   * @param {string=} textValue
   * @return {!Element}
   */
  appendField(title, textValue) {
    let row = this._fieldMap.get(title);
    if (!row) {
      row = this._fieldList.createChild('div', 'report-field');
      row.createChild('div', 'report-field-name').textContent = title;
      this._fieldMap.set(title, row);
      row.createChild('div', 'report-field-value');
    }
    if (textValue)
      row.lastElementChild.textContent = textValue;
    return /** @type {!Element} */ (row.lastElementChild);
  }

  /**
   * @param {string} title
   */
  removeField(title) {
    const row = this._fieldMap.get(title);
    if (row)
      row.remove();
    this._fieldMap.delete(title);
  }

  /**
   * @param {string} title
   * @param {boolean} visible
   */
  setFieldVisible(title, visible) {
    const row = this._fieldMap.get(title);
    if (row)
      row.classList.toggle('hidden', !visible);
  }

  /**
   * @param {string} title
   * @return {?Element}
   */
  fieldValue(title) {
    const row = this._fieldMap.get(title);
    return row ? row.lastElementChild : null;
  }

  /**
   * @return {!Element}
   */
  appendRow() {
    return this._fieldList.createChild('div', 'report-row');
  }

  clearContent() {
    this._fieldList.removeChildren();
    this._fieldMap.clear();
  }
};
