# Developing this extension

## Prerequisites
- Install **Visual Studio Code**.
- Install **Node.js** on your machine and ensure it is on your path.
  - The currently recommended version is 20.x (LTS).
- Install **Yarn** which is used to build and execute scripts in this repository:
```
> npm install -g yarn
```

## Building

1. Open a terminal and execute the following command to download NPM dependencies and tools, and to build the Typescript code:
```
> yarn
```

2. Package the extension as a locally installable VSIX file:
```
> yarn package
```

## Developing

1. If you are developing and debugging this extension, we recommend you run the following command after an initial build:
```
> yarn watch
```
While just calling `yarn` creates a production build of the extension, running the above creates a build dedicated for debug. Additionally, it sets up a watch which detects code changes and rebuilds them incrementally.

2. Switch to the VS Code `Run and Debug` view.
3. Select and run `Desktop Extension`. This launches an extension host that runs this extension.

## Testing

1. Run the following command to execute all test locally:
```
> yarn test
```

**Note**: At this point, no tests have been added to this repository.
