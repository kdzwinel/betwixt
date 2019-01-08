const { shell } = require('electron');
const path = require('path');

function buildMenu(app, mainWindow, options) {
  const template = [
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          role: 'undo',
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          role: 'redo',
        },
        {
          type: 'separator',
        },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          role: 'cut',
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          role: 'copy',
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          role: 'paste',
        },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          role: 'selectall',
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          role: 'resetZoom',
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          role: 'zoomIn',
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          role: 'zoomOut',
        },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Root Certificate',
          click: () => {
            shell.showItemInFolder(path.resolve(options.sslCaDir, 'certs', 'ca.pem'));
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Reset UI Settings',
          click: () => {
            mainWindow.webContents.session.clearStorageData();
            mainWindow.reload();
          },
        },
        {
          label: 'Debug Betwixt',
          click: () => {
            mainWindow.webContents.openDevTools();
          },
        },
      ],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => app.quit(),
        },
      ],
    });
  }

  return template;
}

module.exports = buildMenu;
