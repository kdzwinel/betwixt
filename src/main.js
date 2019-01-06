const { app, BrowserWindow, Menu, shell } = require('electron');
const chalk = require('chalk');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2));
const FrontEndConnection = require('./lib/front-end-connection');
const TrafficInterceptor = require('./lib/traffic-interceptor');
const RDPMessageFormatter = require('./lib/rdp-message-formatter');
const buildMenu = require('./menu');

function init(webContents, options) {
  const trafficInterceptor = new TrafficInterceptor(options);
  const frontEndConnection = new FrontEndConnection(webContents);

  // this part is responsible for answering devtools requests
  frontEndConnection
    .on('message', (messageText) => {
      let message = null;

      try {
        message = JSON.parse(messageText);
      } catch (e) {
        console.log(chalk.red('FEConnection: '), 'invalid json', messageText);
        return;
      }

      if (message.method === 'Network.getResponseBody') {
        const connectionId = parseInt(message.params.requestId, 10);
        const connection = trafficInterceptor.getConnection(connectionId);

        frontEndConnection.respond(message.id, RDPMessageFormatter.getResponseBody(connection));
      } else if (message.method === 'Page.canScreencast'
                || message.method === 'Network.canEmulateNetworkConditions'
                || message.method === 'Emulation.canEmulate') {
        // we want to tell devtools that we don't support emulation, screencasting, etc.
        frontEndConnection.respond(message.id, { result: false });
      } else if (message.method === 'Page.getResourceTree') {
        frontEndConnection.respond(message.id, RDPMessageFormatter.getResourceTree());
      } else {
        // for requests that we are not sure about, let's just send an empty object back
        frontEndConnection.respond(message.id, {});
      }
    })
    .on('log', (msg) => {
      console.log(chalk.blue('FEConnection: ') + msg);
    });

  // this part is responsible for capturing traffic
  trafficInterceptor
    .on('request', (connection) => {
      frontEndConnection.send('Network.requestWillBeSent', RDPMessageFormatter.requestWillBeSent(connection));
    })
    .on('response-received', (connection) => {
      frontEndConnection.send('Network.responseReceived', RDPMessageFormatter.responseReceived(connection));
    })
    .on('response-data', (connection, chunk) => {
      frontEndConnection.send('Network.dataReceived', RDPMessageFormatter.dataReceived(connection, chunk));
    })
    .on('response-finished', (connection) => {
      frontEndConnection.send('Network.loadingFinished', RDPMessageFormatter.loadingFinished(connection));
    })
    .on('error', (error) => {
      console.log(chalk.bold.red('TrafficInterceptor error: ') + error);
    })
    .on('log', (msg) => {
      console.log(chalk.yellow('TrafficInterceptor: ') + msg);
    });
}

const options = {
  port: argv['proxy-port'] || 8008,
  sslCaDir: argv['ssl-ca-dir'] || path.resolve(app.getPath('userData'), 'ssl'),
};

app.on('ready', () => {
  let mainWindow = new BrowserWindow({
    title: 'Betwixt',
    icon: 'gfx/icon.png',
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      allowRunningInsecureContent: false,
    },
  });

  init(mainWindow.webContents, options);

  mainWindow.loadURL(`file://${__dirname}/dt/inspector.html?electron=true`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.openDevTools();

  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenu(app, options)));
});

app.on('web-contents-created', (e, contents) => {
  // security - ask OS to open resources in the regular browser
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });

  // security - prevent navigation
  contents.on('will-navigate', (event) => {
    event.preventDefault();
  });
});
