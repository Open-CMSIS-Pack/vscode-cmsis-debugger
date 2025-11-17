# Developing this extension

## Prerequisites

- Install **Visual Studio Code®**.
- Install **Node.js®** on your machine and ensure it is on your path.
    - The currently minimum required version is 20.19.x (LTS).
- Install **Yarn** which is used to build and execute scripts in this repository:

  ```sh
  > npm install -g yarn
  ```

- Point npm to GitHub Package registry via `~/npmrc`:
  
  ```txt
  @open-cmsis-pack:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
  ```

  And ensure your GitHub token is present in your environment's
  `GITHUB_TOKEN` variable.

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

## 'all' script

To simplify setup of you environment, an `all` script exists which runs build, tool download,
and unit tests. Run:

```sh
> yarn all
```

## Updating tool dependencies

Tool dependencies are recorded in `package.json`:

```json
  "cmsis": {
    "<tool>": "[<owner>/<repo>@]<version>"
  }
````

The `<version>` must match the tools release version tag.

## Updating documentation

Contributors who make changes to the documentation are encouraged to validate their updates using the
Markdown linter to ensure consistency and adherence to the project's formatting standards.

Run the following command from the project root:

```bash
    yarn lint:md
````

This command checks Markdown files against the linting rules defined in the
[markdownlint.jsonc](./.github/markdownlint.jsonc) configuration file.

Any formatting issues or deviations from the defined standards will be reported in the console. Addressing these helps
maintain high-quality, readable, and standardized documentation across the project.

> Tip: Simple rule violations can be fixed by the linter itself. Try running the following before manually going through all warnings/errors:
>
> ```bash
>     yarn lint:md --fix
> ````

Additionally, if your changes involve updating or adding links within the documentation, you can verify the validity
of all links by running:

```bash
    yarn check:links
````

This will check each link to ensure it is reachable (i.e., returns a 200 OK status). Identifying and correcting broken
links contributes to a better reader experience and ensures long-term reliability of the documentation.
