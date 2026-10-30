# Android Device Validation Matrix

This document is intentionally a live checklist. Only mark a capability as Pass after it has been verified on an actual Android APK running on a physical device or a dedicated emulator that matches the target hardware.

| Capability | Android support present? | Tested on device? | Result |
| --- | --- | --- | --- |
| Device info | Yes/No | Yes/No | Pass/Fail |
| Battery | Yes/No | Yes/No | Pass/Fail |
| Storage | Yes/No | Yes/No | Pass/Fail |
| Network | Yes/No | Yes/No | Pass/Fail |
| File access | Yes/No | Yes/No | Pass/Fail |
| PDF search | Yes/No | Yes/No | Pass/Fail |
| Open file | Yes/No | Yes/No | Pass/Fail |
| Chat | Yes/No | Yes/No | Pass/Fail |
| Voice | Yes/No | Yes/No | Pass/Fail |
| Touch | Yes/No | Yes/No | Pass/Fail |
| Scrolling | Yes/No | Yes/No | Pass/Fail |
| Keyboard | Yes/No | Yes/No | Pass/Fail |
| Safe area | Yes/No | Yes/No | Pass/Fail |

## Android runtime validation checklist

- Launch APK on physical device.
- Confirm the status bar, header, content, and bottom navigation do not overlap.
- Verify scrolling works for long lists, chat bubbles, and the More sheet.
- Tap each primary control once; confirm no multi-tap requirement.
- Confirm Android file access returns real device paths only when permissions and scope permit it.
- Confirm UI output is human-readable rather than raw tool payloads.
- Confirm agent tool calls are dynamic and permission-aware.

## Current environment note

This workspace does not currently have a physical Android device or emulator attached, so no row can be marked `Pass` yet. The checklist above remains the required validation gate for any final Android acceptance claim.
