// Copyright (c) 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @implements {SDK.TargetManager.Observer}
 * @unrestricted
 */
Resources.AppManifestView = class extends UI.VBox {
  constructor() {
    super(true);
    this.registerRequiredCSS('resources/appManifestView.css');

    this._emptyView = new UI.EmptyWidget(Common.UIString('No manifest detected'));
    const p = this._emptyView.appendParagraph();
    const linkElement = UI.XLink.create(
        'https://developers.google.com/web/fundamentals/engage-and-retain/web-app-manifest/?utm_source=devtools',
        Common.UIString('Read more about the web manifest'));
    p.appendChild(UI.formatLocalized('A web manifest allows you to control how your app behaves when launched and displayed to the user. %s', [linkElement]));

    this._emptyView.show(this.contentElement);
    this._emptyView.hideWidget();

    this._reportView = new UI.ReportView(Common.UIString('App Manifest'));
    this._reportView.show(this.contentElement);
    this._reportView.hideWidget();

    this._errorsSection = this._reportView.appendSection(Common.UIString('Errors and warnings'));
    this._installabilitySection = this._reportView.appendSection(Common.UIString('Installability'));
    this._identitySection = this._reportView.appendSection(Common.UIString('Identity'));

    this._presentationSection = this._reportView.appendSection(Common.UIString('Presentation'));
    this._iconsSection = this._reportView.appendSection(Common.UIString('Icons'));

    this._nameField = this._identitySection.appendField(Common.UIString('Name'));
    this._shortNameField = this._identitySection.appendField(Common.UIString('Short name'));

    this._startURLField = this._presentationSection.appendField(Common.UIString('Start URL'));

    const themeColorField = this._presentationSection.appendField(Common.UIString('Theme color'));
    this._themeColorSwatch = InlineEditor.ColorSwatch.create();
    themeColorField.appendChild(this._themeColorSwatch);

    const backgroundColorField = this._presentationSection.appendField(Common.UIString('Background color'));
    this._backgroundColorSwatch = InlineEditor.ColorSwatch.create();
    backgroundColorField.appendChild(this._backgroundColorSwatch);

    this._orientationField = this._presentationSection.appendField(Common.UIString('Orientation'));
    this._displayField = this._presentationSection.appendField(Common.UIString('Display'));

    this._throttler = new Common.Throttler(1000);
    SDK.targetManager.observeTargets(this);
  }

  /**
   * @override
   * @param {!SDK.Target} target
   */
  targetAdded(target) {
    if (this._target)
      return;
    this._target = target;
    this._resourceTreeModel = target.model(SDK.ResourceTreeModel);
    this._serviceWorkerManager = target.model(SDK.ServiceWorkerManager);
    if (!this._resourceTreeModel || !this._serviceWorkerManager)
      return;

    this._updateManifest(true);

    this._registeredListeners = [
      this._resourceTreeModel.addEventListener(
          SDK.ResourceTreeModel.Events.DOMContentLoaded, this._updateManifest.bind(this, true)),
      this._serviceWorkerManager.addEventListener(
          SDK.ServiceWorkerManager.Events.RegistrationUpdated, this._updateManifest.bind(this, false))
    ];
  }

  /**
   * @override
   * @param {!SDK.Target} target
   */
  targetRemoved(target) {
    if (this._target !== target)
      return;
    if (!this._resourceTreeModel || !this._serviceWorkerManager)
      return;
    delete this._resourceTreeModel;
    delete this._serviceWorkerManager;
    Common.EventTarget.removeEventListeners(this._registeredListeners);
  }

  /**
   * @param {boolean} immediately
   */
  async _updateManifest(immediately) {
    const {url, data, errors} = await this._resourceTreeModel.fetchAppManifest();
    this._throttler.schedule(() => this._renderManifest(url, data, errors), immediately);
  }

  /**
   * @param {string} url
   * @param {?string} data
   * @param {!Array<!Protocol.Page.AppManifestError>} errors
   */
  async _renderManifest(url, data, errors) {
    if (!data && !errors.length) {
      this._emptyView.showWidget();
      this._reportView.hideWidget();
      return;
    }
    this._emptyView.hideWidget();
    this._reportView.showWidget();

    this._reportView.setURL(Components.Linkifier.linkifyURL(url));
    this._errorsSection.clearContent();
    this._errorsSection.element.classList.toggle('hidden', !errors.length);
    for (const error of errors) {
      this._errorsSection.appendRow().appendChild(
          UI.createLabel(error.message, error.critical ? 'smallicon-error' : 'smallicon-warning'));
    }

    if (!data)
      return;

    const installabilityErrors = [];

    if (data.charCodeAt(0) === 0xFEFF)
      data = data.slice(1);  // Trim the BOM as per https://tools.ietf.org/html/rfc7159#section-8.1.

    const parsedManifest = JSON.parse(data);
    this._nameField.textContent = stringProperty('name');
    this._shortNameField.textContent = stringProperty('short_name');
    if (!this._nameField.textContent && !this._shortNameField.textContent)
      installabilityErrors.push(ls`Either 'name' or 'short_name' is required`);

    this._startURLField.removeChildren();
    const startURL = stringProperty('start_url');
    if (startURL) {
      const completeURL = /** @type {string} */ (Common.ParsedURL.completeURL(url, startURL));
      this._startURLField.appendChild(Components.Linkifier.linkifyURL(completeURL, {text: startURL}));
      if (!this._serviceWorkerManager.hasRegistrationForURLs([completeURL, this._target.inspectedURL()]))
        installabilityErrors.push(ls`Service worker is not registered or does not control the Start URL`);
      else if (!await this._swHasFetchHandler())
        installabilityErrors.push(ls`Service worker does not have the 'fetch' handler`);
    } else {
      installabilityErrors.push(ls`'start_url' needs to be a valid URL`);
    }


    this._themeColorSwatch.classList.toggle('hidden', !stringProperty('theme_color'));
    const themeColor = Common.Color.parse(stringProperty('theme_color') || 'white') || Common.Color.parse('white');
    this._themeColorSwatch.setColor(/** @type {!Common.Color} */ (themeColor));
    this._backgroundColorSwatch.classList.toggle('hidden', !stringProperty('background_color'));
    const backgroundColor =
        Common.Color.parse(stringProperty('background_color') || 'white') || Common.Color.parse('white');
    this._backgroundColorSwatch.setColor(/** @type {!Common.Color} */ (backgroundColor));

    this._orientationField.textContent = stringProperty('orientation');
    const displayType = stringProperty('display');
    this._displayField.textContent = displayType;
    if (!['minimal-ui', 'standalone', 'fullscreen'].includes(displayType))
      installabilityErrors.push(ls`'display' property must be set to 'standalone', 'fullscreen' or 'minimal-ui'`);

    const icons = parsedManifest['icons'] || [];
    let hasInstallableIcon = false;
    this._iconsSection.clearContent();

    for (const icon of icons) {
      if (!icon.sizes)
        hasInstallableIcon = true;  // any
      const title = (icon['sizes'] || '') + '\n' + (icon['type'] || '');
      try {
        const widthHeight = icon['sizes'].split('x');
        if (parseInt(widthHeight[0], 10) >= 144 && parseInt(widthHeight[1], 10) >= 144)
          hasInstallableIcon = true;
      } catch (e) {
      }

      const field = this._iconsSection.appendField(title);
      const image = await this._loadImage(Common.ParsedURL.completeURL(url, icon['src']));
      if (image)
        field.appendChild(image);
      else
        installabilityErrors.push(ls`Some of the icons could not be loaded`);
    }
    if (!hasInstallableIcon)
      installabilityErrors.push(ls`An icon at least 144px x 144px large is required`);

    this._installabilitySection.clearContent();
    this._installabilitySection.element.classList.toggle('hidden', !installabilityErrors.length);
    for (const error of installabilityErrors)
      this._installabilitySection.appendRow().appendChild(UI.createLabel(error, 'smallicon-warning'));

    /**
     * @param {string} name
     * @return {string}
     */
    function stringProperty(name) {
      const value = parsedManifest[name];
      if (typeof value !== 'string')
        return '';
      return value;
    }
  }

  /**
   * @return {!Promise<boolean>}
   */
  async _swHasFetchHandler() {
    for (const target of SDK.targetManager.targets()) {
      if (target.type() !== SDK.Target.Type.Worker)
        continue;
      if (!target.parentTarget() || target.parentTarget().type() !== SDK.Target.Type.ServiceWorker)
        continue;

      const ec = target.model(SDK.RuntimeModel).defaultExecutionContext();
      const result = await ec.evaluate(
          {
            expression: `'fetch' in getEventListeners(self)`,
            includeCommandLineAPI: true,
            silent: true,
            returnByValue: true
          },
          false, false);
      if (!result.object || !result.object.value)
        continue;
      return true;
    }
    return false;
  }

  /**
   * @param {?string} url
   * @return {!Promise<?Image>}
   */
  async _loadImage(url) {
    const image = createElement('img');
    image.style.maxWidth = '200px';
    image.style.maxHeight = '200px';
    const result = new Promise((f, r) => {
      image.onload = f;
      image.onerror = r;
    });
    image.src = url;
    try {
      await result;
      return image;
    } catch (e) {
    }
    return null;
  }
};
