# Developing this extension

## Prerequisites

- Install **Visual Studio Code®**.
- Install **Node.js®** on your machine and ensure it is on your path.
    - The currently minimum required version is 22.22.2 (LTS).
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
- darwin-arm64 (macOS, Arm, aarch64)

1. Open a terminal and execute the following command to download NPM dependencies and tools, and
   to build the TypeScript code:

    ```sh
    > npm install
    ```

2. Download binary tools

    ```sh
    > npm run download-tools -- [--channel release|nightly] [--target <target>]  [--no-cache]
    ```

    The `--channel` can be used to switch between pinned version read from `package.json` and latest nightly builds, defaults to `release`.

    If no `<target>` is specified the local system's architecture is used by default.

    Downloads use the helper's default package-manager cache unless `--no-cache` is given.
    The helper records the prepared version and target, and replaces each changed tool directory.

3. Package the extension as a locally installable VSIX file:

    ```sh
    > npm run package [--target <target>]
    ```

## Selecting bundled tools

`package.json` contains fixed release pins only. `download-tools` defaults to the
`release` channel and uses `vsce-helper` release assets with those exact versions.
Packaging consumes the tools already prepared in the workspace.

```sh
npm run download-tools -- --channel release --target linux-x64
npm run package -- --target linux-x64 --out ./bundle.vsix
npm run validate-tools -- --target linux-x64 --vsix ./bundle.vsix --structural
```

The `nightly` channel selects the latest successful run of each configured workflow
on `main` that has a matching, unexpired platform artifact. It does not compare
versions, commits or timestamps with the pinned release. A missing nightly artifact
falls back to that release. API, authentication and extraction errors remain errors.
GDB always uses its pinned release.

```sh
npm run download-tools -- --channel nightly --target linux-x64
npm run download-tools -- --channel pr --ctrace-pr 123 --target linux-x64
```

| Tool | Nightly workflow (`main`) | PR workflow |
| --- | --- | --- |
| pyOCD | `nightly.yaml` | `nightly.yaml` |
| pyTS | `ci.yml` | `ci.yml` |
| ctrace (devtools) | `nightly.yml` | `ctrace.yml` |

For PR selection, specify `--pyocd-pr`, `--pyts-pr` or `--ctrace-pr`. The selected
workflow must have a successful run associated with that open PR's current head,
or a dispatched run at the same head in its source repository. Other tools use
nightly selection. Explicit PR overrides never fall back to a release. The `pr`
channel requires at least one PR number; the `nightly` channel also accepts overrides.
In particular, pyOCD PRs need executable artifacts from its selected workflow;
ordinary pytest reports are insufficient.

PR CI automatically selects dependency PRs linked in the PR description. Add full
HTTPS links such as `https://github.com/Open-CMSIS-Pack/pyTS/pull/123` for pyTS,
`https://github.com/pyocd/pyOCD/pull/123` for pyOCD, or
`https://github.com/Open-CMSIS-Pack/devtools/pull/123` for ctrace. GitHub shorthand
references such as `Open-CMSIS-Pack/pyTS#71` are also supported. Only repositories
configured in the release pins are considered. Repeated links to the same PR are
accepted; links to different PRs of one tool produce a warning and use nightly
selection for that tool. Unique PR links for other tools still apply. Editing the
PR description starts CI again. PR comments are not inspected. Manual workflow
dispatch continues to accept explicit PR numbers.

The same `Downloadable` and archive wrappers handle every channel. Download,
cache, version/target markers and directory replacement are provided by
`@open-cmsis-pack/vsce-helper`. Workflow cache identities include run, attempt
and artifact IDs. pyTS raw and ZIP-wrapped archives are supported. ctrace
workflow binaries receive licenses from that run's source and pinned submodules.
The selected platform is resolved independently; a complete five-platform matrix
is not required to use an available artifact.

Tools may also be selected positionally, for example `download-tools -- pyts`.
Use `--force` to replace prepared tools even if their version/target markers match,
`--no-cache` to disable the download cache, and `--dest <directory>` to prepare a
separate workspace. For a clean release bundle, prepare all tools in release mode.
PR CI without unique dependency links and nightly CI use nightly selection;
release CI uses release mode.

`--structural` validates layout, executable permissions and licenses without
running a dependency binary. Otherwise the validator runs native version checks
where possible. Structural checks alone do not prove execution on another platform.

## Release versioning

This repository follows the VS Code Marketplace pre-release recommendation:

- **Odd** minor versions (`x.1.z`, `x.3.z`, ...) are pre-releases.
- **Even** minor versions (`x.0.z`, `x.2.z`, ...) are full releases.

To enforce this consistently, both packaging and publishing use `scripts/vsce-release.js`, which:

- checks the current `package.json` version minor value.
- automatically adds `--pre-release` to `vsce package` for odd minor versions.

Use the following commands:

```sh
> npm run package [--target <target>]
```

## Developing

1. If you are developing and debugging this extension, we recommend you run the following command
   after an initial build:

    ```sh
    > npm run watch
    ```

    While just calling `npm install` creates a production build of the extension, running the above
    creates a build dedicated for debug. Additionally, it sets up a watch which detects code
    changes and rebuilds them incrementally.

2. Switch to the VS Code® `Run and Debug` view.

3. Select and run `Desktop Extension`. This launches an extension host that runs this extension.

## Testing

1. Run the following command to execute all test locally:

    ```sh
    > npm run test
    ```

    Jest includes deterministic tool source selection and archive security tests.

## 'all' script

To simplify setup of you environment, an `all` script exists which runs build, tool download,
and unit tests. Run:

```sh
> npm run all
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
    npm run lint:md
````

This command checks Markdown files against the linting rules defined in the
[markdownlint.jsonc](./.github/markdownlint.jsonc) configuration file.

Any formatting issues or deviations from the defined standards will be reported in the console. Addressing these helps
maintain high-quality, readable, and standardized documentation across the project.

> Tip: Simple rule violations can be fixed by the linter itself. Try running the following before manually going through all warnings/errors:
>
> ```bash
>     npm run lint:md --fix
> ````

Additionally, if your changes involve updating or adding links within the documentation, you can verify the validity
of all links by running:

```bash
    npm run check:links
````

This will check each link to ensure it is reachable (i.e., returns a 200 OK status). Identifying and correcting broken
links contributes to a better reader experience and ensures long-term reliability of the documentation.
