# Start debugging

There are two ways to start a debug session:

1. In the **CMSIS view** ![CMSIS view](./images/cmsis-view-icon.png), click on the **Debug** icon
   ![Debug icon in the CMSIS view](./images/debug-icon.png). Depending on the number of configurations in your `launch.json`
   file, you will be asked to select a configuration for the debug session.

2. In the **Run and debug view** ![Run and debug view](./images/run-debug-view-icon.png), click the **Play** icon
   next to the selected debug connection ![Play button](./images/play-debug-button.png). The debug starts with the selected
   configuration.

The debugger loads the application program and executes the startup code. When program execution stops (by default at `main`),
the source code opens at the next executable statement which is marked with a yellow arrow in the editor:

![Execution stopped at main](./images/stop-at-main.png)

Most editor features are available in debug mode. For example, developers can use the Find command and can correct program
errors.

## Flash and run

If you do not wish to enter a debug session, you can issue a flash download only, followed by a reset of the device.

In the **CMSIS view** ![CMSIS view](./images/cmsis-view-icon.png), click on the **Run** icon
![Run icon in the CMSIS view](./images/run-icon.png).
