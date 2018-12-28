module.exports = {
    "extends": "airbnb-base",
    "env": {
      "node": true
    },
    "rules": {
      "max-len": ["error", { "code": 120, "comments": 240 }],
      "no-underscore-dangle": 0,
      "no-console": 0,
      "no-use-before-define": ["error", { "functions": false, "classes": false, "variables": true }],
      "no-plusplus": 0
    }
};
