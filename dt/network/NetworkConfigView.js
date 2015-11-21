// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @constructor
 * @extends {WebInspector.VBox}
 */
WebInspector.NetworkConfigView = function()
{
    WebInspector.VBox.call(this, true);
    this.registerRequiredCSS("network/networkConfigView.css");
    this.contentElement.classList.add("network-config");

    this._createCacheSection();
    this._createNetworkThrottlingSection();
    this._createUserAgentSection();
}

WebInspector.NetworkConfigView.prototype = {
    /**
     * @param {string} title
     * @param {string=} className
     * @return {!Element}
     */
    _createSection: function(title, className)
    {
        var section = this.contentElement.createChild("section", "network-config-group");
        if (className)
            section.classList.add(className);
        section.createChild("div", "network-config-title").textContent = title;
        return section.createChild("div", "network-config-fields");
    },

    _createCacheSection: function()
    {
        var section = this._createSection(WebInspector.UIString("Disk cache"), "network-config-disable-cache");
        section.appendChild(WebInspector.SettingsUI.createSettingCheckbox(WebInspector.UIString("Disable cache"), WebInspector.moduleSetting("cacheDisabled"), true));
    },

    _createNetworkThrottlingSection: function()
    {
        var section = this._createSection(WebInspector.UIString("Network throttling"), "network-config-throttling");
        new WebInspector.NetworkConditionsSelector(/** @type {!HTMLSelectElement} */(section.createChild("select", "chrome-select")));
    },

    _createUserAgentSection: function()
    {
        var section = this._createSection(WebInspector.UIString("User agent spoofing"), "network-config-ua");
        var radio = createRadioLabel("auto-user-agent", WebInspector.UIString("Auto user agent"), true);
        section.appendChild(radio);
        this._autoUserAgentRadio = radio.radioElement;
        this._autoUserAgentRadio.addEventListener("change", this._userAgentTypeChanged.bind(this, this._autoUserAgentRadio));
        this._autoUserAgent = section.createChild("input", "network-config-ua-auto");
        this._autoUserAgent.value = WebInspector.UIString("Default");
        this._autoUserAgent.type = "text";
        this._autoUserAgent.disabled = true;
        WebInspector.multitargetNetworkManager.addEventListener(WebInspector.MultitargetNetworkManager.Events.UserAgentChanged, this._userAgentChanged, this);

        radio = createRadioLabel("custom-user-agent", WebInspector.UIString("Custom user agent"), false);
        this._customUserAgentSetting = WebInspector.settings.createSetting("customUserAgent", "");
        this._customUserAgentSetting.addChangeListener(this._customUserAgentChanged, this);
        this._customUserAgentRadio = radio.radioElement;
        this._customUserAgentRadio.addEventListener("change", this._userAgentTypeChanged.bind(this, this._customUserAgentRadio));
        section.appendChild(radio);

        this._customUserAgent = section.createChild("div", "network-config-ua-custom");
        this._customSelectAndInput = WebInspector.NetworkConfigView.createUserAgentSelectAndInput();
        this._customSelectAndInput.select.classList.add("chrome-select");
        this._customUserAgent.appendChild(this._customSelectAndInput.select);
        this._customUserAgent.appendChild(this._customSelectAndInput.input);

        this._userAgentTypeChanged(this._autoUserAgentRadio);
    },

    /**
     * @param {!WebInspector.Event} event
     */
    _userAgentChanged: function(event)
    {
        this._autoUserAgent.value = /** @type {string} */(event.data) || WebInspector.UIString("Default");
    },

    _customUserAgentChanged: function()
    {
        if (!this._customUserAgent.checked)
            return;
        WebInspector.multitargetNetworkManager.setCustomUserAgentOverride(this._customUserAgentSetting.get());
    },

    /**
     * @param {!Element} radioElement
     */
    _userAgentTypeChanged: function(radioElement)
    {
        var useCustomUA = radioElement === this._customUserAgentRadio;
        var otherRadioButton = useCustomUA ? this._autoUserAgentRadio : this._customUserAgentRadio;
        otherRadioButton.checked = false;
        this._autoUserAgent.classList.toggle("checked", !useCustomUA);
        this._customUserAgent.classList.toggle("checked", useCustomUA);
        this._customSelectAndInput.select.disabled = !useCustomUA;
        this._customSelectAndInput.input.disabled = !useCustomUA;
        var customUA = useCustomUA ? this._customUserAgentSetting.get() : "";
        WebInspector.multitargetNetworkManager.setCustomUserAgentOverride(customUA);

    },

    __proto__ : WebInspector.VBox.prototype
}


/**
 * @return {{select: !Element, input: !Element}}
 */
WebInspector.NetworkConfigView.createUserAgentSelectAndInput = function()
{
    var userAgentSetting = WebInspector.settings.createSetting("customUserAgent", "");
    const noOverride = {title: WebInspector.UIString("No override"), value: ""};
    const customOverride = {title: WebInspector.UIString("Other"), value: "Other"};
    var userAgents = [noOverride].concat(WebInspector.NetworkConfigView._userAgents).concat([customOverride]);

    var userAgentSelectElement = createElement("select");
    for (var i = 0; i < userAgents.length; ++i)
        userAgentSelectElement.add(new Option(userAgents[i].title, userAgents[i].value));
    userAgentSelectElement.selectedIndex = 0;

    var otherUserAgentElement = createElement("input");
    otherUserAgentElement.type = "text";
    otherUserAgentElement.value = userAgentSetting.get();
    otherUserAgentElement.title = userAgentSetting.get();

    settingChanged();
    userAgentSelectElement.addEventListener("change", userAgentSelected, false);

    otherUserAgentElement.addEventListener("dblclick", textDoubleClicked, true);
    otherUserAgentElement.addEventListener("blur", textChanged, false);
    otherUserAgentElement.addEventListener("keydown", textKeyDown, false);

    function userAgentSelected()
    {
        var value = userAgentSelectElement.options[userAgentSelectElement.selectedIndex].value;
        if (value !== customOverride.value) {
            userAgentSetting.set(value);
            otherUserAgentElement.value = value;
            otherUserAgentElement.title = value;
            otherUserAgentElement.readOnly = true;
        } else {
            otherUserAgentElement.readOnly = false;
            otherUserAgentElement.focus();
        }
    }

    function settingChanged()
    {
        var value = userAgentSetting.get();
        var options = userAgentSelectElement.options;
        var selectionRestored = false;
        for (var i = 0; i < options.length; ++i) {
            if (options[i].value === value) {
                userAgentSelectElement.selectedIndex = i;
                selectionRestored = true;
                break;
            }
        }

        otherUserAgentElement.readOnly = selectionRestored;
        if (!selectionRestored)
            userAgentSelectElement.selectedIndex = options.length - 1;

        if (otherUserAgentElement.value !== value) {
            otherUserAgentElement.value = value;
            otherUserAgentElement.title = value;
        }
    }

    function textKeyDown(event)
    {
        if (isEnterKey(event))
            textChanged();
    }

    function textDoubleClicked()
    {
        userAgentSelectElement.selectedIndex = userAgents.length - 1;
        userAgentSelected();
    }

    function textChanged()
    {
        if (userAgentSetting.get() !== otherUserAgentElement.value) {
            userAgentSetting.set(otherUserAgentElement.value);
            settingChanged();
        }
    }

    return { select: userAgentSelectElement, input: otherUserAgentElement };
}

/** @type {!Array.<{title: string, value: string}>} */
WebInspector.NetworkConfigView._userAgents = [
    {title: "Android 4.0.2 \u2014 Galaxy Nexus", value: "Mozilla/5.0 (Linux; U; Android 4.0.2; en-us; Galaxy Nexus Build/ICL53F) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30"},
    {title: "Android 2.3 \u2014 Nexus S", value: "Mozilla/5.0 (Linux; U; Android 2.3.6; en-us; Nexus S Build/GRK39F) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1"},
    {title: "BlackBerry \u2014 BB10", value: "Mozilla/5.0 (BB10; Touch) AppleWebKit/537.1+ (KHTML, like Gecko) Version/10.0.0.1337 Mobile Safari/537.1+"},
    {title: "BlackBerry \u2014 PlayBook 2.1", value: "Mozilla/5.0 (PlayBook; U; RIM Tablet OS 2.1.0; en-US) AppleWebKit/536.2+ (KHTML, like Gecko) Version/7.2.1.0 Safari/536.2+"},
    {title: "BlackBerry \u2014 9900", value: "Mozilla/5.0 (BlackBerry; U; BlackBerry 9900; en-US) AppleWebKit/534.11+ (KHTML, like Gecko) Version/7.0.0.187 Mobile Safari/534.11+"},
    {title: "Chrome 31 \u2014 Mac", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36"},
    {title: "Chrome 31 \u2014 Windows", value: "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.16 Safari/537.36"},
    {title: "Chrome \u2014 Android Tablet", value: "Mozilla/5.0 (Linux; Android 4.1.2; Nexus 7 Build/JZ054K) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Safari/535.19"},
    {title: "Chrome \u2014 Android Mobile", value: "Mozilla/5.0 (Linux; Android 4.0.4; Galaxy Nexus Build/IMM76B) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.133 Mobile Safari/535.19"},
    {title: "Chrome \u2014 iPad", value: "Mozilla/5.0 (iPad; CPU OS 7_0 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) CriOS/30.0.1599.12 Mobile/11A465 Safari/8536.25"},
    {title: "Chrome \u2014 iPhone", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 7_0_2 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) CriOS/30.0.1599.12 Mobile/11A501 Safari/8536.25"},
    {title: "Firefox 14 \u2014 Android Mobile", value: "Mozilla/5.0 (Android; Mobile; rv:14.0) Gecko/14.0 Firefox/14.0"},
    {title: "Firefox 14 \u2014 Android Tablet", value: "Mozilla/5.0 (Android; Tablet; rv:14.0) Gecko/14.0 Firefox/14.0"},
    {title: "Firefox 4 \u2014 Mac", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.6; rv:2.0.1) Gecko/20100101 Firefox/4.0.1"},
    {title: "Firefox 4 \u2014 Windows", value: "Mozilla/5.0 (Windows NT 6.1; rv:2.0.1) Gecko/20100101 Firefox/4.0.1"},
    {title: "Firefox 7 \u2014 Mac", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.6; rv:7.0.1) Gecko/20100101 Firefox/7.0.1"},
    {title: "Firefox 7 \u2014 Windows", value: "Mozilla/5.0 (Windows NT 6.1; Intel Mac OS X 10.6; rv:7.0.1) Gecko/20100101 Firefox/7.0.1"},
    {title: "Googlebot", value: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"},
    {title: "Googlebot Smartphone", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"},
    {title: "Internet Explorer 10", value: "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Trident/6.0)"},
    {title: "Internet Explorer 7", value: "Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)"},
    {title: "Internet Explorer 8", value: "Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.0; Trident/4.0)"},
    {title: "Internet Explorer 9", value: "Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0)"},
    {title: "iPad \u2014 iOS 8", value: "Mozilla/5.0 (iPad; CPU OS 8_0 like Mac OS X) AppleWebKit/600.1.3 (KHTML, like Gecko) Version/8.0 Mobile/12A4345d Safari/600.1.4"},
    {title: "iPad \u2014 iOS 7", value: "Mozilla/5.0 (iPad; CPU OS 7_0_2 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Version/7.0 Mobile/11A501 Safari/9537.53"},
    {title: "iPad \u2014 iOS 6", value: "Mozilla/5.0 (iPad; CPU OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25"},
    {title: "iPhone \u2014 iOS 8", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 8_0 like Mac OS X) AppleWebKit/600.1.3 (KHTML, like Gecko) Version/8.0 Mobile/12A4345d Safari/600.1.4"},
    {title: "iPhone \u2014 iOS 7", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 7_0_2 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Version/7.0 Mobile/11A4449d Safari/9537.53"},
    {title: "iPhone \u2014 iOS 6", value: "Mozilla/5.0 (iPhone; CPU iPhone OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5376e Safari/8536.25"},
    {title: "MeeGo \u2014 Nokia N9", value: "Mozilla/5.0 (MeeGo; NokiaN9) AppleWebKit/534.13 (KHTML, like Gecko) NokiaBrowser/8.5.0 Mobile Safari/534.13"},
    {title: "Opera 18 \u2014 Mac", value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36 OPR/18.0.1284.68"},
    {title: "Opera 18 \u2014 Windows", value: "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36 OPR/18.0.1284.68"},
    {title: "Opera 12 \u2014 Mac", value: "Opera/9.80 (Macintosh; Intel Mac OS X 10.9.1) Presto/2.12.388 Version/12.16"},
    {title: "Opera 12 \u2014 Windows", value: "Opera/9.80 (Windows NT 6.1) Presto/2.12.388 Version/12.16"},
    {title: "Silk \u2014 Kindle Fire (Desktop view)", value: "Mozilla/5.0 (Linux; U; en-us; KFTHWI Build/JDQ39) AppleWebKit/535.19 (KHTML, like Gecko) Silk/3.13 Safari/535.19 Silk-Accelerated=true"},
    {title: "Silk \u2014 Kindle Fire (Mobile view)", value: "Mozilla/5.0 (Linux; U; Android 4.2.2; en-us; KFTHWI Build/JDQ39) AppleWebKit/535.19 (KHTML, like Gecko) Silk/3.13 Mobile Safari/535.19 Silk-Accelerated=true"}
];

/**
 * @constructor
 * @implements {WebInspector.ActionDelegate}
 */
WebInspector.NetworkConfigView.ShowActionDelegate = function()
{
}

WebInspector.NetworkConfigView.ShowActionDelegate.prototype = {
    /**
     * @override
     * @param {!WebInspector.Context} context
     * @param {string} actionId
     * @return {boolean}
     */
    handleAction: function(context, actionId)
    {
        WebInspector.inspectorView.showViewInDrawer("network.config");
        return true;
    }
}
