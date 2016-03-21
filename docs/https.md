## HTTPS

### Root Certificate

In order to capture encrypted traffic, you'll have to install root certificate provided by Betwixt.
The certificate is generated for you when you first launch Betwixt. You will find it in the application data directory:

- OS X - `~/Library/Application Support/betwixt/ssl/certs/`
- Windows - `%APPDATA%\betwixt\ssl\certs\`
- Linux - `$XDG_CONFIG_HOME/betwxit/ssl/certs/` or `~/.config/betwxit/ssl/certs/`

When you find the right folder, import `ca.pem` and mark it as trusted.

On OS X this is done via Keychain app as shown below.

![Installing certificate on OS X](http://i.imgur.com/lm2TIw4.png)

### Proxy

Direct the traffic to the proxy created by Betwixt in the background (`http://localhost:8008`).

If you wish to analyze traffic system wide:
- on OS X - `System Preferences → Network → Advanced → Proxies → Secure Web Proxy (HTTPS)`
- on Ubuntu - `All Settings → Network → Network Proxy`
- on Windows - `PC Settings → Network → Proxy`

![Setting up proxy on OS X](http://i.imgur.com/JslKSz8.png)

If you want to capture traffic coming from a single terminal use `export https_proxy=http://localhost:8008`.