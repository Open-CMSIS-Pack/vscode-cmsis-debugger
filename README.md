[![Maintainability](https://api.codeclimate.com/v1/badges/0f12a7e73736f8bbfb9d/maintainability)](https://codeclimate.com/github/Open-CMSIS-Pack/vscode-cmsis-debugger/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/0f12a7e73736f8bbfb9d/test_coverage)](https://codeclimate.com/github/Open-CMSIS-Pack/vscode-cmsis-debugger/test_coverage)

# Arm CMSIS Debugger

The Arm® CMSIS Debugger extension is an extension pack for Visual Studio Code® that demonstrates how to combine technologies from various open source projects to create a comprehensive debug platform for Arm-based IoT solutions.

Related open source projects are

- [Open-CMSIS-Pack](https://www.open-cmsis-pack.org/) of which this extension is part of.
- [Eclipse® CDT.cloud™](https://eclipse.dev/cdt-cloud/), an open-source project that hosts a number of components and best practices for building customizable web-based C/C++ tools.
- [pyOCD](https://pyocd.io/), a Python based tool and API for debugging, programming, and exploring Arm Cortex® microcontrollers.
- [GDB](https://www.sourceware.org/gdb/), the debugger of the GNU Project.

## The Arm CMSIS Debugger Extension Pack

The Arm CMSIS Debugger extension is an [extension pack](https://code.visualstudio.com/api/references/extension-manifest#extension-packs). It allows to install multiple separate extensions together.

## Included Extensions

The following extensions are included in this extension pack:

- [CDT™ GDB Debug Adapter Extension](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.cdt-gdb-vscode), an Eclipse CDT.cloud extension that supports debugging using GDB and any other debuggers that supports the MI protocol.
- [Memory Inspector](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.memory-inspector), an Eclipse CDT.cloud extension that provides a powerful and configurable memory viewer that works with debug adapters.
- [Peripheral Inspector](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.peripheral-inspector), an Eclipse CDT.cloud extension that provides a CMSIS SVD viewer and works with debug adapters.

## Recommended Extensions

We recommend to install the following extensions to simplify the user experience:

- [Arm Tools Environment Manager](https://marketplace.visualstudio.com/items?itemName=Arm.environment-manager), an extension that allows to download, install, and manage software development tools using [Microsoft® Vcpkg](https://vcpkg.io/en/index.html) artifacts. Use this extension to for example install the `GCC compiler for ARM CPUs` which comes with a GDB variant for Arm CPUs.
- [Arm CMSIS Solution](https://marketplace.visualstudio.com/items?itemName=Arm.cmsis-csolution), an extension that is a graphical user interface for csolution projects that use the [CMSIS-Toolbox](https://open-cmsis-pack.github.io/cmsis-toolbox/). Use this extension to build your csolution projects, to generate `*.cbuild-run.yml` debug configuration files, and to make use of contributed commands in your debug launch configurations.

## Debug Setup

All debug setups require a GDB installation which supports the GDB remote protocol and can establish the connection to a GDB server like pyOCD.

We recommend to install the `GCC compiler for ARM CPUs` with the `Arm Tools Environment Manager` extension to get access to such a GDB variant. It comes with `arm-none-eabi-gdb` which is used in this extension's default debug configurations.

### pyOCD Debug Setup

This extension includes a pyOCD distribution which is used by default.

If you would like to use a different pyOCD installation, then update the `target`.`server` item of your debug launch configuration with the path to its `pyocd` executable.

### SEGGER® J-LINK® Debug Setup

Install the latest [J-LINK Software and Documentation Pack](https://www.segger.com/downloads/jlink/#J-LinkSoftwareAndDocumentationPack) from [SEGGER](https://www.segger.com/). Ensure all required drivers and host platform specific settings are done.

Ensure the installation folder is added to your system's `PATH` environment variable to use default debug configurations provided by this extension. Alternatively, update the `target`.`server` item of your debug launch configuration with the path to the J-LINK GDB server executable to use.

## Additional Extension Functionality

This extension contributes additional functionality to more seamlessly integrate the included extensions:

- The pseudo debugger types `cmsis-debug-pyocd` and `cmsis-debug-jlink`. These types allow a more seamless integration into your IDE. However, these are not full debug adapters but generate debug configurations of type `gdbtarget` which comes with the [CDT GDB Debug Adapter Extension](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.cdt-gdb-vscode).
- A [debug configuration provider](https://code.visualstudio.com/api/references/vscode-api#DebugConfigurationProvider) for the type `gdbtarget` which comes with the [CDT GDB Debug Adapter Extension](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.cdt-gdb-vscode). This provider automatically fills in default values for known remote GDB servers when launching a debug session.
- CMSIS specific launch configuration items for the `*` debugger type, i.e. visible for all debugger types. It depends on the actually used debug adapter type if this information is known and utilized.

### Pseudo Debugger Types

This section describes the contributed pseudo debugger types and their support through the contributed debug configuration provider for type `gdbtarget`.

#### CMSIS Debugger (pyOCD) - `cmsis-debug-pyocd`

The `cmsis-debug-pyocd` debugger type allows to add default debug configurations to the workspace's `launch.json` file to debug via GDB and pyOCD. The actually used debugger type is `gdbtarget`.

In addition this extension contributes a debug configuration resolver which automatically fills the following gaps during debug launch:

- If option `target`.`server` is set to `pyocd`, then it expands this option to the absolute path of the built-in pyOCD distribution.
- Adds/extends the `target`.`serverParameters` list of `pyocd` command line arguments:
  - Prepends `gdbserver` if not present.
  - Appends `--port` and the corresponding `port` value if `target`.`port` is set.
  - Appends `--cbuild-run` and the corresponding `cbuildRunFile` path if `cmsis`.`cbuildRunFile` is set.

**Note**: The built-in version of pyOCD supports the command line option `--cbuild-run`. However, this is a new option which isn't contained yet in releases outside this extension.

#### CMSIS Debugger (J-LINK) - `cmsis-debug-jlink`

The `cmsis-debug-jlink` debugger type allows to add default debug configurations to the workspace's `launch.json` file to debug via GDB and the SEGGER J-LINK GDB server. The actually used debugger type is `gdbtarget`.

**Note**: The generated default debug configuration uses `JLinkGDBServer` as `target`.`server` setting. The executable with this name has slightly differing behavior depending on your host platform. It launches a GUI-less server on Linux and macOS. Whereas a GDB server with GUI is launched on Windows®. Please change the value to `JLinkGDBServerCL` to suppress the GUI on Windows.

In addition this extension contributes a debug configuration resolver which automatically fills the following gaps during debug launch:

- Adds/extends the `target`.`serverParameters` list of `JLinkGDBServer`/`JLinkGDBServerCL` command line arguments:
  - Appends `--port` and the corresponding `port` value if `target`.`port` is set.

## Known Limitations

- Requires ELF files built with GCC and DWARF5 debug information to operate seamlessly.

## Trademarks

Arm and Cortex are registered trademarks of Arm Limited (or its subsidiaries or affiliates) in the US and/or elsewhere.<br>
Windows, Visual Studio Code, VS Code, and the Visual Studio Code icon are trademarks of Microsoft Corporation. All rights reserved.<br>
Mac and macOS are trademarks of Apple Inc., registered in the U.S. and other countries and regions.<br>
Eclipse, CDT, and CDT.cloud are trademarks of Eclipse Foundation, Inc.<br>
SEGGER and J-LINK are registered trademarks of SEGGER Microcontroller GmbH.<br>
Node.js is a registered trademark of the OpenJS Foundation.<br>
GDB and GCC are part of the GNU Project and are maintained by the Free Software Foundation.<br>
