# Arm CMSIS Debugger Extension for Visual Studio Code (In Progress)

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
- **Temporary** - should become obsolete with full `*.cbuild-run.yml` support in pyOCD:<br> 
  Make sure to set up your CMSIS Pack installation root folder by one of the following methods:
  - Set your system environment variable `CMSIS_PACK_ROOT`.
  - Add the following to your debug launch configuration
    ```
    "environment": {
      "CMSIS_PACK_ROOT": "</path/to/your/pack/cache>"
    }
    ```

## Segger J-Link Debug Setup

- Install the latest [J-Link Software and Documentation Pack](https://www.segger.com/downloads/jlink/#J-LinkSoftwareAndDocumentationPack) from [Segger](https://www.segger.com/). Ensure all required drivers and host platform specific settings are done.
- Ensure the installation folder is added to your system's `PATH` environment variable. Alternatively, you can add an absolute path to your installation in the debug launch configuration.

## Additional Extension Functionality

This extension contributes additional functionality to more seamlessly integrate the included extensions:
- The pseudo debugger types `cmsis-debug-pyocd` and `cmsis-debug-jlink`. These types allow a more seamless integration into the VS Code IDE. However, these are not full debug adapters but generate debug configurations of type `gdbtarget` which comes with the [CDT GDB Debug Adapter Extension](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.cdt-gdb-vscode).
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

#### CMSIS Debugger (J-Link) - `cmsis-debug-jlink`

The `cmsis-debug-jlink` debugger type allows to add default debug configurations to the workspace's `launch.json` file to debug via GDB and the Segger J-Link GDB server. The actually used debugger type is `gdbtarget`.

**Note**: The generated default debug configuration uses `JLinkGDBServer` as `target`.`server` setting. The executable with this name has slightly differing behavior depending on your host platform. It launches a GUI-less server on Linux and MacOS. Whereas a GDB server with GUI is launched on Windows. Please change the value to `JLinkGDBServerCL` to suppress the GUI on Windows.

## Trademarks
Visual Studio is a trademark of the Microsoft group of companies.
TODO: Review other things to be mentioned here.
