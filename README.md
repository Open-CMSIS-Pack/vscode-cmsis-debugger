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

All debug setups require a GDB installation that supports the GDB remote protocol and can connect to a GDB server like pyOCD.

We recommend to install the `GCC compiler for ARM CPUs` using the `Arm Tools Environment Manager` extension.<br>
It comes with `arm-none-eabi-gdb` which is used in the Arm CMSIS Debugger default debug configurations.

### pyOCD Debug Setup

This extension includes a pyOCD distribution which is used by default.

Update your debug configuration's `target`>`server` setting to use a different pyOCD installation. Enter the full path to its `pyocd` executable (including the file name).

### SEGGER® J-LINK® Debug Setup

Install the latest [J-LINK Software and Documentation Pack](https://www.segger.com/downloads/jlink/#J-LinkSoftwareAndDocumentationPack) from [SEGGER](https://www.segger.com/). Ensure all required drivers and host platform specific settings are done.

The extension expects the installation folder to be on your system `PATH` environment variable.<br>
Alternatively, update your debug configuration's `target`>`server` setting to contain the full path to the J-LINK GDB server executable (including the file name).

## Extension Functionality

This extension contributes additional functionality to more seamlessly integrate the included extensions:

- The pseudo debugger types `cmsis-debug-pyocd` and `cmsis-debug-jlink`. These types allow a more seamless integration into your IDE. However, these are not full debug adapters but generate debug configurations of type `gdbtarget` which comes with the [CDT GDB Debug Adapter Extension](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.cdt-gdb-vscode).
- A [debug configuration provider](https://code.visualstudio.com/api/references/vscode-api#DebugConfigurationProvider) for the type `gdbtarget` which comes with the [CDT GDB Debug Adapter Extension](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.cdt-gdb-vscode). This provider automatically fills in default values for known remote GDB servers when launching a debug session.
- CMSIS specific launch configuration items for the `*` debugger type, i.e. visible for all debugger types. It depends on the actually used debug adapter type if this information is known and utilized.

### Pseudo Debugger Types

This section describes the contributed pseudo debugger types and their support through the contributed debug configuration provider for type `gdbtarget`.

#### CMSIS Debugger (pyOCD) - `cmsis-debug-pyocd`

The `cmsis-debug-pyocd` debugger type allows to add default debug configurations to the workspace's `launch.json` file for debug with GDB and pyOCD.<br>
Those configurations then use the `gdbtarget` debugger type registered by the CDT GDB Debug Adapter Extension.

Additionaly, the extension contributes a debug configuration resolver which automatically fills the following gaps during debug launch:

- If option `target`>`server` is set to `pyocd`, then it expands to the absolute path of the built-in pyOCD distribution.
- Extends the `target`>`serverParameters` list of `pyocd` command line arguments:
  - Prepends `gdbserver` if not present.
  - Appends `--port <gdbserver_port>` if the `target`>`port` setting is set, where `<gdbserver_port>` gets that port setting's value.
  - Appends `--cbuild-run` and the corresponding `cbuildRunFile` path if `cmsis`>`cbuildRunFile` is set.

**Note**: The built-in version of pyOCD supports the command line option `--cbuild-run`. However, this is a new option which isn't contained yet in releases outside this extension.

#### CMSIS Debugger (J-LINK) - `cmsis-debug-jlink`

The `cmsis-debug-jlink` debugger type allows to add default debug configurations to the workspace's `launch.json` file for debug with GDB and the SEGGER J-LINK GDB server.<br>
Those configurations then use the `gdbtarget` debugger type registered by the CDT GDB Debug Adapter Extension.

**Note**: The generated default debug configuration uses the value `JLinkGDBServer` as `target`>`server` setting. This executable has differing behavior on supported host platform:
* Linux and macOS: A GUI-less version of the GDB server is launched.
* Windows®: A GDB server with GUI is launched. Update `target`>`server` to `JLinkGDBServerCL` to launch a GUI-less version on Windows, too.

Additionaly, the extension contributes a debug configuration resolver which automatically fills the following gaps during debug launch:

- Extends the `target`>`serverParameters` list of `JLinkGDBServer`/`JLinkGDBServerCL` command line arguments:
  - Appends `--port <gdbserver_port>` if the `target`>`port` setting is set, where `<gdbserver_port>` gets that port setting's value.

## Known Limitations and Workarounds

### pyOCD fails to load `*.cbuild-run.yml` in the default configuration

When I use the default debug configuration for pyOCD, I get errors that pyOCD cannot find the solutions `*.cbuild-run.yml` file.

**Possible Reasons**:

1. The application's CSolution was initially built with a CMSIS-Toolbox version prior to v2.8.0 which is the first version to generate `*.cbuild-run.yml` files.
1. You are using an [Arm CMSIS Solution](https://marketplace.visualstudio.com/items?itemName=Arm.cmsis-csolution) prior to v1.52.0 which is the first version to fully support the `${command:cmsis-csolution.getCbuildRunFile}` command.

**Workarounds/Solutions**:

1. Update the CMSIS Toolbox to the latest version. Additionally, you may have to run `cbuild setup --update-rte` in a terminal for a first-time generation of `*.cbuild-run.yml` file in an existing workspace.
1. Update to Arm CMSIS Solution v1.52.0. Alternatively, replace `${command:cmsis-csolution.getCbuildRunFile}` with the path to the `*.cbuild-run.yml` in your workspace (`cmsis`>`cbuildRunFile` debug configuration setting).

### AXF files built with Arm Compiler 6 toolchain

When I download an AXF file built with Arm Compiler 6 I see the following warning and my application does not execute correctly. This happens regardless of the selected GDB server.
```
warning: Loadable section "RW_RAM0" outside of ELF segments
  in /path/to/my/application.axf
```

**Possible Reason**: `arm-none-eabi-gdb` does not correctly load ELF program segments due to the way that Arm Compiler 6 generates section and program header information when scatterloading is used.

**Workaround**: You can generate a HEX file for the program download, and the ELF file for debug purposes only. The following steps are required if you build a [CSolution](https://open-cmsis-pack.github.io/cmsis-toolbox/build-overview/)-based application with the [CMSIS-Toolbox](https://open-cmsis-pack.github.io/cmsis-toolbox/):

1. Edit the `*.cproject.yml` file(s) of your application.
1. Modify the [`output:type:`](https://open-cmsis-pack.github.io/cmsis-toolbox/YML-Input-Format/#output) node to generate both an `elf` and a `hex` file:
```
  output:
    type:
      - elf
      - hex  
```
1. Build the solution.
1. Keep the default configuration's `program` setting as is.
```
"program": "${command:cmsis-csolution.getBinaryFile}",
```
1. Modify the default debug configuration's `initCommands` list, so that the `load` command gets the relative path to the generated HEX file.
```
            "initCommands": [
                "load ./relative/path/to/my/application.hex",
                "break main"
            ],
```

The debugger then loads the debug information from the ELF file. But uses the HEX file instead of the ELF file for program download.

### `arm-none-eabi-gdb` requires DWARF5 debug information

`arm-none-eabi-gdb` generates the following warnings when I debug ELF files with [DWARF](https://dwarfstd.org/) debug information of standard version 4 and earlier. And the debug illusion seems to be broken in many places.<br>
```
warning: (Internal error: pc 0x8006a18 in read in CU, but not in symtab.)
```

**Possible Reason**: `arm-none-eabi-gdb` works best with DWARF debug information of standard version 5.

**Solution**: Make sure to build your application ELF file with DWARF version 5 debug information. Please refer to your toolchain's user reference manual. This may require updates to all build tools like compiler, assembler, and linker.

## Trademarks

Arm and Cortex are registered trademarks of Arm Limited (or its subsidiaries or affiliates) in the US and/or elsewhere.<br>
Windows, Visual Studio Code, VS Code, and the Visual Studio Code icon are trademarks of Microsoft Corporation. All rights reserved.<br>
Mac and macOS are trademarks of Apple Inc., registered in the U.S. and other countries and regions.<br>
Eclipse, CDT, and CDT.cloud are trademarks of Eclipse Foundation, Inc.<br>
SEGGER and J-LINK are registered trademarks of SEGGER Microcontroller GmbH.<br>
Node.js is a registered trademark of the OpenJS Foundation.<br>
GDB and GCC are part of the GNU Project and are maintained by the Free Software Foundation.<br>
