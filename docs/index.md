# Arm CMSIS Debugger extension

The **Arm CMSIS Debugger** extension pack available in Visual Studio Code provides tools to debug projects built with
the [CMSIS-Toolbox](https://open-cmsis-pack.github.io/cmsis-toolbox/). It contains a set of extensions that are
required to create the debug environment and is shipped with [pyOCD](https://pyocd.io/) and a GDB frontend.

The following extensions are included in this extension pack:

- [CDT™ GDB Debug Adapter Extension](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.cdt-gdb-vscode),
an Eclipse CDT.cloud extension that supports debugging using GDB and any other debuggers that support the MI protocol.

- [Memory Inspector](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.memory-inspector),
an Eclipse CDT.cloud extension that provides a powerful and configurable memory viewer that works with debug adapters.

- [Peripheral Inspector](https://marketplace.visualstudio.com/items?itemName=eclipse-cdt.peripheral-inspector),
an Eclipse CDT.cloud extension that provides a CMSIS SVD viewer and works with debug adapters.

## Recommended extensions

We recommend installing the following extensions to simplify the user experience:

- [Arm Tools Environment Manager](https://marketplace.visualstudio.com/items?itemName=Arm.environment-manager), an
extension that allows you to download, install, and manage software development tools using
[Microsoft® Vcpkg](https://vcpkg.io/en/index.html) artifacts. For example, use this extension to install the
[Arm GNU Toolchain](https://developer.arm.com/Tools%20and%20Software/GNU%20Toolchain) which comes with a GDB
variant for Arm CPUs.

- [Arm CMSIS Solution](https://marketplace.visualstudio.com/items?itemName=Arm.cmsis-csolution), an extension that is a
graphical user interface for csolution projects that use the
[CMSIS-Toolbox](https://open-cmsis-pack.github.io/cmsis-toolbox/). Use this extension to build your csolution
projects, to generate `*.cbuild-run.yml` debug configuration files,
and to make use of contributed commands in your debug launch configurations.

## Supported debug probes

The **Arm CMSIS Debugger** extension pack supports a wide range of debug probes:

- [CMSIS-DAP v2.x](https://arm-software.github.io/CMSIS-DAP/latest/).

- [STMicroelectronics ST-LINK/V2/V3](https://www.st.com/en/development-tools/hardware-debugger-and-programmer-tools-for-stm32/products.html).

- [Segger J-Link](https://www.segger.com/products/debug-probes/j-link/).

- debug probes with a compatible GDB server interface.

## Multi-core debugging

The Arm CMSIS Debugger is capable of multi-core debugging. You can
[create a debug configuration](./configure.md#create-a-launch-configuration) for multiple target cores to be debugged within
a single VS Code session using the same debug adapter, provided the adapter and target support concurrent multi-core
debugging.

## Contents

- [**Setup**](setup.md) explains how to install the CMSIS Debugger extension and related debug components.

- [**Create launch configuration**](configure.md) shows how to set up the debugger for single- and multi-core devices.

- [**Start debugging**](./debug.md) demonstrates how to enter the VS Code debugger.

- [**Debug views**](./debug_views.md) provide access to code execution and device peripherals.

## Revision history

Version            | Description
:------------------|:-------------------------
0.1.1              | Release for the Arm CMSIS Debugger extension version 0.1.1
0.1.0              | Initial release for the Arm CMSIS Debugger extension version 0.1.0
