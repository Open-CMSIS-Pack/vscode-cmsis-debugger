# Change Log

## 0.3.1

- Fixed image links in [README](https://marketplace.visualstudio.com/items?itemName=Arm.vscode-cmsis-debugger).

## 0.3.0

- Switches away from `pre-release` distribution channel. Extension remains at `preview` status.
- Includes Microsoft® [`Serial Monitor`](https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-serial-monitor)
in extension pack.
- Updates [README](https://marketplace.visualstudio.com/items?itemName=Arm.vscode-cmsis-debugger) with usage documentation.
- Updates included pyOCD distribution
    - Improves robustness of debug sequence execution.
    - Updates behavior when `cbuild-run` target clashes with an internally registered target, to overwrite.
    - Sets debugger clock based on the `debugger` node in `*.cbuilld-run.yml` file.

## 0.2.0

- **Important**: This release requires
[CMSIS-Toolbox v2.9.0](https://github.com/Open-CMSIS-Pack/cmsis-toolbox/releases/tag/2.9.0)
to function correctly. Update your workspace's `vcpkg-configuration.json` file accordingly.
- Updates [documentation](https://open-cmsis-pack.github.io/vscode-cmsis-debugger/).
- Implements [#238](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/238): Support
[`*.cbuild-run.yml`](https://open-cmsis-pack.github.io/cmsis-toolbox/YML-CBuild-Format/#file-structure-of-cbuild-runyml)
file changes in CMSIS-Toolbox v2.9.0.
- Updates included pyOCD distribution
    - Updates `*.cbuild-run.yml` support to changes in CMSIS-Toolbox 2.9.0.
    - Implements [#208](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/208):
    `--cbuild-run` target support in pyOCD subcommands.
    - Implements [#241](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/241):
    Use default values for CMSIS_PACK_ROOT if variable is not explicitly set.

## 0.1.1

- Fixes [#153](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/153): PATH variable in terminal sometimes
loses modifications from other extensions.
- Fixes [#155](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/155): Go-to-main in `initCommands` of the
`launch.json` leaves behind the breakpoint.
- Partially implements [#96](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/96): Enable Peripheral
Inspector.
    - Extracts first SVD file path found in `*.cbuild-run.yml` debug configuration file to automatically set up
  Peripheral Inspector.
- Adds initial version of extension [documentation](https://open-cmsis-pack.github.io/vscode-cmsis-debugger/).
- Updates included pyOCD distribution
    - Fixes [#133](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/133): Adds default memory map for
    Cortex-M devices.
    - Improves memory map creation and flash algorithms sorting.
    - Selects current processor core (for example used for flash programming) based on active gdb server connection.

## 0.1.0

- Updates included pyOCD distribution
    - Fixes [#92](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/92): `monitor reset halt` command
    fails for LPCXpresso55S69 if using CMSIS-Pack support in pyOCD.
    - Fixes [#93](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/93): Download to LPC55S69 flash with
    GDB and pyOCD ends in errors.
    - Fixes [#94](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/94): Cannot connect to
    NXP FRDM-K32L3A6 with pyOCD.
    - Fixes support for `<memory>` elements from CMSIS PDSC files.
    - Fixes progress bar output during program download.
    - Fixes handling of `__ap` variable in debug sequences.
    - Improves connection robustness and DP sticky error bits handling for temporary target communication losses and
    `__errorcontrol` usage (CMSIS debug descriptions). For example in reset scenarios.
    - Updates CMSIS-DAP probe detection (filters out Cypress KitProg3 bridge).
    - Extends and improves support for `*.cbuild-run.yml` debug configuration files.

## 0.0.3

- Fixes [#84](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/84): Cannot use cbuild-run files with
pyOCD without CMSIS_PACK_ROOT environment variable.
- Implements [#83](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/83): Make built-in pyOCD available
in VS Code terminals.
    - Note that there is a known issue with a pyOCD installation in Python virtual environments taking precedence over
    the built-in pyOCD variant.
- Updates included pyOCD distribution
    - Fixes [#91](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/91): "Zephyr kernel detected" warning
    in shipped pyOCD.
    - Fixes [#100](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/100): [macOS] - Cannot connect with
    pyOCD and ULINKplus. Fixes missing `libusb` for macOS.
    - Fixes [#126](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/126): Flash programming fails on
    devices where the flash memory's erased value is 0x00. Initializes XPSR register before executing flash algorithm
    function.
    - Fixes [#127](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/127): CoreSight root component
    discovery fails. Fixes how to address APv2.
    - Fixes [#128](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/128): Programming fails on LPC55S69
    when device is erased. Debugger no longer reads back programmed flash memory if `Verify` function is
    provided by flash algorithm.
    - Fixes [#131](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/131):
    AP access failure due to invalid security flags (SPROT).
    - Extends support for `*.cbuild-run.yml` debug configuration files.

## 0.0.2

- Removes [Arm Tools Environment Manager](https://marketplace.visualstudio.com/items?itemName=Arm.environment-manager)
from extension pack. Instead, README lists it as one of the recommended extensions to use with the Arm CMSIS Debugger.
- Fixes use of `${workspace}` to `${workspaceFolder}` in default debug configurations.
- Reduces and aligns default `initCommands` lists for pseudo debugger types `cmsis-debug-pyocd`
and `cmsis-debug-jlink`.
- Implements [#69](https://github.com/Open-CMSIS-Pack/vscode-cmsis-debugger/issues/69): Bring Debug Console to
front during connection.

## 0.0.1

- Initial release of extension pack on GitHub.
- Adds pseudo debugger types `cmsis-debug-pyocd` and `cmsis-debug-jlink`.
- Adds debug configuration providers for debugger type `gdbtarget` to resolve settings for pyOCD and Segger J-Link
GDB server connections.
- Contributes setting `cmsis`.`cbuildRunFile` to all debugger types (`*` debugger type).
