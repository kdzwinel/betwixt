/*
 * Copyright (C) 2014 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
UI.SettingsUI = {};

/**
 * @param {string} name
 * @param {!Common.Setting} setting
 * @param {boolean=} omitParagraphElement
 * @param {string=} tooltip
 * @return {!Element}
 */
UI.SettingsUI.createSettingCheckbox = function(name, setting, omitParagraphElement, tooltip) {
  const label = UI.CheckboxLabel.create(name);
  if (tooltip)
    label.title = tooltip;

  const input = label.checkboxElement;
  input.name = name;
  UI.SettingsUI.bindCheckbox(input, setting);

  if (omitParagraphElement)
    return label;

  const p = createElement('p');
  p.appendChild(label);
  return p;
};

/**
 * @param {string} name
 * @param {!Array<!{text: string, value: *, raw: (boolean|undefined)}>} options
 * @param {!Common.Setting} setting
 * @return {!Element}
 */
UI.SettingsUI.createSettingSelect = function(name, options, setting) {
  const p = createElement('p');
  p.createChild('label').textContent = name;
  const select = p.createChild('select', 'chrome-select');

  for (let i = 0; i < options.length; ++i) {
    // The "raw" flag indicates text is non-i18n-izable.
    const option = options[i];
    const optionName = option.raw ? option.text : Common.UIString(option.text);
    select.add(new Option(optionName, option.value));
  }

  setting.addChangeListener(settingChanged);
  settingChanged();
  select.addEventListener('change', selectChanged, false);
  return p;

  function settingChanged() {
    const newValue = setting.get();
    for (let i = 0; i < options.length; i++) {
      if (options[i].value === newValue)
        select.selectedIndex = i;
    }
  }

  function selectChanged() {
    // Don't use event.target.value to avoid conversion of the value to string.
    setting.set(options[select.selectedIndex].value);
  }
};

/**
 * @param {!Element} input
 * @param {!Common.Setting} setting
 */
UI.SettingsUI.bindCheckbox = function(input, setting) {
  function settingChanged() {
    if (input.checked !== setting.get())
      input.checked = setting.get();
  }
  setting.addChangeListener(settingChanged);
  settingChanged();

  function inputChanged() {
    if (setting.get() !== input.checked)
      setting.set(input.checked);
  }
  input.addEventListener('change', inputChanged, false);
};

/**
 * @param {string} name
 * @param {!Element} element
 * @return {!Element}
 */
UI.SettingsUI.createCustomSetting = function(name, element) {
  const p = createElement('p');
  const fieldsetElement = p.createChild('fieldset');
  fieldsetElement.createChild('label').textContent = name;
  fieldsetElement.appendChild(element);
  return p;
};

/**
 * @param {!Common.Setting} setting
 * @return {?Element}
 */
UI.SettingsUI.createControlForSetting = function(setting) {
  if (!setting.extension())
    return null;
  const descriptor = setting.extension().descriptor();
  const uiTitle = Common.UIString(setting.title() || '');
  switch (descriptor['settingType']) {
    case 'boolean':
      return UI.SettingsUI.createSettingCheckbox(uiTitle, setting);
    case 'enum':
      if (Array.isArray(descriptor['options']))
        return UI.SettingsUI.createSettingSelect(uiTitle, descriptor['options'], setting);
      console.error('Enum setting defined without options');
      return null;
    default:
      console.error('Invalid setting type: ' + descriptor['settingType']);
      return null;
  }
};

/**
 * @interface
 */
UI.SettingUI = function() {};

UI.SettingUI.prototype = {
  /**
   * @return {?Element}
   */
  settingElement() {}
};
