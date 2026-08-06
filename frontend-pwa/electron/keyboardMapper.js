const { UiohookKey } = require('uiohook-napi');
const { Key } = require('@nut-tree-fork/nut-js');

const uiohookToNut = {};

const manualMap = {
    'ArrowLeft': Key.Left,
    'ArrowUp': Key.Up,
    'ArrowRight': Key.Right,
    'ArrowDown': Key.Down,
    'Ctrl': Key.LeftControl,
    'CtrlRight': Key.RightControl,
    'Alt': Key.LeftAlt,
    'AltRight': Key.RightAlt,
    'Shift': Key.LeftShift,
    'ShiftRight': Key.RightShift,
    'Meta': Key.LeftSuper,
    'MetaRight': Key.RightSuper,
    'Backquote': Key.Grave,
    'BracketLeft': Key.LeftBracket,
    'BracketRight': Key.RightBracket,
    'Minus': Key.Minus,
    'Equal': Key.Equal,
    'Quote': Key.Quote,
    'Semicolon': Key.Semicolon,
    'Comma': Key.Comma,
    'Period': Key.Period,
    'Slash': Key.Slash,
    'Backslash': Key.Backslash
};

for (const [keyName, uioValue] of Object.entries(UiohookKey)) {
    if (Key[keyName] !== undefined) {
        uiohookToNut[uioValue] = Key[keyName];
    } else {
        const upper = keyName.toUpperCase();
        if (Key[upper] !== undefined) {
            uiohookToNut[uioValue] = Key[upper];
        } else if (manualMap[keyName] !== undefined) {
            uiohookToNut[uioValue] = manualMap[keyName];
        }
    }
}

module.exports = uiohookToNut;
