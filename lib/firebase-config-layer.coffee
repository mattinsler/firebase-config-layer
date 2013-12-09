vm = require 'vm'
URL = require 'url'

get_value = (obj, key) ->
  for k in key.split('.')
    return null unless obj?
    obj = obj[k]
  obj

resolve_config_value = (config, value) ->
  return null unless value?
  
  parse = (v) ->
    v = v.toString().split('')
  
    ctx = []
    res = ''
    for x in [0...v.length]
      res += v[x]
      
      if v[x] is '{' and x > 0
        switch v[x - 1]
          when '$' then ctx.push(type: 'var',  start: x - 1)
          when '#' then ctx.push(type: 'exec', start: x - 1)
      else if v[x] is '}' and ctx.length > 0
        c = ctx.pop()
        str = res.slice(c.start + 2, -1)
        
        o = switch c.type
          when 'var'            
            cfg_v = get_value(config, str)
            if cfg_v? then resolve_config_value(config, cfg_v) else process.env[str]
          when 'exec'
            vm.runInNewContext(str, {})
        
        res = res.slice(0, c.start) + o
    
    res
  
  parse(value)

resolve_config = (config, root_config = {}) ->
  return config if Array.isArray(config)
  return resolve_config_value(root_config, config) if typeof config is 'string'
  return config unless typeof config is 'object'
  
  Object.keys(config).reduce (o, key) ->
    o[key] = resolve_config(config[key], root_config)
    o
  , {}

config_from_firebase = (app) ->
  (done) ->
    module.exports.environment(app.environment).get true, (err, config) ->
      return done(err) if err?
      app.config = config
      done()

config_command = (app) ->
  (done) ->
    app.execute 'init', ->
      console.log JSON.stringify(app.config, null, 2)
      done()

module.exports = (app) ->
  throw new Error('To use firebase-config-layer you must define the FIREBASE_CONFIG_URL environment variable.') unless process.env.FIREBASE_CONFIG_URL?
  
  app.sequence('init').insert(
    'config',
    config_from_firebase(app), replace: 'config'
  )
  
  app.commandline.commands.config = config_command(app)
  app.commandline.commands.config.help = 'config'
  app.commandline.commands.config.description = 'Print out the config and exit'

cached_client = null
module.exports.get_client = (cb) ->
  return cb(null, cached_client) if cached_client?
  
  Firebase = require 'firebase'
  
  parsed_url = URL.parse(process.env.FIREBASE_CONFIG_URL)
  auth = parsed_url.auth
  delete parsed_url.auth
  
  new_client = new Firebase(URL.format(parsed_url))
  unless auth?
    cached_client = new_client
    return cb(null, cached_client)
  
  new_client.auth auth.split(':')[1], (err, auth_data) ->
    return cb(err) if err?
    cached_client = new_client
    cb(null, cached_client)

module.exports.environments =
  list: (cb) ->
    module.exports.get_client (err, client) ->
      return cb(err) if err?
      client.once 'value', (ref) ->
        cb(null, Object.keys(ref.val() or {}))

module.exports.environment = (env) ->
  {
    get: (key, should_resolve, cb) ->
      module.exports.get_client (err, client) ->
        return cb(err) if err?
        
        # get(callback)
        if typeof key is 'function'
          client.child(env).once 'value', (ref) ->
            key(null, ref.val())
      
        # get(should_resolve, callback)
        else if typeof key is 'boolean' and typeof should_resolve is 'function'
          module.exports.environment(env).get (err, config) ->
            return should_resolve(err) if err?
            return should_resolve(null, config) if key is false
            
            should_resolve(null, resolve_config(config))
      
        # # get(key, callback)
        # else if typeof key is 'string' and typeof should_resolve is 'function'
        #   module.exports.client.hget(env, key, should_resolve)
        #       
        # # get(key, should_resolve, callback)
        # else if typeof key is 'string' and typeof should_resolve is 'boolean' and typeof cb is 'function'
        #   return module.exports.client.hget(env, key, cb) if should_resolve is false
        #   @get true, (err, config) ->
        #     return cb(err) if err?
        #     cb(null, config[key])
    
    # set: (k, v, cb) ->
    #   module.exports.get_client (err, client) ->
    #     return cb(err) if err?
    #     
    #     # set({key: value}, callback)
    #     if typeof k is 'object' and typeof v is 'function' and not cb?
    #       module.exports.client.hmset(env, k, v)
    #     
    #     # set(key, value, callback)
    #     else if typeof k is 'string' and v? and typeof cb is 'function'
    #       module.exports.client.hset(env, k, v, cb)
    # 
    # remove: (key, cb) ->
    #   module.exports.client.hdel(env, key, cb)
  }
