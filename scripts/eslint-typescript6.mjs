import { registerHooks } from 'node:module';

// typescript-eslint 8 loads the `typescript` package and rejects TypeScript 7's API.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'typescript') {
      return nextResolve('@typescript/typescript6', context);
    }
    return nextResolve(specifier, context);
  },
});
