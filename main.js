'use strict';

const app = require('app');
const BrowserWindow = require('browser-window');
const server = require('./lib/server');

// Report crashes to our server.
require('crash-reporter').start();

let mainWindow = null;

app.on('window-all-closed', () => {
    app.quit();
});

app.on('ready', () => {

    mainWindow = new BrowserWindow({
        title: 'Betwixt ⚡',
        width: 800,
        height: 600
    });

    mainWindow.loadUrl('file://' + __dirname + '/dt/inspector.html?ws=localhost:1337');

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
});
