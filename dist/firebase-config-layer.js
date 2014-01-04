(function() {
  var URL, cached_client, config_command, config_from_firebase, fs, get_value, path, resolve_config, resolve_config_value, vm;

  vm = require('vm');

  fs = require('fs');

  URL = require('url');

  path = require('path');

  get_value = function(obj, key) {
    var k, _i, _len, _ref;
    _ref = key.split('.');
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      k = _ref[_i];
      if (obj == null) {
        return null;
      }
      obj = obj[k];
    }
    return obj;
  };

  resolve_config_value = function(config, value) {
    var parse;
    if (value == null) {
      return null;
    }
    parse = function(v) {
      var c, cfg_v, ctx, o, res, str, x, _i, _ref;
      v = v.toString().split('');
      ctx = [];
      res = '';
      for (x = _i = 0, _ref = v.length; 0 <= _ref ? _i < _ref : _i > _ref; x = 0 <= _ref ? ++_i : --_i) {
        res += v[x];
        if (v[x] === '{' && x > 0) {
          switch (v[x - 1]) {
            case '$':
              ctx.push({
                type: 'var',
                start: x - 1
              });
              break;
            case '#':
              ctx.push({
                type: 'exec',
                start: x - 1
              });
          }
        } else if (v[x] === '}' && ctx.length > 0) {
          c = ctx.pop();
          str = res.slice(c.start + 2, -1);
          o = (function() {
            switch (c.type) {
              case 'var':
                cfg_v = get_value(config, str);
                if (cfg_v != null) {
                  return resolve_config_value(config, cfg_v);
                } else {
                  return process.env[str];
                }
                break;
              case 'exec':
                return vm.runInNewContext(str, {
                  process: process
                });
            }
          })();
          res = res.slice(0, c.start) + o;
        }
      }
      return res;
    };
    return parse(value);
  };

  resolve_config = function(config, root_config) {
    if (root_config == null) {
      root_config = config;
    }
    if (Array.isArray(config)) {
      return config;
    }
    if (typeof config === 'string') {
      return resolve_config_value(root_config, config);
    }
    if (typeof config !== 'object') {
      return config;
    }
    return Object.keys(config).reduce(function(o, key) {
      o[key] = resolve_config(config[key], root_config);
      return o;
    }, {});
  };

  config_from_firebase = function(app) {
    return function(done) {
      return module.exports.environment(app.environment).get(true, function(err, config) {
        if (err != null) {
          return done(err);
        }
        app.config = config;
        return done();
      });
    };
  };

  config_command = function(app) {
    return function(done) {
      return app.execute('init', function() {
        console.log(JSON.stringify(app.config, null, 2));
        return done();
      });
    };
  };

  module.exports = function(app) {
    if (process.env.FIREBASE_CONFIG_URL == null) {
      throw new Error('To use firebase-config-layer you must define the FIREBASE_CONFIG_URL environment variable.');
    }
    app.sequence('init').insert('config', config_from_firebase(app), {
      replace: 'config'
    });
    app.commandline.commands.config = config_command(app);
    app.commandline.commands.config.help = 'config';
    return app.commandline.commands.config.description = 'Print out the config and exit';
  };

  cached_client = null;

  module.exports.get_client = function(cb) {
    var Firebase, auth, new_client, parsed_url;
    if (cached_client != null) {
      return cb(null, cached_client);
    }
    Firebase = require('firebase');
    parsed_url = URL.parse(process.env.FIREBASE_CONFIG_URL);
    auth = parsed_url.auth;
    delete parsed_url.auth;
    new_client = new Firebase(URL.format(parsed_url));
    if (auth == null) {
      cached_client = new_client;
      return cb(null, cached_client);
    }
    return new_client.auth(auth.split(':')[1], function(err, auth_data) {
      if (err != null) {
        return cb(err);
      }
      cached_client = new_client;
      return cb(null, cached_client);
    });
  };

  module.exports.environments = {
    list: function(cb) {
      return module.exports.get_client(function(err, client) {
        if (err != null) {
          return cb(err);
        }
        return client.once('value', function(ref) {
          return cb(null, Object.keys(ref.val() || {}));
        });
      });
    }
  };

  module.exports.environment = function(env) {
    var get_data;
    get_data = function(cb) {
      var config_file, err;
      if (env === 'local') {
        config_file = path.join(process.cwd(), 'config.json');
        if (!fs.existsSync(config_file)) {
          return cb(new Error('Could not find ' + config_file));
        }
        try {
          return cb(null, JSON.parse(fs.readFileSync(config_file).toString()));
        } catch (_error) {
          err = _error;
          return cb(err);
        }
      } else {
        return module.exports.get_client(function(err, client) {
          if (err != null) {
            return cb(err);
          }
          return client.child(env).once('value', function(ref) {
            return cb(null, ref.val());
          });
        });
      }
    };
    return {
      get: function(should_resolve, cb) {
        if (typeof should_resolve === 'function') {
          cb = should_resolve;
          should_resolve = false;
        }
        return get_data(function(err, config) {
          if (err != null) {
            return cb(err);
          }
          if (should_resolve === false) {
            return cb(null, config);
          }
          return cb(null, resolve_config(config));
        });
      }
    };
  };

}).call(this);
