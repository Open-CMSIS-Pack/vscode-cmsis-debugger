declare module 'vscode' {
    export const mockContext: {
        environmentVariableCollection: {
          get: jest.Mock,
          prepend: jest.Mock,
        }
  };
}