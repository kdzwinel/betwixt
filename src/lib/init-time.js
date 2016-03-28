'use strict';

const initTime = process.hrtime();

// DT requires us to use relative time in a strange format (xxx.xxx)
module.exports = () => {
    let diff = process.hrtime(initTime);

    return diff[0] + diff[1] / 1e9;
};
