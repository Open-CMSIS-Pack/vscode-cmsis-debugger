# Change Log

## Unreleased
- Fixes [#84](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/84): Cannot use cbuild-run files with pyOCD without CMSIS_PACK_ROOT environment variable.
- Implements [#83](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/83): Make built-in pyOCD available in VS Code terminals.
  - Note that there is a known issue with a pyOCD installation in Python virtual environments taking precedence over the built-in pyOCD variant.
- Updates included pyOCD distribution
  - Fixes [#91](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/91): "Zephyr kernel detected" warning in shipped pyOCD.
  - Fixes [#100](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/100): [macOS] - Cannot connect with pyOCD and ULINKplus. Fixes missing `libusb` for macOS.
  - Fixes [#126](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/126): Flash programming fails on devices where the flash memory's erased value is 0x00. Initializes XPSR register before executing flash algorithm function.
  - Fixes [#127](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/127): CoreSight root component discovery fails. Fixes how to address APv2.
  - Fixes [#128](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/128): Programming fails on LPC55S69 when device is erased. Debugger no longer reads back programmed flash memory if `Verify` function is provided by flash algorithm.
  - Fixes [#131](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/131): AP access failure due to invalid security flags (SPROT).
  - Extends support for `*.cbuild-run.yml` debug configuration files.

## 0.0.2
- Removes [Arm Tools Environment Manager](https://marketplace.visualstudio.com/items?itemName=Arm.environment-manager) from extension pack. Instead, README lists it as one of the recommended extensions to use with the Arm CMSIS Debugger.
- Fixes use of `${workspace}` to `${workspaceFolder}` in default debug configurations.
- Reduces and aligns default `initCommands` lists for pseudo debugger types `cmsis-debug-pyocd` and `cmsis-debug-jlink`.
- Implements [#69](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/69): Bring Debug Console to front during connection.

## 0.0.1
- Initial release of extension pack on GitHub.
- Adds pseudo debugger types `cmsis-debug-pyocd` and `cmsis-debug-jlink`.
- Adds debug configuration providers for debugger type `gdbtarget` to resolve settings for pyOCD and Segger J-Link GDB server connections.
- Contributes setting `cmsis`.`cbuildRunFile` to all debugger types (`*` debugger type).
