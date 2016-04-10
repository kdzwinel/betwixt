'use strict';

const shell = require('electron').shell;
const path = require('path');
const proxy = require('system-proxy');

function buildMenu(app, options) {
    const template = [
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    role: 'undo'
                },
                {
                    label: 'Redo',
                    accelerator: 'Shift+CmdOrCtrl+Z',
                    role: 'redo'
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Cut',
                    accelerator: 'CmdOrCtrl+X',
                    role: 'cut'
                },
                {
                    label: 'Copy',
                    accelerator: 'CmdOrCtrl+C',
                    role: 'copy'
                },
                {
                    label: 'Paste',
                    accelerator: 'CmdOrCtrl+V',
                    role: 'paste'
                },
                {
                    label: 'Select All',
                    accelerator: 'CmdOrCtrl+A',
                    role: 'selectall'
                }
            ]
        },
        {
            label: 'Tools',
            submenu: [
                {
                    label: 'Root Certificate',
                    click: () => {
                        shell.showItemInFolder(path.resolve(options.sslCaDir, 'certs', 'ca.pem'));
                    }
                },
                {
                    label: 'Enable system proxy',
                    click: () => {
                        proxy.setProxyOn('localhost', options.port)
                            .then(() => console.log('Proxy enable OK'))
                            .catch((e) => console.log('Proxy enable FAIL', e));
                    }
                },
                {
                    label: 'Disable system proxy',
                    click: () => {
                        proxy.setProxyOff('localhost', options.port)
                            .then(() => console.log('Proxy disable OK'))
                            .catch((e) => console.log('Proxy disable FAIL', e));
                    }
                }
            ]
        }
    ];

    if (process.platform === 'darwin') {
        template.unshift({
            label: app.getName(),
            submenu: [
                {
                    label: 'Quit',
                    accelerator: 'Command+Q',
                    click: () => app.quit()
                }
            ]
        });
    }

    return template;
}

module.exports = buildMenu;
