## HTTPS

### Root Certificate

In order to capture encrypted traffic, you'll have to install root certificate provided by Betwixt.
The certificate is generated for you when you first launch Betwixt. You can quickly locate it on disk using `Tools > Root Certificate` menu.

![Finding certificate file](http://i.imgur.com/xFMBStj.png)

`ca.pem` has to be imported and marked as trusted.

On OS X this is done via Keychain app as shown below.

![Installing certificate on OS X](http://i.imgur.com/lm2TIw4.png)

After certificate is installed, expand the `Trust` section and toggle the first dropdown to `Always Trust`:

![Always trust](https://i.imgur.com/rQyHMUG.png)

On Windows use certmgr.

![Installing certificate on Windows 10](http://i.imgur.com/8IWpKR0.png)

### Proxy

Direct the traffic to the proxy created by Betwixt in the background (`http://localhost:8008`).

If you wish to analyze traffic system wide:
- on OS X - `System Preferences → Network → Advanced → Proxies → Secure Web Proxy (HTTPS)`
- on Ubuntu - `All Settings → Network → Network Proxy`
- on Windows - `Settings → Network & Internet → Proxy`

![Setting up proxy on OS X](http://i.imgur.com/JslKSz8.png)

![Setting up proxy on Windows 10](http://i.imgur.com/ihSZEVb.png)

If you want to capture traffic coming from a single terminal use `export https_proxy=http://localhost:8008`. Note that NodeJS has a hardcoded list of CA certificates so it doesn't care for Keychain/certmgr/etc. You may need to use `export NODE_TLS_REJECT_UNAUTHORIZED=0` to overcome this issue.
