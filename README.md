# firebase-config-layer

Firebase config loader for [layer-cake](https://npmjs.org/package/layer-cake)

## Usage

Install the npm module.

```bash
$ npm install --save firebase-config-layer
```

Set the environment variable `FIREBASE_CONFIG_URL` to the root of the firebase you want to load environments from.

## Environments

`firebase-config-layer` uses `NODE_ENV` to determine the environment to load.
