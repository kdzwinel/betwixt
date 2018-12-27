// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @unrestricted
 */
Audits2.StartView = class extends UI.Widget {
  /**
   * @param {!Audits2.AuditController} controller
   */
  constructor(controller) {
    super();
    this.registerRequiredCSS('audits2/audits2StartView.css');
    this._controller = controller;
    this._render();
  }

  /**
   * @param {string} settingName
   * @param {!Element} parentElement
   */
  _populateRuntimeSettingAsRadio(settingName, parentElement) {
    const runtimeSetting = Audits2.RuntimeSettings.find(item => item.setting.name === settingName);
    if (!runtimeSetting || !runtimeSetting.options)
      throw new Error(`${settingName} is not a setting with options`);

    const control = new Audits2.RadioSetting(runtimeSetting.options, runtimeSetting.setting);
    control.element.title = runtimeSetting.description;
    parentElement.appendChild(control.element);
  }

  /**
   * @param {string} settingName
   * @param {!Element} parentElement
   */
  _populateRuntimeSettingAsCheckbox(settingName, parentElement) {
    const runtimeSetting = Audits2.RuntimeSettings.find(item => item.setting.name === settingName);
    if (!runtimeSetting || !runtimeSetting.title)
      throw new Error(`${settingName} is not a setting with a title`);

    runtimeSetting.setting.setTitle(runtimeSetting.title);
    const control = new UI.ToolbarSettingCheckbox(runtimeSetting.setting, runtimeSetting.description);
    parentElement.appendChild(control.element);
  }

  /**
   * @param {!UI.Fragment} fragment
   */
  _populateFormControls(fragment) {
    // Populate the device type
    const deviceTypeFormElements = fragment.$('device-type-form-elements');
    this._populateRuntimeSettingAsRadio('audits2.device_type', deviceTypeFormElements);

    // Populate the audit categories
    const categoryFormElements = fragment.$('categories-form-elements');
    for (const preset of Audits2.Presets) {
      preset.setting.setTitle(preset.title);
      const checkbox = new UI.ToolbarSettingCheckbox(preset.setting);
      const row = categoryFormElements.createChild('div', 'vbox audits2-launcher-row');
      row.title = preset.description;
      row.appendChild(checkbox.element);
    }

    // Populate the throttling
    const throttlingFormElements = fragment.$('throttling-form-elements');
    this._populateRuntimeSettingAsRadio('audits2.throttling', throttlingFormElements);


    // Populate other settings
    const otherFormElements = fragment.$('other-form-elements');
    this._populateRuntimeSettingAsCheckbox('audits2.clear_storage', otherFormElements);
  }

  _render() {
    this._startButton = UI.createTextButton(
        ls`Run audits`, () => this._controller.dispatchEventToListeners(Audits2.Events.RequestAuditStart),
        'audits2-start-button', true /* primary */);
    this.setDefaultFocusedElement(this._startButton);

    const deviceIcon = UI.Icon.create('largeicon-phone');
    const categoriesIcon = UI.Icon.create('largeicon-checkmark');
    const throttlingIcon = UI.Icon.create('largeicon-settings-gear');

    const fragment = UI.Fragment.build`
      <div class="vbox audits2-start-view">
        <header>
          <div class="audits2-logo"></div>
          <div class="audits2-start-view-text">
            <h2>Audits</h2>
            <p>
              Identify and fix common problems that affect your site's performance, accessibility, and user experience.
              <span class="link" $="learn-more">Learn more</a>
            </p>
          </div>
        </header>
        <form>
          <div class="audits2-form-section">
            <div class="audits2-form-section-label">
              <i>${deviceIcon}</i>
              <div class="audits2-icon-label">Device</div>
            </div>
            <div class="audits2-form-elements" $="device-type-form-elements"></div>
          </div>
          <div class="audits2-form-section">
            <div class="audits2-form-section-label">
              <i>${categoriesIcon}</i>
              <div class="audits2-icon-label">Audits</div>
            </div>
            <div class="audits2-form-elements" $="categories-form-elements"></div>
          </div>
          <div class="audits2-form-section">
            <div class="audits2-form-section-label">
              <i>${throttlingIcon}</i>
              <div class="audits2-icon-label">Throttling</div>
            </div>
            <div class="audits2-form-elements" $="throttling-form-elements"></div>
          </div>
          <div class="audits2-form-section">
            <div class="audits2-form-section-label"></div>
            <div class="audits2-form-elements" $="other-form-elements"></div>
          </div>
          <div class="audits2-form-section">
            <div class="audits2-form-section-label"></div>
            <div class="audits2-form-elements audits2-start-button-container hbox">
              ${this._startButton}
              <div $="help-text" class="audits2-help-text hidden"></div>
            </div>
          </div>
        </form>
      </div>
    `;

    this._helpText = fragment.$('help-text');

    const learnMoreLink = fragment.$('learn-more');
    learnMoreLink.addEventListener(
        'click', () => InspectorFrontendHost.openInNewTab('https://developers.google.com/web/tools/lighthouse/'));

    this._populateFormControls(fragment);
    this.contentElement.appendChild(fragment.element());
    this.contentElement.style.overflow = 'auto';
  }

  focusStartButton() {
    this._startButton.focus();
  }

  /**
   * @param {boolean} isEnabled
   */
  setStartButtonEnabled(isEnabled) {
    if (this._helpText)
      this._helpText.classList.toggle('hidden', isEnabled);

    if (this._startButton)
      this._startButton.disabled = !isEnabled;
  }

  /**
   * @param {?string} text
   */
  setUnauditableExplanation(text) {
    if (this._helpText)
      this._helpText.textContent = text;
  }
};
