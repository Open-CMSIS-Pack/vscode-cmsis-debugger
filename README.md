# Arm CMSIS Debugger Extension for Visual Studio Code

The Arm CMSIS Debugger extension for Visual Studio Code is an extension pack demonstrating how to combine technologies from various open source projects to create a comprehensive debug platform for Arm based IoT solutions. 

Related open source projects are
- [Open-CMSIS-Pack](https://www.open-cmsis-pack.org/) of which this extension is part of.
- [Eclipse CDT Cloud](https://eclipse.dev/cdt-cloud/), an open-source project that hosts a number of components and best practices for building customizable web-based C/C++ tools.
- [pyOCD](https://pyocd.io/), a Python based tool and API for debugging, programming, and exploring Arm Cortex microcontrollers.
- [GDB](https://www.sourceware.org/gdb/), the GNU Project debugger.

## The Arm CMSIS Debugger Extension Pack

The Arm CMSIS Debugger extension is actually an [extension pack](https://code.visualstudio.com/api/references/extension-manifest#extension-packs). It allows to install multiple separate extensions together.

## Included Extensions

The following extensions are included in this extension pack:
- [Arm Tools Environment Manager](https://marketplace.visualstudio.com/items?itemName=Arm.environment-manager), an extension that allows to download, install, and manage software development tools using [Microsoft vcpkg](https://vcpkg.io/en/index.html) artifacts.
- [CDT GDB Debug Adapter Extension](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.cdt-gdb-vscode), an Eclipse CDT Cloud extension that supports debugging using gdb and any other debuggers that supports the MI protocol.
- [Memory Inspector](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.memory-inspector), an Eclipse CDT Cloud extension that provides a powerful and configurable memory viewer that works with debug adapters.
- [Peripheral Inspector](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.peripheral-inspector), an Eclipse CDT Cloud extension that provides a CMSIS SVD viewer and works with debug adapters.

## pyOCD Debug Setup

- Install `GCC compiler for ARM CPUs` with the `Arm Tools Environment Manager` to get access to a GDB (`arm-none-eabi-gdb`).

- (Temporary, should become obsolete with full `*.cbuild-run.yml` support in pyOCD)<br> 
  Make sure to set up your CMSIS Pack installation root folder by one of the following methods:
  - Set your system environment variable `CMSIS_PACK_ROOT`.
  - Add the following to your debug launch configuration
    ```
    "environment": {
      "CMSIS_PACK_ROOT": "</path/to/your/pack/cache>"
    }

    ```

## Additional Extension Functionality

This extension contributes additional functionality to more seamlessly integrate the included extensions:
- The pseudo debugger types `cmsis-debug-pyocd` and `cmsis-debug-jlink`. These types allow a more seamless integration into the VS Code IDE. However, these are not full debug adapters but generate debug configurations of type `gdbtarget` which comes with the [CDT GDB Debug Adapter Extension](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.cdt-gdb-vscode).
- A [debug configuration provider](https://code.visualstudio.com/api/references/vscode-api#DebugConfigurationProvider) for the type `gdbtarget` which comes with the [CDT GDB Debug Adapter Extension](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.cdt-gdb-vscode). This provider automatically fills in default values for known remote GDB servers when launching a debug session.
- CMSIS specific launch configuration items for the `*` debugger type, i.e. visible for all debugger types. It depends on the actually used debug adapter type if this information is known and utilized.

### Pseudo Debugger Types

This section describes the contributed pseudo debugger types and their support through the contributed debug configuration provider for type `gdbtarget`.

#### CMSIS Debugger (pyOCD) - `cmsis-debug-pyocd`

TODO:
- Assumed setup and where to find things.
- Automatically filled in values on debug start.

#### CMSIS Debugger (J-Link) - `cmsis-debug-jlink`

TODO:
- Assumed setup and where to find things.
- Automatically filled in values on debug start.

## Trademarks
Visual Studio is a trademark of the Microsoft group of companies.
TODO: Review other things to be mentioned here.