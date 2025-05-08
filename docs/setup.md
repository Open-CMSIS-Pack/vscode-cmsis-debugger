# Setup

This chapter describes how to install the **Arm CMSIS Debugger** extension pack and how to configure the debug
connection for single- and multi-core devices.

## Installation

The **Arm CMSIS Debugger** extension pack includes extensions that you can use to debug CMSIS solution-based projects.

1. In Visual Studio Code, open the **Extensions** view and type `Arm CMSIS Debugger` in the search bar.

2. Click **Install** to start the installation.

## Debug Setup

The debug setup requires a GDB installation supporting the GDB remote protocol and that can connect to a GDB
server like pyOCD.

We recommend installing the [`Arm GNU Toolchain`](https://developer.arm.com/Tools%20and%20Software/GNU%20Toolchain)
using the `Arm Tools Environment Manager` extension. It comes with `arm-none-eabi-gdb` which is used in the Arm
CMSIS Debugger default debug configurations.

### pyOCD Debug Setup

This extension includes a pyOCD distribution which is used by default.

The `cmsis-debug-pyocd` debugger type is used to add a debug configuration in the `launch.json` file for debugging with GDB
and pyOCD. This configuration uses the `gdbtarget` debugger type registered by the CDT GDB Debug Adapter Extension.

If you wish to use a different pyOCD installation, enter the full path to the executable (including the file name) in the
`target`>`server` setting in the `launch.json` configuration file.

### SEGGER® J-LINK® Debug Setup

Install the latest [J-LINK Software and Documentation Pack](https://www.segger.com/downloads/jlink/#J-LinkSoftwareAndDocumentationPack)
from [SEGGER](https://www.segger.com/). Ensure all required drivers and host platform specific settings are done.

The extension expects the installation folder to be on your system `PATH` environment variable. Alternatively, update your
debug configuration's `target`>`server` setting to contain the full path to the J-LINK GDB server executable
(including the file name).

The `cmsis-debug-jlink` debugger type is used to add a debug configuration in the `launch.json` file for debug with GDB and
the SEGGER J-LINK GDB server. This configuration uses the `gdbtarget` debugger type registered by the CDT GDB Debug Adapter
Extension.

## Project setup

To be able to use the GNU Debugger under the hood, you need to make sure that the project build process creates the right
binary files in the correct formats. Thus, you need to amend your project's `*.csolution.yml` and `*.cproject.yml` files.

- Make sure that the [ELF](https://developer.arm.com/documentation/dui0101/latest/) file is written using the
  [DWARF Version 5](https://dwarfstd.org/dwarf5std.html) format. For example, when generated with the
  [Arm Compiler for Embedded](https://developer.arm.com/Tools%20and%20Software/Arm%20Compiler%20for%20Embedded), add the
  following to your `*.csolution.yml` file (before the `projects:` section for example):

```yml
  misc:
    - for-compiler: AC6
      C-CPP:
        - -gdwarf-5
      ASM:
        - -gdwarf-5
      Link:
        - --entry=Reset_Handler
```

!!! Note
    For other toolchains, please consult the reference manual on how to generate DWARF Version 5 formatted ELF files.

- In addition to generating an ELF file, you also need to create a [HEX](https://developer.arm.com/documentation/ka003292/latest/)
  file that will be used to flash the firmware image. Add the following to any of your `*.cproject.yml` files
  (at the end of the file):

```yml
  output:
    type:
    - elf
    - hex
```
