# Change Log

## Unreleased
- Fixes [#84](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/84): Cannot use cbuild-run files with pyOCD without CMSIS_PACK_ROOT environment variable.
- Implements [#83](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/83): Make built-in pyOCD available in VS Code terminals.
  - Note that there is a known issue with a pyOCD installation in Python virtual environments taking precedence over the built-in pyOCD variant.
- Updates included pyOCD distribution
  - Fixes [#100](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/100): [macOS] - Cannot connect with pyOCD and ULINKplus. Fixes missing `libusb` for macOS.
  - Fixes [#91](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/91): "Zephyr kernel detected" warning in shipped pyOCD.
  - Extends support for `*.cbuild-run.yml` debug configuration files.
  - Fixes auto-detection of APv2.
  - Fixes missing XPSR register update before executing flash algorithm function.
  - Adds support for AP CSW SPROT bit handling.
  - Skips reading programmed flash memory if `Verify` function is provided by flash algorithm.

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
