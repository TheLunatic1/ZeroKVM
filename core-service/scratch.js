const { UiohookKey } = require('uiohook-napi');
const { Key } = require('@nut-tree-fork/nut-js');

const mapped = {};
const unmapped = [];

for (const [keyName, uioValue] of Object.entries(UiohookKey)) {
    if (Key[keyName] !== undefined) {
        mapped[uioValue] = Key[keyName];
    } else {
        const upper = keyName.toUpperCase();
        if (Key[upper] !== undefined) {
            mapped[uioValue] = Key[upper];
        } else {
            unmapped.push(keyName);
        }
    }
}
console.log("Unmapped:", unmapped);
