# Developing this extension

## Prerequisites

- Install **Visual Studio Code®**.
- Install **Node.js®** on your machine and ensure it is on your path.
  - The currently recommended version is 20.x (LTS).
- Install **Yarn** which is used to build and execute scripts in this repository:

  ```sh
  > npm install -g yarn
  ```

## Building

Major parts are platform independent but due to the inclusion of binary tools the resulting
packages become platform-specific, i.e. for on `<target>`.

Supported `<target>`s are:

- win32-x64 (Windows®, x86-64)
- win32-arm64 (Windows, Arm®, aarch64)
- linux-x64 (Linux, x86-64)
- linux-arm64 (Linux, Arm, aarch64)
- darwin-x64 (macOS, x86-64)
- darwin-arm64 (macOS, Arm, aarch64)

1. Open a terminal and execute the following command to download NPM dependencies and tools, and
   to build the TypeScript code:

    ```sh
    > yarn
    ```

2. Download binary tools

    ```sh
    > yarn download-tools [--target <target>] [--no-cache]
    ```

    If no `<target>` is specified the local system's architecture is used by default.
    By default, tool downloads are cached in the yarn cache (see `yarn cache dir`) to prevent
    recurring downloads of exact same archives on clean builds.

3. Package the extension as a locally installable VSIX file:

    ```sh
    > yarn package [--target <target>]
    ```

## Developing

1. If you are developing and debugging this extension, we recommend you run the following command
   after an initial build:

    ```sh
    > yarn watch
    ```

    While just calling `yarn` creates a production build of the extension, running the above
    creates a build dedicated for debug. Additionally, it sets up a watch which detects code
    changes and rebuilds them incrementally.

2. Switch to the VS Code® `Run and Debug` view.

3. Select and run `Desktop Extension`. This launches an extension host that runs this extension.

## Testing

1. Run the following command to execute all test locally:

    ```sh
    > yarn test
    ```

    **Note**: At this point, no tests have been added to this repository.

## Updating tool dependencies

Tool dependencies are recorded in `package.json`:

```json
  "cmsis": {
    "<tool>": "[<owner>/<repo>@]<version>"
  }
````

The `<version>` must match the tools release version tag.
